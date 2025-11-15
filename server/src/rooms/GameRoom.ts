import { Room, Client } from '@colyseus/core';
import {
  GameRoomState,
  PlayerState,
  BuildingState,
  UnitState,
  TradeOfferState
} from './GameRoomState.js';
import {
  BuildCommand,
  ResearchCommand,
  CreateTradeOfferCommand,
  AcceptTradeOfferCommand,
  MoveUnitCommand,
  // RecruitUnitCommand,
  BUILDING_DEFINITIONS,
  UNIT_DEFINITIONS,
  STARTING_RESOURCES,
  STARTING_STORAGE_CAPACITY,
  TECHNOLOGY_DEFINITIONS,
  BIOME_DEFINITIONS,
  hexToKey,
  hexLine,
  HexCoord,
  findPath
} from '@hex-kingdom/shared';
import { ChunkManager } from '../database/ChunkManager.js';
import { PostgresManager } from '../database/PostgresManager.js';
import { RedisSessionManager } from '../database/RedisSessionManager.js';

// ⏱️ TIME MULTIPLIER - Set this higher in dev mode to speed up all timers
// 1.0 = normal speed, 10.0 = 10x faster, 20.0 = 20x faster
const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;
console.log(`⏱️ TIME_MULTIPLIER loaded: ${TIME_MULTIPLIER}x speed`);

// Movement tracking interface
interface MovingUnit {
  unitId: string;
  path: HexCoord[];
  currentTileIndex: number; // Which tile in path we're currently moving to
  startTime: number; // When movement started (ms)
  tileStartTime: number; // When current tile movement started (ms)
  tileDuration: number; // How long current tile takes (ms)
}

const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
];

// Spieler-Konfiguration
const PLAYER_CONFIG = {
  admin: {
    startingTilesRadius: 1,      // 7 Tiles um Spawn
    visionRadius: Infinity,      // Sieht alles
    canRequestAllChunks: true    // Keine Einschränkung
  },
  user: {
    startingTilesRadius: 2,      // 19 Tiles um Spawn (konfigurierbar)
    visionRadius: 2,             // Sieht nur +2 Tiles um eigenes Territorium
    canRequestAllChunks: false   // Nur sichtbare Chunks
  }
};

export class GameRoom extends Room<GameRoomState> {
  maxClients = 10;
  private lastUpdate = Date.now();
  private chunkManager!: ChunkManager; // Für Terrain-Daten (MongoDB)
  private postgres!: PostgresManager; // Für Players, Buildings, TileOwnership (PostgreSQL)
  private redis!: RedisSessionManager; // Für Live-Session-Daten (Redis - führend!)
  private movingUnits: Map<string, MovingUnit> = new Map(); // Track units in motion

  async onCreate(_options: any) {
    this.setState(new GameRoomState());
    this.state.tickRate = 10; // 10 Updates pro Sekunde
    
    // Initialize Databases
    this.chunkManager = new ChunkManager();
    this.postgres = new PostgresManager();
    this.redis = new RedisSessionManager();
    
    await this.chunkManager.connect();
    await this.postgres.connect();
    await this.redis.connect();
    
    // Load initial world data from MongoDB
    await this.initializeWorld();
    
    // Restore active unit movements from database
    await this.restoreActiveMovements();
    
    // Game Loop
    this.setSimulationInterval(() => this.update(), 1000 / this.state.tickRate);
    
    // Message Handlers
    this.onMessage('build', (client, message: BuildCommand) => {
      this.handleBuild(client, message);
    });
    
    this.onMessage('recruitUnit', (client, message) => {
      this.handleRecruitUnit(client, message);
    });
    
    this.onMessage('moveUnit', (client, message: MoveUnitCommand) => {
      this.handleMoveUnit(client, message);
    });
    
    this.onMessage('cancelMovement', (client, message: { unitId: string }) => {
      this.handleCancelMovement(client, message);
    });
    
    this.onMessage('research', (client, message: ResearchCommand) => {
      this.handleResearch(client, message);
    });
    
    this.onMessage('createTradeOffer', (client, message: CreateTradeOfferCommand) => {
      this.handleCreateTradeOffer(client, message);
    });
    
    this.onMessage('acceptTradeOffer', (client, message: AcceptTradeOfferCommand) => {
      this.handleAcceptTradeOffer(client, message);
    });
    
    // Viewport-basiertes Chunk-Loading
    this.onMessage('requestChunks', (client, message: { chunkCoords: Array<{ chunkX: number; chunkY: number }> }) => {
      this.handleRequestChunks(client, message);
    });
    
    console.log(`✅ GameRoom ${this.roomId} erstellt`);
  }

