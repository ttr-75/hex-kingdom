import { Room, Client } from '@colyseus/core';
import {
  GameRoomState,
  PlayerState,
  BuildingState,
  HexTileState,
  TradeOfferState
} from './GameRoomState.js';
import {
  BuildCommand,
  ResearchCommand,
  CreateTradeOfferCommand,
  AcceptTradeOfferCommand,
  BUILDING_DEFINITIONS,
  STARTING_RESOURCES,
  STARTING_STORAGE_CAPACITY,
  TECHNOLOGY_DEFINITIONS,
  ResourceType,
  hexToKey
} from '@hex-kingdom/shared';
import { ChunkManager } from '../database/ChunkManager.js';
import { TileDataManager } from '../database/TileDataManager.js';

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
  private chunkManager!: ChunkManager; // Definitiv zugewiesen in onCreate
  private tileDataManager!: TileDataManager; // Für dynamische Tile-Daten

  async onCreate(_options: any) {
    this.setState(new GameRoomState());
    this.state.tickRate = 10; // 10 Updates pro Sekunde
    
    // MongoDB ChunkManager initialisieren
    this.chunkManager = new ChunkManager();
    await this.initializeWorld();
    
    // Game Loop
    this.setSimulationInterval(() => this.update(), 1000 / this.state.tickRate);
    
    // Message Handlers
    this.onMessage('build', (client, message: BuildCommand) => {
      this.handleBuild(client, message);
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
    player.id = client.sessionId;
    player.username = options.username || `Player_${client.sessionId.slice(0, 6)}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    
    // Bestimme Spieler-Typ (admin oder user)
    const isAdmin = options.username === 'admin';
    (player as any).isAdmin = isAdmin; // Temporär, wird nicht synchronisiert
    
    // Startressourcen
    player.wood = STARTING_RESOURCES.wood;
    player.stone = STARTING_RESOURCES.stone;
    player.iron = STARTING_RESOURCES.iron;
    player.gold = STARTING_RESOURCES.gold;
    player.food = STARTING_RESOURCES.food;
    
    // Lagerkapazität
    player.storageWood = STARTING_STORAGE_CAPACITY.wood;
    player.storageStone = STARTING_STORAGE_CAPACITY.stone;
    player.storageIron = STARTING_STORAGE_CAPACITY.iron;
    player.storageGold = STARTING_STORAGE_CAPACITY.gold;
    player.storageFood = STARTING_STORAGE_CAPACITY.food;
    
    this.state.players.set(client.sessionId, player);
    
    console.log(`👤 ${player.username} beigetreten (${client.sessionId}) [${isAdmin ? 'Admin' : 'User'}]`);
    
    // Prüfe ob Spieler bereits Territorium hat (aus DB laden)
    let hasTerritory = false;
    try {
      const existingTiles = await this.tileDataManager.getPlayerTiles(client.sessionId);
      hasTerritory = existingTiles.length > 0;
      
      if (hasTerritory) {
        console.log(`🏠 Spieler hat bereits ${existingTiles.length} Tiles`);
        
        // Setze Owner im RAM für bereits existierende Tiles
        existingTiles.forEach(({ q, r }) => {
          const key = hexToKey({ q, r });
          const tile = this.state.tiles.get(key);
          if (tile) {
            tile.owner = client.sessionId;
          }
        });
      }
    } catch (error) {
      console.error('Fehler beim Laden des Spieler-Territoriums:', error);
    }
    
    // Wenn kein Territorium: Weise neues zu
    let spawnPosition = { q: 0, r: 0 };
    if (!hasTerritory) {
      spawnPosition = await this.assignStartingTerritory(client.sessionId, isAdmin);
    } else {
      // Berechne Zentrum des existierenden Territoriums
      const tiles = await this.tileDataManager.getPlayerTiles(client.sessionId);
      if (tiles.length > 0) {
        const avgQ = tiles.reduce((sum, t) => sum + t.q, 0) / tiles.length;
        const avgR = tiles.reduce((sum, t) => sum + t.r, 0) / tiles.length;
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
      if (tile.owner === client.sessionId) ownedCount++;
    });
    console.log(`🏠 Player owns ${ownedCount} tiles immediately after join`);
    
    // Sende initiale sichtbare Tiles an Client (Fog-of-War)
    this.sendVisibleTilesToClient(client.sessionId, isAdmin);
  }
  
  // Sende nur sichtbare Tiles an einen spezifischen Client
  private sendVisibleTilesToClient(clientId: string, isAdmin: boolean) {
    const VISION_RADIUS = 2;
    const visibleTiles: Array<any> = [];
    
    if (isAdmin) {
      // Admin sieht alles
      this.state.tiles.forEach((tile, key) => {
        visibleTiles.push({
          key,
          q: tile.q,
          r: tile.r,
          terrain: tile.terrain,
          owner: tile.owner,
          resourceType: tile.resourceType,
          resourceAmount: tile.resourceAmount
        });
      });
    } else {
      // User: Sammle owned tiles
      const ownedTiles: Array<{ q: number; r: number }> = [];
      this.state.tiles.forEach(tile => {
        if (tile.owner === clientId) {
          ownedTiles.push({ q: tile.q, r: tile.r });
        }
      });
      
      // Berechne sichtbare Tiles
      const visibleKeys = new Set<string>();
      ownedTiles.forEach(owned => {
        this.state.tiles.forEach((tile, key) => {
          const dq = tile.q - owned.q;
          const dr = tile.r - owned.r;
          const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
          
          if (distance <= VISION_RADIUS) {
            visibleKeys.add(key);
          }
        });
      });
      
      // Sammle sichtbare Tiles
      visibleKeys.forEach(key => {
        const tile = this.state.tiles.get(key);
        if (tile) {
          visibleTiles.push({
            key,
            q: tile.q,
            r: tile.r,
            terrain: tile.terrain,
            owner: tile.owner,
            resourceType: tile.resourceType,
            resourceAmount: tile.resourceAmount
          });
        }
      });
    }
    
    console.log(`📤 Sending ${visibleTiles.length} visible tiles to client ${clientId}`);
    
    const client = this.clients.find(c => c.sessionId === clientId);
    if (client) {
      client.send('visibleTiles', { tiles: visibleTiles });
    }
  }

  onLeave(client: Client, _consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`👋 ${player.username} hat verlassen`);
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

  private updateConstruction(deltaSeconds: number) {
    this.state.buildings.forEach((building) => {
      if (building.constructionProgress >= 1) return;
      
      const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
      const progressPerSecond = 1 / def.constructionTime;
      
      building.constructionProgress = Math.min(
        1,
        building.constructionProgress + progressPerSecond * deltaSeconds
      );
      
      if (building.constructionProgress >= 1) {
        this.broadcast('buildingCompleted', {
          buildingId: building.id,
          owner: building.owner
        });
      }
    });
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

  private handleBuild(client: Client, command: BuildCommand) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    
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
    
    // Kosten abziehen
    if (def.baseCost.wood) player.wood -= def.baseCost.wood;
    if (def.baseCost.stone) player.stone -= def.baseCost.stone;
    if (def.baseCost.iron) player.iron -= def.baseCost.iron;
    if (def.baseCost.gold) player.gold -= def.baseCost.gold;
    
    // Gebäude erstellen
    const building = new BuildingState();
    building.id = `${client.sessionId}_${Date.now()}`;
    building.type = command.buildingType;
    building.q = command.position.q;
    building.r = command.position.r;
    building.owner = client.sessionId;
    building.level = 1;
    building.constructionProgress = 0;
    
    this.state.buildings.set(building.id, building);
    
    // Markiere Feld als besetzt
    const tile = this.state.tiles.get(tileKey);
    if (tile) {
      tile.owner = client.sessionId; // Update RAM
    }
    
    // Async: Update DB (fire & forget)
    Promise.all([
      this.tileDataManager.setTileOwner(command.position.q, command.position.r, client.sessionId),
      this.tileDataManager.setTileBuilding(command.position.q, command.position.r, building.id)
    ]).catch(err => {
      console.error('Failed to save tile building data:', err);
    });
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
    
    // Forschung starten
    player.currentResearch = command.technology;
    player.researchEndTime = Date.now() + tech.researchTime * 1000;
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
  // MAP GENERATION
  // ===========================
  
  private async initializeWorld() {
    try {
      // Verbinde zu MongoDB
      await this.chunkManager.connect();
      console.log('✅ ChunkManager connected');
      
      // Verbinde TileDataManager
      this.tileDataManager = new TileDataManager();
      await this.tileDataManager.connect();
    } catch (error) {
      console.error('❌ MongoDB nicht verfügbar:', error);
      throw new Error('MongoDB connection required for game operation');
    }
    
    // Lade initiale Chunks um Spawn-Punkt (0,0) aus DB
    await this.loadInitialChunksAsync();
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
      this.tileDataManager.batchSetOwner(tilesToOwn, playerId).catch(err => {
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
      this.sendVisibleTilesToClient(client.sessionId, isAdmin);
    }
  }
  
  // Filtere Chunks basierend auf Spieler-Sichtbarkeit (Fog-of-War)
  private filterVisibleChunks(
    playerId: string, 
    requestedChunks: Array<{ chunkX: number; chunkY: number }>,
    visionRadius: number
  ): Array<{ chunkX: number; chunkY: number }> {
    const CHUNK_SIZE = 16;
    
    // Sammle alle Tiles des Spielers
    const playerTiles: Set<string> = new Set();
    this.state.tiles.forEach((tile, key) => {
      if (tile.owner === playerId) {
        playerTiles.add(key);
      }
    });
    
    if (playerTiles.size === 0) {
      return []; // Spieler hat keine Tiles -> keine Sicht
    }
    
    // Berechne sichtbare Tile-Bereiche (mit Vision-Radius)
    const visibleChunks = new Set<string>();
    
    playerTiles.forEach(tileKey => {
      const [qStr, rStr] = tileKey.split(',');
      const q = parseInt(qStr);
      const r = parseInt(rStr);
      
      // Für jedes Spieler-Tile: Berechne sichtbare Tiles im Radius
      for (let dq = -visionRadius; dq <= visionRadius; dq++) {
        for (let dr = -visionRadius; dr <= visionRadius; dr++) {
          const ds = -dq - dr;
          if (Math.abs(dq) <= visionRadius && 
              Math.abs(dr) <= visionRadius && 
              Math.abs(ds) <= visionRadius) {
            
            const visQ = q + dq;
            const visR = r + dr;
            
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
