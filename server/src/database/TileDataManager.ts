import { MongoClient, Db, Collection } from 'mongodb';
import { hexToKey } from '@hex-kingdom/shared';

/**
 * TileDataManager - Hybrid Database System
 * 
 * Statische Daten (Terrain, Ressourcen): Bleiben in Chunks (ChunkManager)
 * Dynamische Daten (Owner, Building-Links): Separate Collection für schnelle Updates
 * 
 * Vorteile:
 * - Schnelle Updates ohne große Chunk-Dokumente neu zu schreiben
 * - Partial Updates möglich
 * - Bessere Performance bei häufigen Änderungen
 */

export interface TileDynamicData {
  _id: string;        // "q,r" format
  q: number;
  r: number;
  owner?: string;     // Spieler-ID
  buildingId?: string; // Referenz zu Building (wenn vorhanden)
  lastModified: Date;
}

export class TileDataManager {
  private client: MongoClient;
  private db!: Db;
  private tileDynamicData!: Collection<TileDynamicData>;
  private connected = false;

  constructor(mongoUrl: string = 'mongodb://localhost:27017') {
    this.client = new MongoClient(mongoUrl);
  }

  async connect() {
    if (this.connected) return;
    
    try {
      await this.client.connect();
      this.db = this.client.db('hex-kingdom');
      this.tileDynamicData = this.db.collection<TileDynamicData>('tile_dynamic_data');
      
      // Compound Index für Bereichsabfragen
      await this.tileDynamicData.createIndex({ q: 1, r: 1 }, { unique: true });
      
      // Index für Owner-Abfragen
      await this.tileDynamicData.createIndex({ owner: 1 });
      
      this.connected = true;
      console.log('✅ TileDataManager verbunden');
    } catch (error) {
      console.error('❌ TileDataManager Verbindungsfehler:', error);
      throw error;
    }
  }

  async disconnect() {
    await this.client.close();
    this.connected = false;
  }

  // ===========================
  // TILE OWNERSHIP
  // ===========================

  async setTileOwner(q: number, r: number, owner: string): Promise<void> {
    const key = hexToKey({ q, r });
    await this.tileDynamicData.updateOne(
      { _id: key },
      { 
        $set: { 
          owner, 
          q, 
          r, 
          lastModified: new Date() 
        } 
      },
      { upsert: true }
    );
  }

  async removeTileOwner(q: number, r: number): Promise<void> {
    const key = hexToKey({ q, r });
    await this.tileDynamicData.updateOne(
      { _id: key },
      { 
        $unset: { owner: "" },
        $set: { lastModified: new Date() }
      }
    );
  }

  async getTileOwner(q: number, r: number): Promise<string | undefined> {
    const key = hexToKey({ q, r });
    const data = await this.tileDynamicData.findOne({ _id: key });
    return data?.owner;
  }

  // Lade alle Tiles eines Spielers (für Territory-View)
  async getPlayerTiles(owner: string): Promise<Array<{ q: number; r: number }>> {
    const tiles = await this.tileDynamicData
      .find({ owner })
      .project({ q: 1, r: 1, _id: 0 })
      .toArray();
    return tiles.map(t => ({ q: t.q, r: t.r }));
  }

  // ===========================
  // TILE BUILDING LINKS
  // ===========================

  async setTileBuilding(q: number, r: number, buildingId: string): Promise<void> {
    const key = hexToKey({ q, r });
    await this.tileDynamicData.updateOne(
      { _id: key },
      { 
        $set: { 
          buildingId, 
          q, 
          r, 
          lastModified: new Date() 
        } 
      },
      { upsert: true }
    );
  }

  async removeTileBuilding(q: number, r: number): Promise<void> {
    const key = hexToKey({ q, r });
    await this.tileDynamicData.updateOne(
      { _id: key },
      { 
        $unset: { buildingId: "" },
        $set: { lastModified: new Date() }
      }
    );
  }

  // ===========================
  // BULK OPERATIONS
  // ===========================

  // Lade dynamische Daten für einen Bereich (z.B. Viewport)
  async loadDynamicDataForRegion(
    minQ: number, 
    maxQ: number, 
    minR: number, 
    maxR: number
  ): Promise<Map<string, TileDynamicData>> {
    const data = await this.tileDynamicData
      .find({
        q: { $gte: minQ, $lte: maxQ },
        r: { $gte: minR, $lte: maxR }
      })
      .toArray();
    
    const dataMap = new Map<string, TileDynamicData>();
    data.forEach(tile => {
      dataMap.set(tile._id, tile);
    });
    
    return dataMap;
  }

  // Batch-Update für viele Tiles (z.B. bei Eroberung)
  async batchSetOwner(tiles: Array<{ q: number; r: number }>, owner: string): Promise<void> {
    const now = new Date();
    const operations = tiles.map(({ q, r }) => ({
      updateOne: {
        filter: { _id: hexToKey({ q, r }) },
        update: { 
          $set: { owner, q, r, lastModified: now } 
        },
        upsert: true
      }
    }));
    
    if (operations.length > 0) {
      await this.tileDynamicData.bulkWrite(operations);
    }
  }

  // ===========================
  // MAINTENANCE
  // ===========================

  // Lösche verwaiste Daten (Tiles ohne Owner UND ohne Building)
  async cleanupOrphanedData(): Promise<number> {
    const result = await this.tileDynamicData.deleteMany({
      owner: { $exists: false },
      buildingId: { $exists: false }
    });
    return result.deletedCount || 0;
  }

  // Statistiken
  async getStats(): Promise<{
    totalDynamicTiles: number;
    ownedTiles: number;
    tilesWithBuildings: number;
  }> {
    const [total, owned, withBuildings] = await Promise.all([
      this.tileDynamicData.countDocuments(),
      this.tileDynamicData.countDocuments({ owner: { $exists: true } }),
      this.tileDynamicData.countDocuments({ buildingId: { $exists: true } })
    ]);
    
    return {
      totalDynamicTiles: total,
      ownedTiles: owned,
      tilesWithBuildings: withBuildings
    };
  }
}
