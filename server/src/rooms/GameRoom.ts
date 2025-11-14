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

const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
];

export class GameRoom extends Room<GameRoomState> {
  maxClients = 10;
  private lastUpdate = Date.now();
  private chunkManager!: ChunkManager; // Definitiv zugewiesen in onCreate
  private worldSeed!: number; // Definitiv zugewiesen in onCreate

  onCreate(_options: any) {
    this.setState(new GameRoomState());
    this.state.tickRate = 10; // 10 Updates pro Sekunde
    
    // World Seed für konsistente Generierung
    this.worldSeed = _options.seed || Math.floor(Math.random() * 1000000);
    console.log(`🌍 World Seed: ${this.worldSeed}`);
    
    // MongoDB ChunkManager initialisieren
    this.chunkManager = new ChunkManager();
    this.initializeWorld();
    
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

  onJoin(client: Client, options: any) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.username = options.username || `Player_${client.sessionId.slice(0, 6)}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    
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
    
    // Gebe dem Spieler ein Startgebiet (einfache Implementierung)
    this.assignStartingTerritory(client.sessionId);
    
    console.log(`👤 ${player.username} beigetreten (${client.sessionId})`);
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
      tile.owner = client.sessionId;
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
    } catch (error) {
      console.warn('⚠️ MongoDB nicht verfügbar, verwende In-Memory-Generierung:', error);
    }
    
    // Generiere initiale Chunks um Spawn-Punkt (0,0)
    await this.generateInitialChunksAsync();
  }
  
  // Generiere initiale Chunks (3x3 um Spawn) - async Version
  private async generateInitialChunksAsync() {
    const CHUNK_SIZE = 32;
    const promises: Promise<void>[] = [];
    
    for (let cx = -1; cx <= 1; cx++) {
      for (let cy = -1; cy <= 1; cy++) {
        promises.push(this.generateChunkAsync(cx, cy, CHUNK_SIZE));
      }
    }
    
    await Promise.all(promises);
    console.log(`🗺️ ${this.state.tiles.size} initiale Tiles generiert (Seed: ${this.worldSeed})`);
  }
  
  // Generiere einen einzelnen Chunk - ASYNC mit MongoDB
  private async generateChunkAsync(chunkX: number, chunkY: number, CHUNK_SIZE: number): Promise<void> {
    // Prüfe erst, ob Chunk in MongoDB existiert
    try {
      const existingChunk = await this.chunkManager.loadChunk(chunkX, chunkY);
      
      if (existingChunk) {
        // Chunk aus DB laden
        const tiles = this.chunkManager.chunkDataToTiles([existingChunk]);
        tiles.forEach((tile, key) => {
          this.state.tiles.set(key, tile);
        });
        return;
      }
    } catch (error) {
      // MongoDB nicht verfügbar, generiere neu
    }
    
    // Chunk existiert nicht, generiere ihn
    this.generateChunk(chunkX, chunkY, CHUNK_SIZE);
    
    // Speichere generierten Chunk in MongoDB
    try {
      const chunkTiles = new Map<string, HexTileState>();
      const startQ = chunkX * CHUNK_SIZE;
      const startR = chunkY * CHUNK_SIZE;
      
      for (let localQ = 0; localQ < CHUNK_SIZE; localQ++) {
        for (let localR = 0; localR < CHUNK_SIZE; localR++) {
          const q = startQ + localQ;
          const r = startR + localR;
          const key = hexToKey({ q, r });
          const tile = this.state.tiles.get(key);
          if (tile) {
            chunkTiles.set(key, tile);
          }
        }
      }
      
      const chunkData = this.chunkManager.tilesToChunkData(chunkTiles);
      const chunkArray = Array.from(chunkData.values());
      
      if (chunkArray.length > 0) {
        await this.chunkManager.saveChunk(chunkArray[0]);
      }
    } catch (error) {
      // MongoDB write failed, ignore
    }
  }
  
  // Generiere einen einzelnen Chunk - SYNC Version
  private generateChunk(chunkX: number, chunkY: number, CHUNK_SIZE: number) {
    const startQ = chunkX * CHUNK_SIZE;
    const startR = chunkY * CHUNK_SIZE;
    
    for (let localQ = 0; localQ < CHUNK_SIZE; localQ++) {
      for (let localR = 0; localR < CHUNK_SIZE; localR++) {
        const q = startQ + localQ;
        const r = startR + localR;
        
        const key = hexToKey({ q, r });
        
        // Überspringe, wenn Tile bereits existiert
        if (this.state.tiles.has(key)) continue;
        
        const tile = new HexTileState();
        tile.q = q;
        tile.r = r;
        
        // Verwende separaten Noise für Wasser/Land und Terrain-Variation
        tile.terrain = this.getTerrainFromNoiseInfinite(q, r);
        
        // Ressourcen
        if (this.shouldHaveResource(tile.terrain)) {
          tile.resourceType = this.getResourceForTerrain(tile.terrain);
          tile.resourceAmount = Math.floor(Math.random() * 500) + 500;
        }
        
        this.state.tiles.set(key, tile);
      }
    }
  }
  
  // Noise für große Wasser/Land-Trennung
  private continentNoise(q: number, r: number): number {
    const scale1 = 0.003;  // SEHR große Kontinente (3x größer)
    const scale2 = 0.001; // Mega-große Regionen (10x größer)
    
    const seedOffset = this.worldSeed * 0.001;
    
    const noise1 = Math.sin((q + seedOffset) * scale1) * Math.cos((r + seedOffset) * scale1);
    const noise2 = Math.sin((q + seedOffset) * scale2 + 100) * Math.cos((r + seedOffset) * scale2 + 100);
    
    return (noise1 * 0.7 + noise2 * 0.3);
  }
  
  // Noise für Terrain-Variation (größere Gebiete gegen Musterung)
  private terrainNoise(q: number, r: number): number {
    const scale1 = 0.02;  // Große Features (4x größer)
    const scale2 = 0.05;  // Mittlere Details (3x größer)
    const scale3 = 0.1;   // Feine Variation (2.5x größer)
    
    const seedOffset = this.worldSeed * 0.001;
    
    const noise1 = Math.sin((q + seedOffset + 300) * scale1) * Math.cos((r + seedOffset + 300) * scale1);
    const noise2 = Math.sin((q + seedOffset + 400) * scale2) * Math.cos((r + seedOffset + 400) * scale2);
    const noise3 = Math.sin((q + seedOffset + 500) * scale3) * Math.cos((r + seedOffset + 500) * scale3);
    
    return (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2);
  }
  
  // Terrain für quasi-unendliche Map (drei-schichtige Generierung)
  private getTerrainFromNoiseInfinite(q: number, r: number): string {
    // Layer 1: Große Kontinente (Wasser vs Land)
    const continentValue = this.continentNoise(q, r);
    
    // Leichte Bias zum Zentrum
    const distance = Math.sqrt(q * q + r * r) / 100;
    const centerBias = 1.0 - Math.min(distance * 0.3, 0.5);
    
    const adjustedContinent = continentValue + centerBias * 0.2;
    
    // Ist es Wasser?
    if (adjustedContinent < -0.15) return 'water';
    
    // Layer 2: Höhen-Variation (Flachland vs Gebirge)
    const elevationNoise = this.terrainNoise(q, r);
    
    // Layer 3: Feuchtigkeit/Vegetation (unabhängig von Höhe)
    const moistureNoise = this.terrainNoise(q + 1000, r + 1000); // Offset für Unabhängigkeit
    
    // Kombiniere beide Layer für flexible Übergänge
    // Höhe bestimmt: mountain/hills vs flach
    // Feuchtigkeit bestimmt: forest/grass vs desert
    
    const isHighElevation = elevationNoise > 0.7;
    const isMediumElevation = elevationNoise > 0.6 && elevationNoise <= 0.7;
    const isWet = moistureNoise > 0;
    
    // Berge (immer hoch)
    if (isHighElevation && elevationNoise > 0.5) return 'mountain';
    
    // Hügel (mittlere/hohe Höhe)
    if (isHighElevation || isMediumElevation) {
      // Hügel können an Wald ODER Gras grenzen
      return 'hills';
    }
    
    // Flachland: Vegetation abhängig von Feuchtigkeit
    if (isWet) {
      // Feuchte Gebiete -> Wald oder Gras
      return moistureNoise > 0.3 ? 'forest' : 'grass';
    } else {
      // Trockene Gebiete -> Wüste oder Gras
      return moistureNoise < -0.3 ? 'desert' : 'grass';
    }
  }
  
  // Ressourcen basierend auf Terrain
  private shouldHaveResource(terrain: string): boolean {
    const chances: Record<string, number> = {
      forest: 0.25,
      mountain: 0.30,
      hills: 0.20,
      grass: 0.10,
      desert: 0.05,
      water: 0
    };
    return Math.random() < (chances[terrain] || 0);
  }
  
  private getResourceForTerrain(terrain: string): string {
    if (terrain === 'forest') return Math.random() > 0.5 ? ResourceType.WOOD : ResourceType.WOOD;
    if (terrain === 'mountain') return Math.random() > 0.5 ? ResourceType.STONE : ResourceType.IRON;
    if (terrain === 'hills') return Math.random() > 0.7 ? ResourceType.GOLD : ResourceType.STONE;
    if (terrain === 'desert') return ResourceType.GOLD;
    return Math.random() > 0.5 ? ResourceType.WOOD : ResourceType.STONE;
  }

  private assignStartingTerritory(playerId: string) {
    // Einfache Implementierung: Gebe jedem Spieler ein paar Felder in der Nähe des Spawns
    const playerIndex = this.state.players.size - 1;
    const angle = (playerIndex * 2 * Math.PI) / 8; // Verteile bis zu 8 Spieler im Kreis
    const spawnDistance = 10;
    
    const spawnQ = Math.round(spawnDistance * Math.cos(angle));
    const spawnR = Math.round(spawnDistance * Math.sin(angle));
    
    // Markiere 7 Hexfelder um den Spawn herum als Territorium
    for (let dq = -1; dq <= 1; dq++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (Math.abs(dq + dr) > 1) continue;
        
        const tileKey = hexToKey({ q: spawnQ + dq, r: spawnR + dr });
        const tile = this.state.tiles.get(tileKey);
        if (tile) {
          tile.owner = playerId;
        }
      }
    }
  }
  
  // Chunk-Loading Handler - ASYNC mit MongoDB
  private async handleRequestChunks(_client: Client, message: { chunkCoords: Array<{ chunkX: number; chunkY: number }> }) {
    const CHUNK_SIZE = 32;
    const MAX_CHUNKS_PER_REQUEST = 100; // Erhöht für große Viewports
    
    // Limitiere Anzahl der Chunks
    const limitedCoords = message.chunkCoords.slice(0, MAX_CHUNKS_PER_REQUEST);
    
    console.log(`📥 Chunk request: ${message.chunkCoords.length} chunks requested`);
    
    // Generiere Chunks parallel
    const promises = limitedCoords.map(async (coord) => {
      // Prüfe, ob dieser Chunk bereits Tiles enthält
      const startQ = coord.chunkX * CHUNK_SIZE;
      const startR = coord.chunkY * CHUNK_SIZE;
      const key = hexToKey({ q: startQ, r: startR });
      
      if (!this.state.tiles.has(key)) {
        // Chunk existiert nicht -> generiere ihn (mit MongoDB-Check)
        await this.generateChunkAsync(coord.chunkX, coord.chunkY, CHUNK_SIZE);
        return true;
      }
      return false;
    });
    
    const results = await Promise.all(promises);
    const newChunkCount = results.filter(r => r).length;
    
    if (newChunkCount > 0) {
      console.log(`📦 ${newChunkCount} neue Chunks generiert (${this.state.tiles.size} Tiles total)`);
    }
    
    if (message.chunkCoords.length > MAX_CHUNKS_PER_REQUEST) {
      console.warn(`⚠️ Chunk request limited: ${message.chunkCoords.length} → ${MAX_CHUNKS_PER_REQUEST}`);
    }
  }
}
