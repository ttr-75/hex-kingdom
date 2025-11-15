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
  STARTING_RESOURCES,
  STARTING_STORAGE_CAPACITY,
  TECHNOLOGY_DEFINITIONS,
  UNIT_DEFINITIONS,
  hexToKey
} from '@hex-kingdom/shared';
import { ChunkManager } from '../database/ChunkManager.js';
import { PostgresManager } from '../database/PostgresManager.js';
import { RedisSessionManager } from '../database/RedisSessionManager.js';

// Systems
import { MovementSystem } from './systems/MovementSystem.js';
import { VisibilitySystem } from './systems/VisibilitySystem.js';
import { ExplorationSystem } from './systems/ExplorationSystem.js';
import { ProductionSystem } from './systems/ProductionSystem.js';

// Handlers
import { UnitHandler } from './handlers/UnitHandler.js';
import { BuildingHandler } from './handlers/BuildingHandler.js';

// ⏱️ TIME MULTIPLIER - Set this higher in dev mode to speed up all timers
// 1.0 = normal speed, 10.0 = 10x faster, 20.0 = 20x faster
const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;
console.log(`⏱️ TIME_MULTIPLIER loaded: ${TIME_MULTIPLIER}x speed`);

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
  
  // Player Management: Map sessionId -> username for client lookups
  private clientToUsername = new Map<string, string>();
  
  // Systems
  private movementSystem!: MovementSystem;
  private visibilitySystem!: VisibilitySystem;
  private explorationSystem!: ExplorationSystem;
  private productionSystem!: ProductionSystem;
  
  // Handlers
  private unitHandler!: UnitHandler;
  private buildingHandler!: BuildingHandler;

  // Helper method: Get player by client sessionId
  private getPlayerByClient(client: Client): PlayerState | undefined {
    const username = this.clientToUsername.get(client.sessionId);
    return username ? this.state.players.get(username) : undefined;
  }

  // Helper method: Get client by username (for systems)
  private getClientByUsername(username: string): Client | undefined {
    for (const [sessionId, uname] of this.clientToUsername.entries()) {
      if (uname === username) {
        return this.clients.find(c => c.sessionId === sessionId);
      }
    }
    return undefined;
  }

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
    
    // Initialize Systems
    this.visibilitySystem = new VisibilitySystem(
      this.state,
      this.postgres,
      () => Array.from(this.clients),
      (username: string) => this.getClientByUsername(username)
    );
    this.explorationSystem = new ExplorationSystem(
      this.state,
      this.postgres,
      this.visibilitySystem,
      () => Array.from(this.clients),
      (username: string) => this.getClientByUsername(username)
    );
    this.movementSystem = new MovementSystem(
      this.state,
      this.postgres,
      (player, unit, unitDef) => this.explorationSystem.handleUnitExploration(player, unit, unitDef),
      (player) => this.visibilitySystem.updatePlayerVisibility(player)
    );
    this.productionSystem = new ProductionSystem(this.state, this.postgres);
    
    // Initialize Handlers
    this.unitHandler = new UnitHandler(
      this.state,
      this.postgres,
      this.movementSystem,
      this.explorationSystem,
      (client: Client) => this.getPlayerByClient(client)
    );
    this.buildingHandler = new BuildingHandler(
      this.state,
      this.postgres,
      this.productionSystem,
      (client: Client) => this.getPlayerByClient(client)
    );
    
    // Load initial world data from MongoDB
    await this.initializeWorld();
    
    // Restore active unit movements from database
    await this.restoreActiveMovements();
    
    // Game Loop
    this.setSimulationInterval(() => this.update(), 1000 / this.state.tickRate);
    
    // Message Handlers
    this.onMessage('build', (client, message: BuildCommand) => {
      this.buildingHandler.handleBuild(client, message);
    });
    
    this.onMessage('recruitUnit', (client, message) => {
      this.unitHandler.handleRecruitUnit(client, message);
    });
    
    this.onMessage('moveUnit', (client, message: MoveUnitCommand) => {
      this.unitHandler.handleMoveUnit(client, message);
    });
    
    this.onMessage('cancelMovement', (client, message: { unitId: string }) => {
      this.unitHandler.handleCancelMovement(client, message);
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
      
      // Prüfe ob Spieler in PostgreSQL existiert (für Foreign Keys)
      const existingPlayer = await this.postgres.getPlayer(persistentId);
      if (!existingPlayer) {
        console.log(`🆕 Erstelle Player ${persistentId} in PostgreSQL (Redis-Reconnect)`);
        try {
          await this.postgres.createPlayer(persistentId, player.color);
        } catch (error) {
          console.error(`❌ Fehler beim Erstellen von Player ${persistentId}:`, error);
        }
      }
      
      // Extend Session TTL
      await this.redis.keepPlayerSessionAlive(persistentId);
    } else {
      const existingPlayer = await this.postgres.getPlayer(persistentId);
      
      if (existingPlayer) {
        // Returning Player - lade von PostgreSQL
        console.log(`👤 ${persistentId} returning player - lade von PostgreSQL`);
        player.color = existingPlayer.color;
        
        // Lade gespeicherte Resources aus PostgreSQL
        const savedResources = await this.postgres.getPlayerResources(persistentId);
        if (savedResources) {
          console.log(`💰 Lade gespeicherte Resources für ${persistentId}`);
          player.wood = Number(savedResources.wood);
          player.stone = Number(savedResources.stone);
          player.iron = Number(savedResources.iron);
          player.gold = Number(savedResources.gold);
          player.food = Number(savedResources.food);
          player.fish = Number(savedResources.fish);
          
          player.storageWood = savedResources.storage_wood;
          player.storageStone = savedResources.storage_stone;
          player.storageIron = savedResources.storage_iron;
          player.storageGold = savedResources.storage_gold;
          player.storageFood = savedResources.storage_food;
          player.storageFish = savedResources.storage_fish;
        } else {
          // Kein gespeicherter Stand → Startressourcen
          console.log(`🆕 Keine gespeicherten Resources → Startressourcen für ${persistentId}`);
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
        }
        
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
    
    // Speichere Player mit username als Key (persistent)
    this.state.players.set(player.username, player);
    // Registriere sessionId -> username Mapping für Client-Lookups
    this.clientToUsername.set(client.sessionId, player.username);
    
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
      
      // Restore offline production
      await this.productionSystem.restoreOfflineProduction(persistentId);
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
      // Lade Population für alle beanspruchten Tiles aus PostgreSQL
      const populationMap = new Map<string, number>();
      for (const [key, tile] of this.state.tiles) {
        if (tile.owner) {
          try {
            const population = await this.postgres.getTilePopulation(tile.q, tile.r);
            populationMap.set(key, population);
          } catch (error) {
            console.error(`Failed to load population for tile (${tile.q}, ${tile.r}):`, error);
          }
        }
      }
      
      this.state.tiles.forEach((tile, key) => {
        visibleTiles.push({
          key,
          q: tile.q,
          r: tile.r,
          biome: tile.biome,
          fertility: tile.fertility,
          owner: tile.owner,
          resources: tile.resources.map(r => ({ type: r.type, amount: r.amount })),
          population: populationMap.get(key) !== undefined ? populationMap.get(key) : tile.population
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
          if (this.visibilitySystem.canSeeTile(
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
      
      // Lade Population für alle beanspruchten sichtbaren Tiles aus PostgreSQL
      const populationMap = new Map<string, number>();
      for (const key of visibleKeys) {
        const tile = this.state.tiles.get(key);
        if (tile && tile.owner) {
          try {
            const population = await this.postgres.getTilePopulation(tile.q, tile.r);
            populationMap.set(key, population);
          } catch (error) {
            console.error(`Failed to load population for tile (${tile.q}, ${tile.r}):`, error);
          }
        }
      }
      
      // 6. Sammle sichtbare Tiles
      visibleKeys.forEach(key => {
        const tile = this.state.tiles.get(key);
        if (tile) {
          const isOwned = tile.owner === userId;
          visibleTiles.push({
            key,
            q: tile.q,
            r: tile.r,
            biome: tile.biome,
            fertility: tile.fertility,
            owner: tile.owner,
            // Ressourcen nur für eigene Tiles
            resources: isOwned ? tile.resources.map(r => ({ type: r.type, amount: r.amount })) : [],
            // Population nur für eigene Tiles
            population: isOwned && populationMap.has(key) ? populationMap.get(key) : undefined
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
    return this.visibilitySystem.getBiomeViewDistance(biomeType);
  }

  onLeave(client: Client, _consented: boolean) {
    const username = this.clientToUsername.get(client.sessionId);
    const player = username ? this.state.players.get(username) : undefined;
    
    if (player) {
      console.log(`👋 ${player.username} hat verlassen`);
      
      // Speichere Production State (für Offline-Produktion)
      this.productionSystem.saveProductionState(player.username).catch((err: any) => {
        console.error(`❌ Failed to save production state for ${player.username}:`, err);
      });
      
      // Sync: RAM → PostgreSQL (persistent backup)
      this.savePlayerDataOnLeave(player).catch((err: any) => {
        console.error(`❌ Failed to save player data for ${player.username}:`, err);
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
      
      // Entferne Spieler aus State (verwende username als Key)
      this.state.players.delete(player.username);
      this.clientToUsername.delete(client.sessionId);
    }
  }

  onDispose() {
    console.log(`🗑️ GameRoom ${this.roomId} geschlossen`);
  }

  // ===========================
  // PERSISTENCE
  // ===========================

  /**
   * Speichere alle Player-Daten beim Verlassen
   */
  private async savePlayerDataOnLeave(player: any): Promise<void> {
    const username = player.username;
    
    console.log(`💾 Speichere Daten für ${username}...`);
    
    // 1. Speichere Resources in PostgreSQL
    try {
      await this.postgres.savePlayerResources({
        username: username,
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
        storageFish: player.storageFish
      });
      console.log(`✅ Resources gespeichert für ${username}`);
    } catch (error) {
      console.error(`❌ Fehler beim Speichern der Resources für ${username}:`, error);
    }
    
    // 2. Lösche Redis-Session
    try {
      await this.redis.deletePlayerSession(username);
      console.log(`✅ Redis-Session gelöscht für ${username}`);
    } catch (error) {
      console.error(`❌ Fehler beim Löschen der Redis-Session für ${username}:`, error);
    }
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
    this.productionSystem.updateProduction(deltaSeconds);
    
    // Update Forschung
    this.productionSystem.updateResearch((type, message) => this.broadcast(type, message));
    
    // Update Gebäude-Konstruktion
    this.buildingHandler.updateConstruction((type, message) => this.broadcast(type, message));
    
    // Update unit movements (async, runs in background)
    this.movementSystem.updateMovements(now).catch(err => {
      console.error('❌ Error in updateMovements:', err);
    });
    
    // Entferne abgelaufene Handelsangebote
    this.cleanupExpiredTradeOffers();
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

  // Note: handleBuild wurde zu BuildingHandler.handleBuild() verschoben

  private handleResearch(client: Client, command: ResearchCommand) {
    const player = this.getPlayerByClient(client);
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
    const player = this.getPlayerByClient(client);
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
    offer.id = `${player.username}_${Date.now()}`;
    offer.seller = player.username;
    offer.resource = command.resource;
    offer.amount = command.amount;
    offer.pricePerUnit = command.pricePerUnit;
    offer.expiresAt = Date.now() + 3600000; // 1 Stunde
    
    this.state.tradeOffers.set(offer.id, offer);
    
    this.broadcast('tradeOfferCreated', { offerId: offer.id });
  }

  private handleAcceptTradeOffer(client: Client, command: AcceptTradeOfferCommand) {
    const buyer = this.getPlayerByClient(client);
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
      buyer: buyer.username,
      seller: offer.seller,
      resource: offer.resource,
      amount: command.amount,
      totalCost
    });
  }

  // ===========================
  // UNIT COMMANDS (MOVED TO HANDLERS)
  // ===========================
  // handleRecruitUnit → UnitHandler
  // handleMoveUnit → UnitHandler
  // handleCancelMovement → UnitHandler
  // calculateTileMovementTime → MovementSystem
  // updateUnitMovements → MovementSystem
  // handleUnitExploration → ExplorationSystem
  // canSeeTile → VisibilitySystem
  // updatePlayerVisibility → VisibilitySystem (needs delegation)

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
    await this.movementSystem.restorePlayerMovements(playerUsername);
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
    
    // Finde eine geeignete Startposition
    const spawnPosition = await this.findSuitableSpawnPosition();
    
    if (!spawnPosition) {
      console.warn(`⚠️ Keine geeignete Startposition gefunden für ${playerId}, verwende (0,0)`);
      return { q: 0, r: 0 };
    }
    
    const { q: spawnQ, r: spawnR } = spawnPosition;
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
    console.log(`🎯 Spawn-Koordinaten: q=${spawnQ}, r=${spawnR} (Biom: ${this.state.tiles.get(hexToKey(spawnPosition))?.biome})`);
    
    // Async: Speichere in DB (fire & forget)
    if (tilesToOwn.length > 0) {
      // 🎯 Verwende claimTile() für konsistentes Tile-Claiming
      Promise.all(
        tilesToOwn.map(tile => 
          this.postgres.claimTile(tile.q, tile.r, playerId)
        )
      ).catch(err => {
        console.error('Failed to claim tiles:', err);
      });
    }
    
    // Gebe Spawn-Position zurück
    return { q: spawnQ, r: spawnR };
  }
  
  /**
   * Findet eine geeignete Startposition für einen neuen Spieler.
   * Kriterien:
   * - Nicht im Wasser (Ocean, Lake, River)
   * - Nicht in Wüste
   * - Nicht in Hügeln oder Gebirge
   * - Bevorzugt: Grasland oder Laubwald
   * - Nicht bereits von einem anderen Spieler beansprucht
   * - Mindestabstand zu anderen Spielern
   */
  private async findSuitableSpawnPosition(): Promise<{ q: number; r: number } | null> {
    const SUITABLE_BIOMES = new Set([
      'grassland',           // Beste Wahl
      'deciduous_forest',    // Gute Wahl
      'coniferous_forest',   // Akzeptabel
      'steppe'              // Akzeptabel
    ]);
    
    const UNSUITABLE_BIOMES = new Set([
      'ocean', 'lake', 'river',  // Wasser
      'desert',                  // Wüste
      'hills', 'mountains',      // Zu bergig
      'swamp'                    // Zu sumpfig
    ]);
    
    const MIN_DISTANCE_BETWEEN_PLAYERS = 20; // Mindestabstand in Hex-Feldern
    const MAX_ATTEMPTS = 100; // Maximale Suchversuche
    
    // Sammle bereits belegte Positionen
    const occupiedPositions: Array<{ q: number; r: number }> = [];
    this.state.tiles.forEach((tile) => {
      if (tile.owner) {
        occupiedPositions.push({ q: tile.q, r: tile.r });
      }
    });
    
    // Berechne Zentrum jedes Spieler-Territoriums
    const playerCenters: Array<{ q: number; r: number }> = [];
    if (occupiedPositions.length > 0) {
      // Gruppiere Tiles nach Spieler
      const playerTiles = new Map<string, Array<{ q: number; r: number }>>();
      this.state.tiles.forEach((tile) => {
        if (tile.owner) {
          if (!playerTiles.has(tile.owner)) {
            playerTiles.set(tile.owner, []);
          }
          playerTiles.get(tile.owner)!.push({ q: tile.q, r: tile.r });
        }
      });
      
      // Berechne Zentrum für jeden Spieler
      playerTiles.forEach((tiles) => {
        const avgQ = tiles.reduce((sum, t) => sum + t.q, 0) / tiles.length;
        const avgR = tiles.reduce((sum, t) => sum + t.r, 0) / tiles.length;
        playerCenters.push({ q: Math.round(avgQ), r: Math.round(avgR) });
      });
    }
    
    // Suche nach geeigneten Kandidaten
    const candidates: Array<{ q: number; r: number; score: number }> = [];
    
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Zufällige Position in einem größeren Radius um (0,0)
      const angle = Math.random() * 2 * Math.PI;
      const distance = 10 + Math.random() * 30; // 10-40 Tiles vom Zentrum
      
      const q = Math.round(distance * Math.cos(angle));
      const r = Math.round(distance * Math.sin(angle));
      
      const tileKey = hexToKey({ q, r });
      const tile = this.state.tiles.get(tileKey);
      
      if (!tile) continue; // Tile existiert nicht
      if (tile.owner) continue; // Bereits beansprucht
      
      // Prüfe Biom
      if (UNSUITABLE_BIOMES.has(tile.biome)) continue;
      
      // Prüfe Abstand zu anderen Spielern
      let tooClose = false;
      for (const center of playerCenters) {
        const dq = q - center.q;
        const dr = r - center.r;
        const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        
        if (distance < MIN_DISTANCE_BETWEEN_PLAYERS) {
          tooClose = true;
          break;
        }
      }
      
      if (tooClose) continue;
      
      // Berechne Score basierend auf Biom-Eignung
      let score = 0;
      if (tile.biome === 'grassland') score = 100;
      else if (tile.biome === 'deciduous_forest') score = 90;
      else if (tile.biome === 'steppe') score = 70;
      else if (tile.biome === 'coniferous_forest') score = 60;
      else if (SUITABLE_BIOMES.has(tile.biome)) score = 50;
      
      // Bonus für hohe Fruchtbarkeit
      score += tile.fertility * 10;
      
      candidates.push({ q, r, score });
    }
    
    if (candidates.length === 0) {
      console.error('❌ Keine geeignete Startposition gefunden!');
      return null;
    }
    
    // Sortiere nach Score und wähle beste Position
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    console.log(`✅ Geeignete Startposition gefunden: (${best.q}, ${best.r}) mit Score ${best.score.toFixed(1)}`);
    
    return { q: best.q, r: best.r };
  }
  
  // Chunk-Loading Handler - Lade NUR aus MongoDB + Fog-of-War für User
  private async handleRequestChunks(client: Client, message: { chunkCoords: Array<{ chunkX: number; chunkY: number }> }) {
    const CHUNK_SIZE = 16;
    const MAX_CHUNKS_PER_REQUEST = 100;
    
    const player = this.getPlayerByClient(client);
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
      const player = this.getPlayerByClient(client);
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