  async onJoin(client: Client, options: any) {
    const player = new PlayerState();
    
    // Verwende username als persistente ID statt sessionId
    const persistentId = options.username || `Player_${client.sessionId.slice(0, 6)}`;
    
    player.id = client.sessionId; // Colyseus sessionId für aktuelle Verbindung
    player.username = persistentId; // Username als persistente ID
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    
    // Bestimme Spieler-Typ (admin oder user)
    const isAdmin = options.username === 'admin';
    (player as any).isAdmin = isAdmin; // Temporär, wird nicht synchronisiert
    
    // Lade Spieler: Redis → PostgreSQL → Neu erstellen
    const redisSession = await this.redis.getPlayerSession(persistentId);
    
    if (redisSession) {
      // Reconnect - lade von Redis (führende DB während Session)
      console.log(`🔄 ${persistentId} reconnect - lade von Redis`);
      player.wood = redisSession.wood;
      player.stone = redisSession.stone;
      player.iron = redisSession.iron;
      player.gold = redisSession.gold;
      player.food = redisSession.food;
      player.fish = redisSession.fish;
      player.storageWood = redisSession.storageWood;
      player.storageStone = redisSession.storageStone;
      player.storageIron = redisSession.storageIron;
      player.storageGold = redisSession.storageGold;
      player.storageFood = redisSession.storageFood;
      player.storageFish = redisSession.storageFish;
      player.currentResearch = redisSession.currentResearch || '';
      
      // Extend Session TTL
      await this.redis.keepPlayerSessionAlive(persistentId);
    } else {
      const existingPlayer = await this.postgres.getPlayer(persistentId);
      
      if (existingPlayer) {
        // Returning Player - lade von PostgreSQL
        console.log(`👤 ${persistentId} returning player - lade von PostgreSQL`);
        player.color = existingPlayer.color;
        
        // Startressourcen für returning player (TODO: später aus separater Resources-Tabelle)
        player.wood = STARTING_RESOURCES.wood;
        player.stone = STARTING_RESOURCES.stone;
        player.iron = STARTING_RESOURCES.iron;
        player.gold = STARTING_RESOURCES.gold;
        player.food = STARTING_RESOURCES.food;
        player.fish = STARTING_RESOURCES.fish;
        
        player.storageWood = STARTING_STORAGE_CAPACITY.wood;
        player.storageStone = STARTING_STORAGE_CAPACITY.stone;
        player.storageIron = STARTING_STORAGE_CAPACITY.iron;
        player.storageGold = STARTING_STORAGE_CAPACITY.gold;
        player.storageFood = STARTING_STORAGE_CAPACITY.food;
        player.storageFish = STARTING_STORAGE_CAPACITY.fish;
        
        // Update lastLogin
        await this.postgres.updatePlayerLogin(persistentId);
      } else {
        // Neuer Spieler - erstelle in PostgreSQL
        console.log(`🆕 Neuer Spieler: ${persistentId}`);
        player.wood = STARTING_RESOURCES.wood;
        player.stone = STARTING_RESOURCES.stone;
        player.iron = STARTING_RESOURCES.iron;
        player.gold = STARTING_RESOURCES.gold;
        player.food = STARTING_RESOURCES.food;
        player.fish = STARTING_RESOURCES.fish;
        
        player.storageWood = STARTING_STORAGE_CAPACITY.wood;
        player.storageStone = STARTING_STORAGE_CAPACITY.stone;
        player.storageIron = STARTING_STORAGE_CAPACITY.iron;
        player.storageGold = STARTING_STORAGE_CAPACITY.gold;
        player.storageFood = STARTING_STORAGE_CAPACITY.food;
        player.storageFish = STARTING_STORAGE_CAPACITY.fish;
        
        // Erstelle Player in PostgreSQL
        try {
          await this.postgres.createPlayer(persistentId, player.color);
          console.log(`✅ Player ${persistentId} erfolgreich in PostgreSQL erstellt`);
        } catch (error) {
          console.error(`❌ Fehler beim Erstellen von Player ${persistentId} in PostgreSQL:`, error);
          throw error;
        }
      }
    }
    
    this.state.players.set(client.sessionId, player);
    
    console.log(`👤 ${player.username} beigetreten (${client.sessionId}) [${isAdmin ? 'Admin' : 'User'}]`);
    
    // Lade Territorium und Gebäude aus PostgreSQL
    let hasTerritory = false;
    try {
      const existingTiles = await this.postgres.getPlayerTiles(persistentId);
      hasTerritory = existingTiles.length > 0;
      
      if (hasTerritory) {
        console.log(`🏠 Spieler hat bereits ${existingTiles.length} Tiles`);
        
        // Setze Owner im RAM für bereits existierende Tiles
        existingTiles.forEach(({ q, r }: { q: number; r: number }) => {
          const key = hexToKey({ q, r });
          const tile = this.state.tiles.get(key);
          if (tile) {
            tile.owner = persistentId;
          }
        });
      }
      
      // Lade Gebäude aus PostgreSQL
      const playerBuildings = await this.postgres.getPlayerBuildings(persistentId);
      console.log(`🔍 Checking for buildings for user '${persistentId}': found ${playerBuildings.length} buildings`);
      
      if (playerBuildings.length > 0) {
        console.log(`🏗️ Lade ${playerBuildings.length} Gebäude für ${player.username}`);
        
        playerBuildings.forEach((dbBuilding: any) => {
          if (this.state.buildings.has(dbBuilding.id)) {
            console.log(`⚠️ Building ${dbBuilding.id} already in state, skipping`);
            return;
          }
          
          const building = new BuildingState();
          building.id = dbBuilding.id;
          building.type = dbBuilding.type;
          building.q = dbBuilding.q;
          building.r = dbBuilding.r;
          building.owner = dbBuilding.owner;
          building.level = dbBuilding.level;
          // Convert timestamps from DB (bigint as string) to number
          building.constructionStartTime = parseInt(dbBuilding.construction_start_time);
          building.constructionEndTime = parseInt(dbBuilding.construction_end_time);
          
          // Berechne aktuellen Progress
          const now = Date.now();
          const endTime = parseInt(dbBuilding.construction_end_time);
          const startTime = parseInt(dbBuilding.construction_start_time);
          if (dbBuilding.completed_at || now >= endTime) {
            building.constructionProgress = 1;
            console.log(`✅ Building ${dbBuilding.id} (${dbBuilding.type}) is completed`);
          } else {
            const totalTime = endTime - startTime;
            const elapsed = now - startTime;
            building.constructionProgress = Math.max(0, Math.min(1, elapsed / totalTime));
            console.log(`🏗️ Building ${dbBuilding.id} (${dbBuilding.type}) in progress: ${(building.constructionProgress * 100).toFixed(1)}%`);
          }
          
          this.state.buildings.set(building.id, building);
        });
        
        console.log(`✅ Total buildings in state after loading: ${this.state.buildings.size}`);
      }

      // Lade Units aus PostgreSQL
      const playerUnits = await this.postgres.getPlayerUnits(persistentId);
      console.log(`🔍 Checking for units for user '${persistentId}': found ${playerUnits.length} units`);

      if (playerUnits.length > 0) {
        console.log(`🎖️ Lade ${playerUnits.length} Units für ${player.username}`);

        playerUnits.forEach((dbUnit: any) => {
          if (this.state.units.has(dbUnit.id)) {
            console.log(`⚠️ Unit ${dbUnit.id} already in state, skipping`);
            return;
          }

          const unit = new UnitState();
          unit.id = dbUnit.id;
          unit.type = dbUnit.type;
          unit.q = dbUnit.q;
          unit.r = dbUnit.r;
          unit.owner = dbUnit.owner;
          unit.health = dbUnit.health;

          this.state.units.set(unit.id, unit);
        });

        console.log(`✅ Total units in state after loading: ${this.state.units.size}`);
      }
      
      // Restore active movements for this player's units
      await this.restorePlayerMovements(persistentId);
    } catch (error) {
      console.error('Fehler beim Laden des Spieler-Territoriums:', error);
    }
    
    // Wenn kein Territorium: Weise neues zu (außer für Admin)
    let spawnPosition = { q: 0, r: 0 };
    if (!hasTerritory && !isAdmin) {
      spawnPosition = await this.assignStartingTerritory(persistentId, isAdmin); // Verwende username
    } else if (hasTerritory) {
      // Berechne Zentrum des existierenden Territoriums
      const tiles = await this.postgres.getPlayerTiles(persistentId);
      if (tiles.length > 0) {
        const avgQ = tiles.reduce((sum: number, t: { q: number; r: number }) => sum + t.q, 0) / tiles.length;
        const avgR = tiles.reduce((sum: number, t: { q: number; r: number }) => sum + t.r, 0) / tiles.length;
        spawnPosition = { q: Math.round(avgQ), r: Math.round(avgR) };
      }
    }
    
    // Sende Spawn-Position an Client für Kamera-Zentrierung
    console.log(`📍 Sende Spawn-Position an ${player.username}:`, spawnPosition);
    client.send('setSpawnPosition', spawnPosition);
    
    // Debug: Zeige wie viele Tiles der Spieler nach join sehen kann
    console.log(`👁️ Total tiles in state: ${this.state.tiles.size}`);
    
    // Debug: Zähle owned tiles
    let ownedCount = 0;
    this.state.tiles.forEach(tile => {
      if (tile.owner === persistentId) ownedCount++;
    });
    console.log(`🏠 Player owns ${ownedCount} tiles immediately after join`);
    
    // Erstelle Redis-Session für Live-Daten
    await this.redis.setPlayerSession({
      username: persistentId,
      sessionId: client.sessionId,
      roomId: this.roomId,
      wood: player.wood,
      stone: player.stone,
      iron: player.iron,
      gold: player.gold,
      food: player.food,
      fish: player.fish,
      storageWood: player.storageWood,
      storageStone: player.storageStone,
      storageIron: player.storageIron,
      storageGold: player.storageGold,
      storageFood: player.storageFood,
      storageFish: player.storageFish,
      currentResearch: player.currentResearch || null,
      researchProgress: 0,
      researchEndTime: player.researchEndTime || 0,
      lastUpdate: Date.now(),
      connectedAt: Date.now()
    });
    console.log(`✅ Redis session created for ${persistentId}`);
    
    // Sende initiale sichtbare + explored Tiles an Client (Fog-of-War)
    await this.sendVisibleAndExploredTilesToClient(client.sessionId, persistentId, isAdmin);
  }
  
