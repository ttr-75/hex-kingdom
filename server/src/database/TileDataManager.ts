import { MongoClient, Db, Collection } from 'mongodb';
import { hexToKey } from '@hex-kingdom/shared';
import { Pool } from 'pg';
import { TileRepository } from './repositories/TileRepository.js';

/**
 * TileDataManager - Hybrid Database System
 * 
 * STATISCHE DATEN (MongoDB Chunks via ChunkManager):
 * - Terrain/Biome
 * - Fertility
 * - Initial Resources (bei Map-Generierung)
 * - Initial Population (bei Map-Generierung)
 * 
 * DYNAMISCHE DATEN (PostgreSQL via TileRepository):
 * - Owner (tile_ownership)
 * - Resources (tile_resources) - nur für claimed Tiles
 * - Population (tile_population) - nur für claimed Tiles
 * - Buildings (buildings table)
 * 
 * WORKFLOW:
 * 1. Neues Tile wird geclaimed -> migrateStaticToDynamic()
 * 2. Ab dann: PostgreSQL = Source of Truth
 * 3. Tile-Besitzerwechsel -> nur owner in PostgreSQL ändern
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
  private tileRepository: TileRepository;

  constructor(
    mongoUrl: string = 'mongodb://localhost:27017',
    postgresPool?: Pool
  ) {
    this.client = new MongoClient(mongoUrl);
    // Falls kein Pool übergeben wurde, erstelle einen neuen (sollte aber normalerweise übergeben werden)
    this.tileRepository = new TileRepository(
      postgresPool || new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'hex_kingdom',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      })
    );
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

  /**
   * Setze Tile Owner (PostgreSQL)
   */
  async setTileOwner(q: number, r: number, owner: string): Promise<void> {
    await this.tileRepository.setTileOwner(q, r, owner);
  }

  /**
   * Entferne Tile Owner (PostgreSQL)
   */
  async removeTileOwner(q: number, r: number): Promise<void> {
    await this.tileRepository.removeTileOwner(q, r);
  }

  /**
   * Hole Tile Owner (PostgreSQL)
   */
  async getTileOwner(q: number, r: number): Promise<string | null> {
    return await this.tileRepository.getTileOwner(q, r);
  }

  /**
   * Lade alle Tiles eines Spielers (PostgreSQL)
   */
  async getPlayerTiles(owner: string): Promise<Array<{ q: number; r: number }>> {
    return await this.tileRepository.getPlayerTiles(owner);
  }

  // ===========================
  // TILE CLAIM & MIGRATION
  // ===========================

  /**
   * Claim Tile: Migriere statische Daten (MongoDB) -> dynamische Daten (PostgreSQL)
   * 
   * @param q Tile Q-Koordinate
   * @param r Tile R-Koordinate
   * @param owner Neuer Besitzer
   * @param staticData Statische Daten aus MongoDB Chunks (resources, population)
   */
  async claimTile(
    q: number,
    r: number,
    owner: string,
    staticData?: {
      resources?: Array<{ type: string; amount: number }>;
      population?: number;
    }
  ): Promise<void> {
    // 1. Setze Owner in PostgreSQL
    await this.tileRepository.setTileOwner(q, r, owner);

    // 2. Migriere Resources (falls vorhanden)
    if (staticData?.resources && staticData.resources.length > 0) {
      await this.tileRepository.setTileResources(q, r, staticData.resources);
    }

    // 3. Migriere Population (falls vorhanden)
    if (staticData?.population && staticData.population > 0) {
      await this.tileRepository.setTilePopulation(q, r, staticData.population);
    }

    console.log(`✅ Tile (${q},${r}) claimed by ${owner}${staticData ? ' with static data migrated' : ''}`);
  }

  /**
   * Übertrage Tile zu neuem Besitzer (inkl. Gebäude)
   * Resources & Population bleiben erhalten!
   */
  async transferTile(
    q: number,
    r: number,
    newOwner: string,
    transferBuildings: boolean = true
  ): Promise<void> {
    // 1. Ändere Owner
    await this.tileRepository.setTileOwner(q, r, newOwner);

    // 2. Optional: Übertrage Gebäude
    if (transferBuildings) {
      // Diese Methode wird in BuildingRepository implementiert
      // await this.buildingRepository.transferBuildingsOnTile(q, r, newOwner);
      console.log(`✅ Tile (${q},${r}) transferred to ${newOwner} (buildings transfer pending)`);
    }

    console.log(`✅ Tile (${q},${r}) transferred to ${newOwner}`);
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
