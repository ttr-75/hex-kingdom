import { MongoClient, Db, Collection } from 'mongodb';
import { HexTileState } from '../rooms/GameRoomState.js';
import { hexToKey } from '@hex-kingdom/shared';
import { TerrainType, ResourceType } from '@hex-kingdom/shared';

const CHUNK_SIZE = 16; // 16x16 Hexagone pro Chunk (256 Tiles = kleinere Dokumente)

export interface ChunkData {
  _id: string;
  chunkX: number;
  chunkY: number;
  tiles: Array<{
    q: number;
    r: number;
    terrain: TerrainType;
    resourceType?: ResourceType;
    resourceAmount?: number;
    // HINWEIS: 'owner' ist NICHT hier - wird in TileDataManager gespeichert!
  }>;
  lastModified: Date;
}

export class ChunkManager {
  private client: MongoClient;
  private db!: Db;
  private chunks!: Collection<ChunkData>;
  private connected = false;

  constructor(mongoUrl: string = 'mongodb://localhost:27017') {
    this.client = new MongoClient(mongoUrl);
  }

  async connect() {
    if (this.connected) return;
    
    try {
      await this.client.connect();
      this.db = this.client.db('hex-kingdom');
      this.chunks = this.db.collection<ChunkData>('chunks');
      
      // Index für schnelle Chunk-Abfragen
      await this.chunks.createIndex({ chunkX: 1, chunkY: 1 }, { unique: true });
      
      this.connected = true;
      console.log('✅ MongoDB verbunden');
    } catch (error) {
      console.error('❌ MongoDB Verbindungsfehler:', error);
      throw error;
    }
  }

  async disconnect() {
    await this.client.close();
    this.connected = false;
  }

  // Berechne Chunk-Koordinaten aus Hex-Koordinaten
  getChunkCoords(q: number, r: number): { chunkX: number; chunkY: number } {
    return {
      chunkX: Math.floor(q / CHUNK_SIZE),
      chunkY: Math.floor(r / CHUNK_SIZE)
    };
  }

  // Chunk-ID generieren
  getChunkId(chunkX: number, chunkY: number): string {
    return `chunk_${chunkX}_${chunkY}`;
  }

  // Lade einen Chunk aus der DB
  async loadChunk(chunkX: number, chunkY: number): Promise<ChunkData | null> {
    const chunkId = this.getChunkId(chunkX, chunkY);
    return await this.chunks.findOne({ _id: chunkId });
  }

  // Speichere einen Chunk in die DB
  async saveChunk(chunkData: ChunkData): Promise<void> {
    chunkData.lastModified = new Date();
    await this.chunks.updateOne(
      { _id: chunkData._id },
      { $set: chunkData },
      { upsert: true }
    );
  }

  // Lade mehrere Chunks (für Viewport)
  async loadChunks(chunkCoords: Array<{ chunkX: number; chunkY: number }>): Promise<ChunkData[]> {
    const chunkIds = chunkCoords.map(c => this.getChunkId(c.chunkX, c.chunkY));
    return await this.chunks.find({ _id: { $in: chunkIds } }).toArray();
  }

  // Konvertiere HexTileState Map zu ChunkData
  tilesToChunkData(tiles: Map<string, HexTileState>): Map<string, ChunkData> {
    const chunksMap = new Map<string, ChunkData>();

    tiles.forEach((tile) => {
      const { chunkX, chunkY } = this.getChunkCoords(tile.q, tile.r);
      const chunkId = this.getChunkId(chunkX, chunkY);

      if (!chunksMap.has(chunkId)) {
        chunksMap.set(chunkId, {
          _id: chunkId,
          chunkX,
          chunkY,
          tiles: [],
          lastModified: new Date()
        });
      }

      const chunk = chunksMap.get(chunkId)!;
      chunk.tiles.push({
        q: tile.q,
        r: tile.r,
        terrain: tile.terrain as TerrainType,
        // owner wird NICHT gespeichert - siehe TileDataManager
        resourceType: tile.resourceType as ResourceType | undefined,
        resourceAmount: tile.resourceAmount
      });
    });

    return chunksMap;
  }

  // Konvertiere ChunkData zurück zu HexTileState Map
  chunkDataToTiles(chunks: ChunkData[]): Map<string, HexTileState> {
    const tilesMap = new Map<string, HexTileState>();

    chunks.forEach(chunk => {
      chunk.tiles.forEach(tileData => {
        const tile = new HexTileState();
        tile.q = tileData.q;
        tile.r = tileData.r;
        tile.terrain = tileData.terrain;
        // owner wird NICHT aus Chunk geladen - siehe TileDataManager
        if (tileData.resourceType) tile.resourceType = tileData.resourceType;
        if (tileData.resourceAmount) tile.resourceAmount = tileData.resourceAmount;

        tilesMap.set(hexToKey({ q: tile.q, r: tile.r }), tile);
      });
    });

    return tilesMap;
  }
}
