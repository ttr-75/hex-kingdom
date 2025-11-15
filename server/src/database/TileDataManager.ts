import { Pool } from 'pg';
import { TileRepository } from './repositories/TileRepository.js';
import { ChunkManager } from './ChunkManager.js';

/**
 * TileDataManager - Hybrid Database System
 * 
 * STATISCHE WELT-DATEN (MongoDB Chunks via ChunkManager):
 * - Terrain/Biome
 * - Fertility  
 * - Initial Resources (bei Map-Generierung)
 * - Initial Population (bei Map-Generierung)
 * - Bleibt für UNCLAIMED Tiles die Source of Truth
 * 
 * DYNAMISCHE SPIEL-DATEN (PostgreSQL via TileRepository):
 * - Owner (tile_ownership) - NUR für claimed Tiles
 * - Resources (tile_resources) - dynamisch, nur für claimed Tiles
 * - Population (tile_population) - dynamisch, nur für claimed Tiles
 * - Buildings (buildings table)
 * 
 * WORKFLOW:
 * 1. Gesamte Map liegt in MongoDB Chunks (statisch)
 * 2. Tile wird geclaimed -> claimTile() migriert Daten von MongoDB -> PostgreSQL
 * 3. Ab dann: PostgreSQL = Source of Truth für dieses Tile
 * 4. Unclaimed Tiles bleiben nur in MongoDB
 */

export class TileDataManager {
  private tileRepository: TileRepository;
  private chunkManager: ChunkManager;

  constructor(postgresPool?: Pool, chunkManager?: ChunkManager) {
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
    
    // Falls kein ChunkManager übergeben wurde, erstelle einen neuen
    this.chunkManager = chunkManager || new ChunkManager(
      process.env.MONGO_URL || 'mongodb://localhost:27017'
    );
  }

  // ===========================
  // TILE OWNERSHIP (Delegation)
  // ===========================

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
   * 🎯 OFFIZIELL: Claim Tile für Spieler
   * 
   * LOGIK:
   * 1. Prüfe ob Tile bereits in PostgreSQL existiert
   *    - JA: Update Owner (re-claim oder Eroberung)
   *    - NEIN: Lade aus MongoDB und migriere nach PostgreSQL
   * 2. Setze Owner in PostgreSQL
   * 3. Bei Erst-Claim: Migriere statische Daten (resources, population) aus MongoDB
   * 
   * @param q Tile Q-Koordinate
   * @param r Tile R-Koordinate
   * @param owner Neuer Besitzer
   */
  async claimTile(
    q: number,
    r: number,
    owner: string
  ): Promise<void> {
    // 1. Prüfe ob Tile bereits in PostgreSQL existiert
    const existingOwner = await this.tileRepository.getTileOwner(q, r);
    
    if (existingOwner) {
      // Tile existiert bereits in PostgreSQL
      if (existingOwner === owner) {
        console.log(`ℹ️ Tile (${q},${r}) gehört bereits ${owner}`);
        return;
      }
      
      // Ownership-Wechsel (Eroberung oder Re-Claim)
      console.log(`🔄 Tile (${q},${r}) Ownership-Wechsel: ${existingOwner} -> ${owner}`);
      await this.tileRepository.setTileOwner(q, r, owner);
      return;
    }
    
    // 2. Tile ist noch NICHT in PostgreSQL -> Erst-Claim, lade aus MongoDB
    console.log(`📥 Tile (${q},${r}) wird aus MongoDB geladen für Erst-Claim...`);
    
    try {
      // Stelle sicher dass ChunkManager verbunden ist
      await this.chunkManager.connect();
      
      // Lade Tile aus MongoDB
      const tileFromMongo = await this.chunkManager.getTile(q, r);
      
      if (!tileFromMongo) {
        throw new Error(`Tile (${q},${r}) nicht in MongoDB gefunden!`);
      }
      
      // Extrahiere statische Daten
      const staticData: {
        resources?: Array<{ type: string; amount: number }>;
        population?: number;
        biome?: string;
        fertility?: number;
      } = {};
      
      // Biom aus MongoDB
      if (tileFromMongo.biome) {
        staticData.biome = tileFromMongo.biome;
      }
      
      // Fruchtbarkeit aus MongoDB
      if (tileFromMongo.fertility !== undefined) {
        staticData.fertility = tileFromMongo.fertility;
      }
      
      // Resources aus MongoDB (falls vorhanden)
      if (tileFromMongo.resources && tileFromMongo.resources.length > 0) {
        staticData.resources = tileFromMongo.resources.map((res: { type: string; amount: number }) => ({
          type: res.type,
          amount: res.amount
        }));
      }
      
      // Population aus MongoDB (falls vorhanden)
      if (tileFromMongo.population && tileFromMongo.population > 0) {
        staticData.population = tileFromMongo.population;
      }
      
      // 3. Migriere nach PostgreSQL mit statischen Daten
      await this.tileRepository.claimTile(q, r, owner, staticData);
      
      console.log(`✅ Tile (${q},${r}) erfolgreich aus MongoDB migriert und von ${owner} geclaimt`);
      
    } catch (error) {
      console.error(`❌ Fehler beim Laden von Tile (${q},${r}) aus MongoDB:`, error);
      throw error;
    }
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
}