  // Sende sichtbare + explored Tiles an einen spezifischen Client (mit Exploration-Tracking)
  private async sendVisibleAndExploredTilesToClient(clientId: string, userId: string, isAdmin: boolean) {
    const visibleTiles: Array<any> = [];
    const exploredTiles: Array<any> = [];
    
    if (isAdmin) {
      // Admin sieht alles (keine Exploration nötig)
      this.state.tiles.forEach((tile, key) => {
        visibleTiles.push({
          key,
          q: tile.q,
          r: tile.r,
          biome: tile.biome,
          fertility: tile.fertility,
          owner: tile.owner,
          resources: tile.resources.map(r => ({ type: r.type, amount: r.amount }))
        });
      });
    } else {
      // User: Berechne Sichtbarkeit basierend auf Biome viewDistance + Units
      const visibleKeys = new Set<string>();
      
      // 1. Sammle alle owned tiles (Kingdom)
      const ownedTiles: Array<{ q: number; r: number; biome: string }> = [];
      this.state.tiles.forEach(tile => {
        if (tile.owner === userId) {
          ownedTiles.push({ q: tile.q, r: tile.r, biome: tile.biome });
          visibleKeys.add(hexToKey({ q: tile.q, r: tile.r }));
        }
      });
      
      // 2. Sammle alle eigenen Units
      const playerUnits: Array<{ q: number; r: number; type: string }> = [];
      this.state.units.forEach(unit => {
        if (unit.owner === userId) {
          const unitTile = this.state.tiles.get(hexToKey({ q: unit.q, r: unit.r }));
          if (unitTile) {
            playerUnits.push({ q: unit.q, r: unit.r, type: unit.type });
          }
        }
      });
      
      // 3. Für jedes owned Tile: Berechne Sichtbarkeit basierend auf viewDistance
      ownedTiles.forEach(owned => {
        // Hole viewDistance des Tiles aus BIOME_DEFINITIONS
        const biomeType = owned.biome as any;
        const biomeViewDistance = this.getBiomeViewDistance(biomeType);
        
        // Mindestens direkte Nachbarn (distance = 1) sind immer sichtbar
        const viewDistance = Math.max(1, biomeViewDistance);
        
        // Berechne sichtbare Tiles im Radius
        this.state.tiles.forEach((tile, key) => {
          const dq = tile.q - owned.q;
          const dr = tile.r - owned.r;
          const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
          
          if (distance <= viewDistance) {
            visibleKeys.add(key);
          }
        });
      });
      
      // 4. Für jede Unit: Berechne Sichtbarkeit basierend auf Unit visionBonus + Biome
      playerUnits.forEach(unit => {
        const unitTile = this.state.tiles.get(hexToKey({ q: unit.q, r: unit.r }));
        if (!unitTile) return;
        
        const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
        const unitVisionBonus = unitDef?.visionBonus || 0;
        
        // Berechne sichtbare Tiles mit Line-of-Sight Check
        this.state.tiles.forEach((tile, key) => {
          if (this.canSeeTile(
            { q: unit.q, r: unit.r },
            unitTile.biome,
            unitVisionBonus,
            { q: tile.q, r: tile.r }
          )) {
            visibleKeys.add(key);
          }
        });
      });
      
      // 5. Lade explored tiles aus DB
      const exploredFromDB = await this.postgres.getExploredTiles(userId);
      const exploredKeys = new Set<string>(
        exploredFromDB.map(t => hexToKey({ q: t.q, r: t.r }))
      );
      
      // 6. Sammle sichtbare Tiles
      visibleKeys.forEach(key => {
        const tile = this.state.tiles.get(key);
        if (tile) {
          visibleTiles.push({
            key,
            q: tile.q,
            r: tile.r,
            biome: tile.biome,
            fertility: tile.fertility,
            owner: tile.owner,
            resources: tile.resources.map(r => ({ type: r.type, amount: r.amount }))
          });
        }
      });
      
      // 5. Sammle explored (aber nicht sichtbare) Tiles
      exploredKeys.forEach(key => {
        if (!visibleKeys.has(key)) {
          const tile = this.state.tiles.get(key);
          if (tile) {
            exploredTiles.push({
              key,
              q: tile.q,
              r: tile.r,
              biome: tile.biome
              // Keine live-Daten (owner, resources) für explored tiles
            });
          }
        }
      });
      
      // 6. Speichere neu sichtbare Tiles als explored
      const tilesToSave = Array.from(visibleKeys).map(key => {
        const [qStr, rStr] = key.split(',');
        return { q: parseInt(qStr), r: parseInt(rStr) };
      });
      
      if (tilesToSave.length > 0) {
        // Async: Speichere in DB (fire & forget)
        this.postgres.addExploredTiles(userId, tilesToSave).catch(err => {
          console.error('Failed to save explored tiles:', err);
        });
      }
    }
    
    console.log(`📤 Sending ${visibleTiles.length} visible + ${exploredTiles.length} explored tiles to client ${clientId}`);
    
    const client = this.clients.find(c => c.sessionId === clientId);
    if (client) {
      client.send('visibleTiles', { tiles: visibleTiles });
      if (exploredTiles.length > 0) {
        client.send('exploredTiles', { tiles: exploredTiles });
      }
    }
  }
  
  // Hilfsfunktion: Hole viewDistance für ein Biom
  private getBiomeViewDistance(biomeType: string): number {
    const biomeDef = BIOME_DEFINITIONS[biomeType as keyof typeof BIOME_DEFINITIONS];
    return biomeDef?.viewDistance ?? 2; // Default: 2 falls Biom unbekannt
  }

  onLeave(client: Client, _consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`👋 ${player.username} hat verlassen`);
      
      // Sync: Redis (führend) → PostgreSQL (persistent backup)
      this.redis.getPlayerSession(player.username).then(async (redisSession: any) => {
        if (redisSession) {
          // Speichere finale Werte aus Redis
          console.log(`💾 Syncing ${player.username}: Redis → PostgreSQL`);
          
          // TODO: Resources-Tabelle in PostgreSQL hinzufügen
          // Aktuell speichern wir nur in Redis (Live) + PostgreSQL (Player)
          
          // Lösche Redis-Session
          await this.redis.deletePlayerSession(player.username);
          console.log(`✅ Redis → PostgreSQL sync completed for ${player.username}`);
        }
      }).catch((err: any) => {
        console.error(`❌ Failed to sync player data for ${player.username}:`, err);
      });
      
      // Speichere Building-States in PostgreSQL
      const playerBuildings = Array.from(this.state.buildings.values()).filter(
        b => b.owner === player.username
      );
      
      if (playerBuildings.length > 0) {
        console.log(`💾 Speichere ${playerBuildings.length} Gebäude für ${player.username}`);
        
        Promise.all(playerBuildings.map(async (building) => {
          try {
            const existing = await this.postgres.getBuildingAtPosition(building.q, building.r);
            
            if (!existing) {
              // Neu erstellen in PostgreSQL
              await this.postgres.createBuilding({
                id: building.id,
                type: building.type,
                q: building.q,
                r: building.r,
                owner: building.owner,
                level: building.level,
                construction_start_time: building.constructionStartTime,
                construction_end_time: building.constructionEndTime
              });
              console.log(`✅ Building ${building.id} saved to PostgreSQL`);
            } else if (building.constructionProgress >= 1 && !existing.completed_at) {
              // Markiere als fertig
              await this.postgres.completeBuilding(building.id);
              console.log(`✅ Building ${building.id} marked as completed`);
            }
          } catch (err: any) {
            console.error(`❌ Failed to save building ${building.id}:`, err);
          }
        })).catch((err: any) => {
          console.error('Failed to save player buildings on leave:', err);
        });
      }

      // Speichere Units in PostgreSQL  
      const playerUnits = Array.from(this.state.units.values()).filter(
        u => u.owner === player.username
      );

      if (playerUnits.length > 0) {
        console.log(`💾 Speichere ${playerUnits.length} Units für ${player.username}`);
        // Units sind bereits in DB, keine weitere Action nötig (werden bei Movement updated)
      }
      
      console.log(`💾 Spieler-Daten für ${player.username} gespeichert`);
      
      // Entferne Spieler aus State
      this.state.players.delete(client.sessionId);
    }
  }

  onDispose() {
    console.log(`🗑️ GameRoom ${this.roomId} geschlossen`);
  }

  // ===========================
  // GAME LOOP
  // ===========================

  private update() {
    const now = Date.now();
    const deltaSeconds = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;
    
    this.state.worldTime += deltaSeconds;
    
    // Update Ressourcen-Produktion
    this.updateProduction(deltaSeconds);
    
    // Update Forschung
    this.updateResearch();
    
    // Update Gebäude-Konstruktion
    this.updateConstruction(deltaSeconds);
    
    // Update unit movements
    this.updateUnitMovements(now);
    
    // Entferne abgelaufene Handelsangebote
    this.cleanupExpiredTradeOffers();
  }

  private updateProduction(deltaSeconds: number) {
    this.state.buildings.forEach((building) => {
      if (building.constructionProgress < 1) return;
      
      const player = this.state.players.get(building.owner);
      if (!player) return;
      
      const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
      if (!def.baseProduction) return;
      
      // Berechne Produktion basierend auf Level
      const productionMultiplier = Math.pow(1.2, building.level - 1);
      
      if (def.baseProduction.wood) {
        player.wood = Math.min(
          player.wood + def.baseProduction.wood * productionMultiplier * deltaSeconds,
          player.storageWood
        );
      }
      if (def.baseProduction.stone) {
        player.stone = Math.min(
          player.stone + def.baseProduction.stone * productionMultiplier * deltaSeconds,
          player.storageStone
        );
      }
      if (def.baseProduction.iron) {
        player.iron = Math.min(
          player.iron + def.baseProduction.iron * productionMultiplier * deltaSeconds,
          player.storageIron
        );
      }
      if (def.baseProduction.food) {
        player.food = Math.min(
          player.food + def.baseProduction.food * productionMultiplier * deltaSeconds,
          player.storageFood
        );
      }
    });
  }

  private updateResearch() {
    this.state.players.forEach((player) => {
      if (!player.currentResearch || player.researchEndTime === 0) return;
      
      if (Date.now() >= player.researchEndTime) {
        player.researchedTechs.push(player.currentResearch);
        player.currentResearch = '';
        player.researchEndTime = 0;
        
        // Broadcast completion (könnte erweitert werden)
        this.broadcast('researchCompleted', {
          playerId: player.id,
          technology: player.currentResearch
        });
      }
    });
  }

  private updateConstruction(_deltaSeconds: number) {
    const now = Date.now();
    
    this.state.buildings.forEach((building) => {
      // Überspringe fertige Gebäude
      if (building.constructionProgress >= 1) return;
      
      // Berechne Progress basierend auf Zeitstempeln
      if (building.constructionEndTime > 0 && building.constructionStartTime > 0) {
        const totalTime = building.constructionEndTime - building.constructionStartTime;
        const elapsed = now - building.constructionStartTime;
        
        if (now >= building.constructionEndTime) {
          // Bau abgeschlossen
          building.constructionProgress = 1;
          console.log(`✅ Building completed: ${building.type} at (${building.q}, ${building.r})`);
          
          this.broadcast('buildingCompleted', {
            buildingId: building.id,
            owner: building.owner
          });
          
          // Async: Persistiere Fertigstellung in DB
          this.persistBuildingCompletion(building).catch(err => {
            console.error('Failed to persist building completion:', err);
          });
        } else {
          // Bau läuft noch
          building.constructionProgress = Math.max(0, Math.min(1, elapsed / totalTime));
        }
      }
    });
  }
  
  private async persistBuildingCompletion(building: BuildingState): Promise<void> {
    await this.postgres.completeBuilding(building.id);
    console.log(`💾 Building ${building.id} completion persisted to database`);
  }

  private cleanupExpiredTradeOffers() {
    const now = Date.now();
    this.state.tradeOffers.forEach((offer, key) => {
      if (offer.expiresAt < now) {
        this.state.tradeOffers.delete(key);
      }
    });
  }

  // ===========================
  // COMMAND HANDLERS
  // ===========================

  private async handleBuild(client: Client, command: BuildCommand) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    
    // Ensure player exists in PostgreSQL before building
    try {
      const dbPlayer = await this.postgres.getPlayer(player.username);
      if (!dbPlayer) {
        console.error(`❌ Player ${player.username} not found in PostgreSQL, creating now...`);
        await this.postgres.createPlayer(player.username, player.color);
        console.log(`✅ Player ${player.username} created in PostgreSQL`);
      }
    } catch (error) {
      console.error(`❌ Failed to verify/create player in PostgreSQL:`, error);
      client.send('error', { message: 'Datenbankfehler beim Erstellen des Spielers' });
      return;
    }
    
    const def = BUILDING_DEFINITIONS[command.buildingType];
    if (!def) return;
    
    // Prüfe Ressourcen
    if (
      (def.baseCost.wood && player.wood < def.baseCost.wood) ||
      (def.baseCost.stone && player.stone < def.baseCost.stone) ||
      (def.baseCost.iron && player.iron < def.baseCost.iron) ||
      (def.baseCost.gold && player.gold < def.baseCost.gold)
    ) {
      client.send('error', { message: 'Nicht genug Ressourcen' });
      return;
    }
    
    // Prüfe ob Feld besetzt ist
    const tileKey = hexToKey(command.position);
    const existingBuilding = Array.from(this.state.buildings.values()).find(
      b => b.q === command.position.q && b.r === command.position.r
    );
    
    if (existingBuilding) {
      client.send('error', { message: 'Feld bereits bebaut' });
      return;
    }
    
    // Prüfe auch in DB ob bereits ein Gebäude existiert
    const existingInDB = await this.postgres.getBuildingAtPosition(command.position.q, command.position.r);
    if (existingInDB) {
      client.send('error', { message: 'Feld bereits bebaut (in DB)' });
      return;
    }
    
    // Kosten abziehen
    if (def.baseCost.wood) player.wood -= def.baseCost.wood;
    if (def.baseCost.stone) player.stone -= def.baseCost.stone;
    if (def.baseCost.iron) player.iron -= def.baseCost.iron;
    if (def.baseCost.gold) player.gold -= def.baseCost.gold;
    
    // Gebäude erstellen mit Zeitstempeln
    const building = new BuildingState();
    building.id = `${player.username}_${Date.now()}`; // Verwende username statt sessionId
    building.type = command.buildingType;
    building.q = command.position.q;
    building.r = command.position.r;
    building.owner = player.username; // Verwende username als Owner
    building.level = 1;
    building.constructionStartTime = Date.now();
    // Apply TIME_MULTIPLIER to construction time
    building.constructionEndTime = Date.now() + ((def.constructionTime * 1000) / TIME_MULTIPLIER);
    building.constructionProgress = 0;
    
    console.log(`🏗️ Building started: ${command.buildingType} at (${command.position.q}, ${command.position.r}), will finish at ${new Date(building.constructionEndTime).toLocaleString()}`);
    
    // WICHTIG: Erst in DB speichern (atomare Transaktion), DANN zum State hinzufügen
    try {
      // Use atomic transaction for building + tile ownership + resource deduction
      await this.postgres.buildBuildingTransaction(
        player.username,
        {
          id: building.id,
          type: building.type,
          q: building.q,
          r: building.r,
          owner: building.owner,
          level: building.level,
          construction_start_time: building.constructionStartTime,
          construction_end_time: building.constructionEndTime
        },
        def.baseCost // Resource cost already deducted from player state
      );
      
      console.log(`✅ Building ${building.id} saved to DB successfully`);
      
      // Nur wenn DB-Speicherung erfolgreich: Füge zum State hinzu
      this.state.buildings.set(building.id, building);
      
      // Markiere Feld als besetzt im RAM
      const tile = this.state.tiles.get(tileKey);
      if (tile) {
        tile.owner = player.username; // Verwende username statt sessionId
      }
    } catch (err) {
      console.error('❌ Failed to save building to DB:', err);
      
      // Gebe Ressourcen zurück wenn DB-Fehler
      if (def.baseCost.wood) player.wood += def.baseCost.wood;
      if (def.baseCost.stone) player.stone += def.baseCost.stone;
      if (def.baseCost.iron) player.iron += def.baseCost.iron;
      if (def.baseCost.gold) player.gold += def.baseCost.gold;
      
      client.send('error', { message: 'Fehler beim Speichern des Gebäudes' });
    }
  }

  private handleResearch(client: Client, command: ResearchCommand) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    
    if (player.currentResearch) {
      client.send('error', { message: 'Bereits eine Forschung aktiv' });
      return;
    }
    
    const tech = TECHNOLOGY_DEFINITIONS[command.technology];
    if (!tech) return;
    
    // Prüfe Voraussetzungen
    for (const prereq of tech.prerequisites) {
      if (!player.researchedTechs.includes(prereq)) {
        client.send('error', { message: 'Voraussetzungen nicht erfüllt' });
        return;
      }
    }
    
    // Prüfe Kosten
    if (
      (tech.cost.wood && player.wood < tech.cost.wood) ||
      (tech.cost.stone && player.stone < tech.cost.stone) ||
      (tech.cost.iron && player.iron < tech.cost.iron) ||
      (tech.cost.gold && player.gold < tech.cost.gold)
    ) {
      client.send('error', { message: 'Nicht genug Ressourcen' });
      return;
    }
    
    // Kosten abziehen
    if (tech.cost.wood) player.wood -= tech.cost.wood;
    if (tech.cost.stone) player.stone -= tech.cost.stone;
    if (tech.cost.iron) player.iron -= tech.cost.iron;
    if (tech.cost.gold) player.gold -= tech.cost.gold;
    
    // Forschung starten - Apply TIME_MULTIPLIER to research time
    player.currentResearch = command.technology;
    player.researchEndTime = Date.now() + ((tech.researchTime * 1000) / TIME_MULTIPLIER);
  }

  private handleCreateTradeOffer(client: Client, command: CreateTradeOfferCommand) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    
    // Prüfe ob Spieler die Ressource hat
    const resourceAmount = player[command.resource as keyof PlayerState] as number;
    if (resourceAmount < command.amount) {
      client.send('error', { message: 'Nicht genug Ressourcen' });
      return;
    }
    
    // Ressourcen reservieren (abziehen)
    (player as any)[command.resource] -= command.amount;
    
    // Angebot erstellen
    const offer = new TradeOfferState();
    offer.id = `${client.sessionId}_${Date.now()}`;
    offer.seller = client.sessionId;
    offer.resource = command.resource;
    offer.amount = command.amount;
    offer.pricePerUnit = command.pricePerUnit;
    offer.expiresAt = Date.now() + 3600000; // 1 Stunde
    
    this.state.tradeOffers.set(offer.id, offer);
    
    this.broadcast('tradeOfferCreated', { offerId: offer.id });
  }

  private handleAcceptTradeOffer(client: Client, command: AcceptTradeOfferCommand) {
    const buyer = this.state.players.get(client.sessionId);
    if (!buyer) return;
    
    const offer = this.state.tradeOffers.get(command.offerId);
    if (!offer) {
      client.send('error', { message: 'Angebot nicht gefunden' });
      return;
    }
    
    const seller = this.state.players.get(offer.seller);
    if (!seller) return;
    
    const totalCost = offer.pricePerUnit * command.amount;
    
    // Prüfe ob Käufer genug Gold hat
    if (buyer.gold < totalCost) {
      client.send('error', { message: 'Nicht genug Gold' });
      return;
    }
    
    // Prüfe ob Angebot genug Ressourcen hat
    if (offer.amount < command.amount) {
      client.send('error', { message: 'Nicht genug verfügbar' });
      return;
    }
    
    // Transaktion durchführen
    buyer.gold -= totalCost;
    seller.gold += totalCost;
    
    (buyer as any)[offer.resource] += command.amount;
    offer.amount -= command.amount;
    
    // Lösche Angebot wenn leer
    if (offer.amount <= 0) {
      this.state.tradeOffers.delete(command.offerId);
    }
    
    this.broadcast('tradeCompleted', {
      buyer: client.sessionId,
      seller: offer.seller,
      resource: offer.resource,
      amount: command.amount,
      totalCost
    });
  }

  // ===========================
  // UNIT COMMANDS
  // ===========================

  private async handleRecruitUnit(client: Client, command: any) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { buildingId, unitType } = command;
    
    // Prüfe ob Building existiert und dem Spieler gehört
    const building = this.state.buildings.get(buildingId);
    if (!building || building.owner !== player.username) {
      client.send('error', { message: 'Gebäude nicht gefunden' });
      console.log(`❌ Building ${buildingId} not found or not owned by ${player.username}`);
      return;
    }

    // Nur Kaserne kann Units rekrutieren
    if (building.type !== 'barracks') {
      client.send('error', { message: 'Nur Kasernen können Einheiten rekrutieren' });
      return;
    }

    // Prüfe ob Building fertig gebaut ist
    if (building.constructionProgress < 1) {
      client.send('error', { message: 'Gebäude noch nicht fertig' });
      return;
    }

    const unitDef = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS];
    if (!unitDef) return;

    // Prüfe Ressourcen
    if (
      (unitDef.cost.wood && player.wood < unitDef.cost.wood) ||
      (unitDef.cost.stone && player.stone < (unitDef.cost.stone || 0)) ||
      (unitDef.cost.iron && player.iron < unitDef.cost.iron) ||
      (unitDef.cost.gold && player.gold < unitDef.cost.gold) ||
      (unitDef.cost.food && player.food < unitDef.cost.food)
    ) {
      client.send('error', { message: 'Nicht genug Ressourcen' });
      return;
    }

    // Kosten abziehen
    if (unitDef.cost.wood) player.wood -= unitDef.cost.wood;
    if (unitDef.cost.stone) player.stone -= (unitDef.cost.stone || 0);
    if (unitDef.cost.iron) player.iron -= (unitDef.cost.iron || 0);
    if (unitDef.cost.gold) player.gold -= (unitDef.cost.gold || 0);
    if (unitDef.cost.food) player.food -= (unitDef.cost.food || 0);

    // Erstelle Unit auf dem Building-Tile
    const unit = new (await import('./GameRoomState.js')).UnitState();
    unit.id = `${player.username}_unit_${Date.now()}`;
    unit.type = unitType;
    unit.q = building.q;
    unit.r = building.r;
    unit.owner = player.username;
    unit.health = unitDef.health;

    this.state.units.set(unit.id, unit);

    // Speichere in DB
    await this.postgres.createUnit({
      id: unit.id,
      type: unit.type,
      q: unit.q,
      r: unit.r,
      owner: unit.owner,
      health: unit.health,
      movement_remaining: unitDef.movementRange
    });

    console.log(`🎖️ Unit rekrutiert: ${unitType} für ${player.username}`);
    
    // Trigger initial exploration for newly recruited unit
    this.handleUnitExploration(player.username, unit, unitDef).catch(console.error);
  }

  private async handleMoveUnit(client: Client, command: MoveUnitCommand) {
    console.log(`🎯 handleMoveUnit called: unitId=${command.unitId}, destination=(${command.destination.q},${command.destination.r})`);
    
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const unit = this.state.units.get(command.unitId);
    if (!unit || unit.owner !== player.username) {
      client.send('error', { message: 'Einheit nicht gefunden' });
      return;
    }

    const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
    if (!unitDef) return;

    // Check if unit is already moving
    if (this.movingUnits.has(command.unitId)) {
      client.send('error', { message: 'Einheit bewegt sich bereits' });
      return;
    }

    // Find path using A* pathfinding
    const start: HexCoord = { q: unit.q, r: unit.r };
    const goal: HexCoord = command.destination;

    console.log(`🔍 Finding path from (${start.q},${start.r}) to (${goal.q},${goal.r})`);

    const isPassable = (coord: HexCoord): boolean => {
      const key = hexToKey(coord);
      const tile = this.state.tiles.get(key);
      if (!tile) return false;
      
      // Check if tile is owned by enemy
      if (tile.owner && tile.owner !== player.username) return false;
      
      // Check if biome is passable (movementMultiplier > 0)
      const biomeDef = BIOME_DEFINITIONS[tile.biome as keyof typeof BIOME_DEFINITIONS];
      return biomeDef && biomeDef.movementMultiplier > 0;
    };

    const path = findPath(start, goal, isPassable);
    
    console.log(`📍 Path result:`, path);
    
    if (!path || path.length === 0) {
      client.send('error', { message: 'Kein Weg zum Ziel gefunden' });
      return;
    }

    // Path includes start position, so we need at least 2 tiles (start + destination)
    if (path.length < 2) {
      client.send('error', { message: 'Bereits am Ziel' });
      return;
    }

    // Calculate time for first MOVE (skip index 0 which is current position)
    const firstMoveTile = path[1];
    const firstTileKey = hexToKey(firstMoveTile);
    const firstTileState = this.state.tiles.get(firstTileKey);
    
    if (!firstTileState) {
      client.send('error', { message: 'Ungültiges Ziel' });
      return;
    }

    const firstBiomeDef = BIOME_DEFINITIONS[firstTileState.biome as keyof typeof BIOME_DEFINITIONS];
    const firstTileDuration = this.calculateTileMovementTime(unitDef, firstBiomeDef);

    // Store movement state (start at index 1 to skip current position)
    const now = Date.now();
    const movement = {
      unitId: command.unitId,
      path,
      currentTileIndex: 1, // Start at 1, not 0
      startTime: now,
      tileStartTime: now,
      tileDuration: firstTileDuration
    };
    this.movingUnits.set(command.unitId, movement);

    // Persist to database
    this.postgres.saveUnitMovement(movement)
      .then(() => console.log(`💾 Movement saved to DB for unit ${command.unitId}`))
      .catch(err => console.error(`❌ Failed to save movement to DB:`, err));

    // Mark unit as moving
    unit.isMoving = true;

    console.log(`🚶 Unit ${unit.type} started moving from (${unit.q},${unit.r}) to (${goal.q},${goal.r}) - ${path.length} tiles`);
  }

  private async handleCancelMovement(client: Client, command: { unitId: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const unit = this.state.units.get(command.unitId);
    if (!unit || unit.owner !== player.username) {
      client.send('error', { message: 'Einheit nicht gefunden' });
      return;
    }

    // Remove from moving units
    if (this.movingUnits.has(command.unitId)) {
      this.movingUnits.delete(command.unitId);
      unit.isMoving = false;
      
      // Remove from database
      this.postgres.deleteUnitMovement(command.unitId).catch(console.error);
      
      console.log(`⏹️ Movement cancelled for unit ${unit.type}`);
    }
  }

  // Calculate time to move across one tile (in milliseconds)
  private calculateTileMovementTime(unitDef: any, biomeDef: any): number {
    const baseTime = 60000; // 1 minute = 60000ms
    const unitSpeed = unitDef.speedMultiplier || 1.0;
    const biomeSpeed = biomeDef.movementMultiplier || 1.0;
    
    // Apply TIME_MULTIPLIER to speed up in dev mode
    const totalTime = (baseTime * unitSpeed * biomeSpeed) / TIME_MULTIPLIER;
    
    console.log(`⏱️ Movement time: ${baseTime}ms base × ${unitSpeed} unit × ${biomeSpeed} biome ÷ ${TIME_MULTIPLIER}x = ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
    return totalTime;
  }

  // Update all moving units (called every frame)
  private updateUnitMovements(now: number) {
    const toRemove: string[] = [];
    
    this.movingUnits.forEach((movement, unitId) => {
      const unit = this.state.units.get(unitId);
      if (!unit) {
        toRemove.push(unitId);
        return;
      }

      const elapsed = now - movement.tileStartTime;
      
      // Check if unit reached current tile
      if (elapsed >= movement.tileDuration) {
        const nextTile = movement.path[movement.currentTileIndex];
        
        // Move unit to next tile
        unit.q = nextTile.q;
        unit.r = nextTile.r;
        
        console.log(`📍 Unit ${unit.type} reached tile (${nextTile.q},${nextTile.r})`);
        
        // Trigger exploration for this tile
        const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
        if (unitDef) {
          this.handleUnitExploration(unit.owner, unit, unitDef).catch(console.error);
        }
        
        // Update visibility for the player (visible vs explored tiles may have changed)
        this.updatePlayerVisibility(unit.owner).catch(console.error);
        
        // Check if journey complete
        if (movement.currentTileIndex >= movement.path.length - 1) {
          toRemove.push(unitId);
          unit.isMoving = false;
          console.log(`✅ Unit ${unit.type} completed movement to (${nextTile.q},${nextTile.r})`);
          
          // Update DB and remove movement
          this.postgres.moveUnit(unitId, unit.q, unit.r, 0).catch(console.error);
          this.postgres.deleteUnitMovement(unitId).catch(console.error);
        } else {
          // Advance to next tile
          movement.currentTileIndex++;
          const nextTargetTile = movement.path[movement.currentTileIndex];
          const tileKey = hexToKey(nextTargetTile);
          const tileState = this.state.tiles.get(tileKey);
          
          if (tileState) {
            const biomeDef = BIOME_DEFINITIONS[tileState.biome as keyof typeof BIOME_DEFINITIONS];
            const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
            
            movement.tileStartTime = now;
            movement.tileDuration = this.calculateTileMovementTime(unitDef, biomeDef);
            
            // Update database
            this.postgres.saveUnitMovement(movement)
              .then(() => console.log(`💾 Movement updated in DB for tile ${movement.currentTileIndex}`))
              .catch(err => console.error(`❌ Failed to update movement in DB:`, err));
          } else {
            // Invalid tile, stop movement
            toRemove.push(unitId);
            console.error(`❌ Unit ${unit.type} reached invalid tile, stopping`);
          }
        }
      }
    });
    
    // Remove completed movements
    toRemove.forEach(id => this.movingUnits.delete(id));
  }

  // Exploration-Update wenn Unit sich bewegt (oder spawnt)
  private async handleUnitExploration(
    playerUsername: string,
    unit: any,
    unitDef: any
  ) {
    // Hole Tile-Biom an Unit-Position
    const unitTileKey = hexToKey({ q: unit.q, r: unit.r });
    const unitTile = this.state.tiles.get(unitTileKey);
    if (!unitTile) return;

    // Berechne Sichtweite mit Line-of-Sight
    const unitVisionBonus = unitDef.visionBonus || 0;

    // Sammle sichtbare Tiles mit LoS check
    const newlyVisible: Array<{ q: number; r: number }> = [];
    
    this.state.tiles.forEach((tile) => {
      if (this.canSeeTile(
        { q: unit.q, r: unit.r },
        unitTile.biome,
        unitVisionBonus,
        { q: tile.q, r: tile.r }
      )) {
        newlyVisible.push({ q: tile.q, r: tile.r });
      }
    });

    if (newlyVisible.length > 0) {
      // Speichere als explored
      await this.postgres.addExploredTiles(playerUsername, newlyVisible);

      // Sende Update an Client
      const client = this.clients.find(c => {
        const p = this.state.players.get(c.sessionId);
        return p && p.username === playerUsername;
      });

      if (client) {
        const exploreTiles = newlyVisible.map(coord => {
          const tile = this.state.tiles.get(hexToKey(coord));
          return tile ? {
            key: hexToKey(coord),
            q: tile.q,
            r: tile.r,
            biome: tile.biome,
            fertility: tile.fertility,
            owner: tile.owner,
            resources: tile.resources.map(r => ({ type: r.type, amount: r.amount }))
          } : null;
        }).filter(t => t !== null);

        client.send('newlyExplored', { tiles: exploreTiles });
      }

      console.log(`🔭 ${playerUsername} hat ${newlyVisible.length} neue Tiles erkundet`);
    }
  }

  // Calculate if a tile is visible with Line-of-Sight check
  // Vision is reduced by terrain between observer and target
  private canSeeTile(
    observerPos: { q: number; r: number },
    observerBiome: string,
    observerVisionBonus: number,
    targetPos: { q: number; r: number }
  ): boolean {
    const baseVisionRange = this.getBiomeViewDistance(observerBiome) + observerVisionBonus;
    
    // Calculate distance
    const dq = targetPos.q - observerPos.q;
    const dr = targetPos.r - observerPos.r;
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    
    // Too far away
    if (distance > baseVisionRange) return false;
    if (distance === 0) return true; // Same tile
    
    // Get line of tiles between observer and target
    const line = hexLine(observerPos, targetPos);
    
    // Calculate effective vision range considering terrain
    // The visionBonus helps to see through difficult terrain
    let remainingVision = baseVisionRange;
    
    // Check each tile in the line (except the first one, which is the observer)
    for (let i = 1; i < line.length - 1; i++) { // Exclude target tile itself
      const checkTile = this.state.tiles.get(hexToKey(line[i]));
      if (checkTile) {
        const biomeViewDistance = this.getBiomeViewDistance(checkTile.biome);
        
        // Dense terrain reduces remaining vision
        // Good terrain (high viewDistance) barely reduces it
        // Poor terrain (low viewDistance) reduces it significantly
        const visionCost = Math.max(0, 5 - biomeViewDistance); // 0-5 cost
        remainingVision -= visionCost * 0.3; // Each point of difficulty costs 0.3 tiles of vision
        
        if (remainingVision < i) {
          // Can't see through this terrain anymore
          return false;
        }
      }
    }
    
    // Can see if we have enough remaining vision to reach the target
    return remainingVision >= distance;
  }

  // Update visibility for a player (recalculate visible vs explored)
  // Only sends changed tiles to reduce network traffic
  private async updatePlayerVisibility(playerUsername: string) {
    const client = this.clients.find(c => {
      const p = this.state.players.get(c.sessionId);
      return p && p.username === playerUsername;
    });

    if (!client) return;

    // Calculate current visible tiles
    const visibleKeys = new Set<string>();
    
    // 1. Owned tiles
    this.state.tiles.forEach(tile => {
      if (tile.owner === playerUsername) {
        const key = hexToKey({ q: tile.q, r: tile.r });
        visibleKeys.add(key);
        
        // Add tiles in viewDistance with LoS check
        this.state.tiles.forEach((t2, k2) => {
          if (this.canSeeTile(
            { q: tile.q, r: tile.r },
            tile.biome,
            0, // No vision bonus from territory
            { q: t2.q, r: t2.r }
          )) {
            visibleKeys.add(k2);
          }
        });
      }
    });
    
    // 2. Units' vision
    this.state.units.forEach(unit => {
      if (unit.owner === playerUsername) {
        const unitTile = this.state.tiles.get(hexToKey({ q: unit.q, r: unit.r }));
        if (unitTile) {
          const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
          const unitVisionBonus = unitDef?.visionBonus || 0;
          
          this.state.tiles.forEach((tile, key) => {
            if (this.canSeeTile(
              { q: unit.q, r: unit.r },
              unitTile.biome,
              unitVisionBonus,
              { q: tile.q, r: tile.r }
            )) {
              visibleKeys.add(key);
            }
          });
        }
      }
    });
    
    // Load explored tiles from DB
    const exploredFromDB = await this.postgres.getExploredTiles(playerUsername);
    const exploredKeys = new Set<string>(
      exploredFromDB.map(t => hexToKey({ q: t.q, r: t.r }))
    );
    
    // Prepare tile data
    const visibleTiles: Array<any> = [];
    const exploredOnlyTiles: Array<any> = [];
    
    visibleKeys.forEach(key => {
      const tile = this.state.tiles.get(key);
      if (tile) {
        visibleTiles.push({
          key,
          q: tile.q,
          r: tile.r,
          biome: tile.biome,
          fertility: tile.fertility,
          owner: tile.owner,
          resources: tile.resources.map(r => ({ type: r.type, amount: r.amount }))
        });
      }
    });
    
    exploredKeys.forEach(key => {
      if (!visibleKeys.has(key)) {
        const tile = this.state.tiles.get(key);
        if (tile) {
          exploredOnlyTiles.push({
            key,
            q: tile.q,
            r: tile.r,
            biome: tile.biome
          });
        }
      }
    });
    
    // Send updates - use 'visibilityUpdate' message to replace old tiles
    client.send('visibilityUpdate', { 
      visibleTiles,
      exploredTiles: exploredOnlyTiles
    });
    
    console.log(`👁️ Updated visibility for ${playerUsername}: ${visibleTiles.length} visible, ${exploredOnlyTiles.length} explored-only`);
  }

  // ===========================
  // MAP GENERATION
  // ===========================
  
  private async initializeWorld() {
    try {
      // Verbinde zu MongoDB (nur für Terrain Chunks)
      await this.chunkManager.connect();
      console.log('✅ ChunkManager connected');
    } catch (error) {
      console.error('❌ MongoDB nicht verfügbar:', error);
      throw new Error('MongoDB connection required for game operation');
    }
    
    // Lade initiale Chunks um Spawn-Punkt (0,0) aus DB
    await this.loadInitialChunksAsync();
  }
  
  // Restore active unit movements from database after server restart
  private async restoreActiveMovements() {
    try {
      const movements = await this.postgres.getActiveMovements();
      console.log(`🔄 Found ${movements.length} active unit movements in database (will restore when units load)`);
      
      // Note: We don't restore movements here because units are loaded per-player in onJoin
      // Movements will be restored in restorePlayerMovements() after units are loaded
    } catch (error) {
      console.error('❌ Failed to check active movements:', error);
    }
  }
  
  // Restore active movements for a specific player's units
  private async restorePlayerMovements(playerUsername: string) {
    try {
      const movements = await this.postgres.getActiveMovements();
      const playerMovements = movements.filter(m => {
        const unit = this.state.units.get(m.unitId);
        return unit && unit.owner === playerUsername;
      });
      
      console.log(`🔄 Restoring ${playerMovements.length} active movements for ${playerUsername}`);
      
      const now = Date.now();
      
      for (const movement of playerMovements) {
        const unit = this.state.units.get(movement.unitId);
        if (!unit) {
          await this.postgres.deleteUnitMovement(movement.unitId);
          continue;
        }
        
        // Calculate how much time has passed since the movement was saved
        const elapsedSinceLastTile = now - movement.tileStartTime;
        
        console.log(`  ⏱️ Unit ${movement.unitId}: ${elapsedSinceLastTile}ms elapsed, tile duration: ${movement.tileDuration}ms`);
        
        // Fast-forward movement through completed tiles
        let currentIndex = movement.currentTileIndex;
        let remainingTime = elapsedSinceLastTile;
        let currentTileDuration = movement.tileDuration;
        
        while (remainingTime >= currentTileDuration && currentIndex < movement.path.length - 1) {
          // Move to next tile
          remainingTime -= currentTileDuration;
          currentIndex++;
          
          const nextTile = movement.path[currentIndex];
          unit.q = nextTile.q;
          unit.r = nextTile.r;
          
          console.log(`  🚀 Fast-forwarded unit to tile ${currentIndex}: (${nextTile.q},${nextTile.r})`);
          
          // Trigger exploration for this tile
          const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
          if (unitDef) {
            await this.handleUnitExploration(unit.owner, unit, unitDef);
          }
          
          // Check if this was the last tile
          if (currentIndex >= movement.path.length - 1) {
            console.log(`  ✅ Unit ${unit.type} completed movement during offline time`);
            unit.isMoving = false;
            await this.postgres.moveUnit(movement.unitId, unit.q, unit.r, 0);
            await this.postgres.deleteUnitMovement(movement.unitId);
            
            // Update visibility for the player
            await this.updatePlayerVisibility(unit.owner);
            return; // Movement complete, don't restore to movingUnits
          }
          
          // Calculate duration for next tile
          const nextTargetTile = movement.path[currentIndex];
          const tileKey = hexToKey(nextTargetTile);
          const tileState = this.state.tiles.get(tileKey);
          
          if (tileState) {
            const biomeDef = BIOME_DEFINITIONS[tileState.biome as keyof typeof BIOME_DEFINITIONS];
            const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
            currentTileDuration = this.calculateTileMovementTime(unitDef, biomeDef);
          } else {
            console.error(`  ❌ Invalid tile at index ${currentIndex}, stopping movement`);
            await this.postgres.deleteUnitMovement(movement.unitId);
            return;
          }
        }
        
        // Update movement with new position and adjusted time
        movement.currentTileIndex = currentIndex;
        movement.tileStartTime = now - remainingTime;
        movement.tileDuration = currentTileDuration;
        
        // Restore movement to memory
        this.movingUnits.set(movement.unitId, movement);
        unit.isMoving = true;
        
        // Update database with new position
        await this.postgres.saveUnitMovement(movement);
        
        console.log(`  ✅ Restored movement for unit ${movement.unitId}: tile ${movement.currentTileIndex}/${movement.path.length}, ${remainingTime}ms into current tile`);
        
        // Update visibility for the player
        await this.updatePlayerVisibility(unit.owner);
      }
    } catch (error) {
      console.error(`❌ Failed to restore movements for ${playerUsername}:`, error);
    }
  }
  
  // Lade initiale Chunks (3x3 um Spawn) aus DB
  private async loadInitialChunksAsync() {
    const CHUNK_SIZE = 16;
    const promises: Promise<void>[] = [];
    
    for (let cx = -1; cx <= 1; cx++) {
      for (let cy = -1; cy <= 1; cy++) {
        promises.push(this.loadChunkAsync(cx, cy, CHUNK_SIZE));
      }
    }
    
    await Promise.all(promises);
    console.log(`🗺️ ${this.state.tiles.size} initiale Tiles aus DB geladen`);
  }
  
  // Lade einen einzelnen Chunk aus MongoDB (KEIN Generieren!)
  private async loadChunkAsync(chunkX: number, chunkY: number, _CHUNK_SIZE: number): Promise<void> {
    try {
      const existingChunk = await this.chunkManager.loadChunk(chunkX, chunkY);
      
      if (existingChunk && existingChunk.tiles.length > 0) {
        // Chunk aus DB laden
        const tiles = this.chunkManager.chunkDataToTiles([existingChunk]);
        tiles.forEach((tile, key) => {
          this.state.tiles.set(key, tile);
        });
        return;
      } else {
        // Chunk existiert nicht in DB - logge Warnung
        console.warn(`🐉 Chunk (${chunkX}, ${chunkY}) nicht in DB gefunden - "Here be dragons"`);
      }
    } catch (error) {
      console.error(`❌ MongoDB-Fehler beim Laden von Chunk (${chunkX}, ${chunkY}):`, error);
    }
  }
  
  private async assignStartingTerritory(playerId: string, isAdmin: boolean = false): Promise<{ q: number; r: number }> {
    const config = isAdmin ? PLAYER_CONFIG.admin : PLAYER_CONFIG.user;
    
    // Einfache Implementierung: Gebe jedem Spieler ein paar Felder in der Nähe des Spawns
    const playerIndex = this.state.players.size - 1;
    const angle = (playerIndex * 2 * Math.PI) / 8; // Verteile bis zu 8 Spieler im Kreis
    const spawnDistance = 10;
    
    const spawnQ = Math.round(spawnDistance * Math.cos(angle));
    const spawnR = Math.round(spawnDistance * Math.sin(angle));
    
    const tilesToOwn: Array<{ q: number; r: number }> = [];
    
    // Markiere Hexfelder basierend auf Radius
    for (let dq = -config.startingTilesRadius; dq <= config.startingTilesRadius; dq++) {
      for (let dr = -config.startingTilesRadius; dr <= config.startingTilesRadius; dr++) {
        // Hex-Distance-Check (Manhattan-ähnlich)
        const ds = -dq - dr;
        if (Math.abs(dq) <= config.startingTilesRadius && 
            Math.abs(dr) <= config.startingTilesRadius && 
            Math.abs(ds) <= config.startingTilesRadius) {
          
          const q = spawnQ + dq;
          const r = spawnR + dr;
          const tileKey = hexToKey({ q, r });
          const tile = this.state.tiles.get(tileKey);
          
          if (tile) {
            tile.owner = playerId; // Update im RAM für sofortige Sichtbarkeit
            tilesToOwn.push({ q, r });
          }
        }
      }
    }
    
    console.log(`🏠 ${isAdmin ? 'Admin' : 'User'} erhält ${tilesToOwn.length} Tiles (Radius: ${config.startingTilesRadius})`);
    console.log(`🎯 Spawn-Koordinaten: q=${spawnQ}, r=${spawnR}`);
    
    // Async: Speichere in DB (fire & forget)
    if (tilesToOwn.length > 0) {
      // Batch set tile ownership in PostgreSQL
      Promise.all(
        tilesToOwn.map(tile => 
          this.postgres.setTileOwner(tile.q, tile.r, playerId)
        )
      ).catch(err => {
        console.error('Failed to save tile ownership:', err);
      });
    }
    
    // Gebe Spawn-Position zurück
    return { q: spawnQ, r: spawnR };
  }
  
  // Chunk-Loading Handler - Lade NUR aus MongoDB + Fog-of-War für User
  private async handleRequestChunks(client: Client, message: { chunkCoords: Array<{ chunkX: number; chunkY: number }> }) {
    const CHUNK_SIZE = 16;
    const MAX_CHUNKS_PER_REQUEST = 100;
    
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    
    const isAdmin = (player as any).isAdmin || false;
    const config = isAdmin ? PLAYER_CONFIG.admin : PLAYER_CONFIG.user;
    
    // Für User: Filtere nur sichtbare Chunks
    let allowedCoords = message.chunkCoords;
    if (!config.canRequestAllChunks) {
      allowedCoords = this.filterVisibleChunks(client.sessionId, message.chunkCoords, config.visionRadius);
      
      const filtered = message.chunkCoords.length - allowedCoords.length;
      if (filtered > 0) {
        console.log(`🔒 ${filtered} Chunks für User blockiert (Fog-of-War)`);
      }
    }
    
    // Limitiere Anzahl der Chunks
    const limitedCoords = allowedCoords.slice(0, MAX_CHUNKS_PER_REQUEST);
    
    // Lade Chunks parallel
    const results = await Promise.all(limitedCoords.map(async (coord) => {
      // Prüfe, ob dieser Chunk bereits im RAM geladen ist
      const chunkLoaded = this.isChunkLoaded(coord.chunkX, coord.chunkY, CHUNK_SIZE);
      
      if (!chunkLoaded) {
        // Chunk nicht im RAM -> versuche aus MongoDB zu laden
        await this.loadChunkAsync(coord.chunkX, coord.chunkY, CHUNK_SIZE);
        
        // Prüfe ob Laden erfolgreich war
        const nowLoaded = this.isChunkLoaded(coord.chunkX, coord.chunkY, CHUNK_SIZE);
        return { coord, loaded: nowLoaded };
      }
      return { coord, loaded: true };
    }));
    
    // Finde fehlende Chunks
    const missingChunks = results.filter(r => !r.loaded).map(r => r.coord);
    
    if (missingChunks.length > 0) {
      // Sende Warnung an Client
      client.send('missingChunks', { chunks: missingChunks });
      console.warn(`🐉 ${missingChunks.length} Chunks fehlen in DB:`, missingChunks);
    }
    
    const loadedCount = results.filter(r => r.loaded).length;
    if (loadedCount > 0) {
      console.log(`📦 ${loadedCount} Chunks geladen (${this.state.tiles.size} Tiles total)`);
      
      // Sende aktualisierte sichtbare Tiles an Client
      const player = this.state.players.get(client.sessionId);
      if (player) {
        await this.sendVisibleAndExploredTilesToClient(client.sessionId, player.username, isAdmin);
      }
    }
  }
  
  // Filtere Chunks basierend auf Spieler-Sichtbarkeit (Fog-of-War)
  private filterVisibleChunks(
    playerId: string, 
    requestedChunks: Array<{ chunkX: number; chunkY: number }>,
    _visionRadius: number // Nicht mehr verwendet, stattdessen Biome-viewDistance
  ): Array<{ chunkX: number; chunkY: number }> {
    const CHUNK_SIZE = 16;
    
    // Sammle alle Tiles des Spielers mit ihrem Biom
    const playerTiles: Array<{ q: number; r: number; biome: string }> = [];
    this.state.tiles.forEach((tile) => {
      if (tile.owner === playerId) {
        playerTiles.push({ q: tile.q, r: tile.r, biome: tile.biome });
      }
    });
    
    if (playerTiles.length === 0) {
      return []; // Spieler hat keine Tiles -> keine Sicht
    }
    
    // Berechne sichtbare Tile-Bereiche (mit Biome-spezifischer viewDistance)
    const visibleChunks = new Set<string>();
    
    playerTiles.forEach(playerTile => {
      // Hole viewDistance für dieses Tile
      const biomeViewDistance = this.getBiomeViewDistance(playerTile.biome);
      
      // Mindestens direkte Nachbarn (distance = 1) sind immer sichtbar
      const viewDistance = Math.max(1, biomeViewDistance);
      
      // Für jedes Spieler-Tile: Berechne sichtbare Tiles im Radius
      for (let dq = -viewDistance; dq <= viewDistance; dq++) {
        for (let dr = -viewDistance; dr <= viewDistance; dr++) {
          const ds = -dq - dr;
          if (Math.abs(dq) <= viewDistance && 
              Math.abs(dr) <= viewDistance && 
              Math.abs(ds) <= viewDistance) {
            
            const visQ = playerTile.q + dq;
            const visR = playerTile.r + dr;
            
            // Berechne Chunk für dieses sichtbare Tile
            const chunkX = Math.floor(visQ / CHUNK_SIZE);
            const chunkY = Math.floor(visR / CHUNK_SIZE);
            visibleChunks.add(`${chunkX},${chunkY}`);
          }
        }
      }
    });
    
    // Filtere angeforderte Chunks
    return requestedChunks.filter(coord => {
      return visibleChunks.has(`${coord.chunkX},${coord.chunkY}`);
    });
  }
  
  // Prüfe ob ein Chunk vollständig im RAM geladen ist
  private isChunkLoaded(chunkX: number, chunkY: number, _CHUNK_SIZE: number): boolean {
    const CHUNK_SIZE = 16;
    const startQ = chunkX * CHUNK_SIZE;
    const startR = chunkY * CHUNK_SIZE;
    
    // Prüfe mehrere Tiles im Chunk (nicht nur das erste)
    // Wenn Culling aktiv ist, könnten einzelne Tiles fehlen
    let loadedCount = 0;
    let sampleCount = 0;
    
    // Sample 4 Ecken + Mitte
    const samplePositions = [
      { dq: 0, dr: 0 },
      { dq: CHUNK_SIZE - 1, dr: 0 },
      { dq: 0, dr: CHUNK_SIZE - 1 },
      { dq: CHUNK_SIZE - 1, dr: CHUNK_SIZE - 1 },
      { dq: Math.floor(CHUNK_SIZE / 2), dr: Math.floor(CHUNK_SIZE / 2) }
    ];
    
    for (const pos of samplePositions) {
      const key = hexToKey({ q: startQ + pos.dq, r: startR + pos.dr });
      if (this.state.tiles.has(key)) {
        loadedCount++;
      }
      sampleCount++;
    }
    
    // Chunk gilt als geladen, wenn alle Samples vorhanden sind
    return loadedCount === sampleCount;
  }
}
