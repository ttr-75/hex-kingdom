import { Pool, PoolClient } from 'pg';

export interface Building {
  id: string;
  type: string;
  q: number;
  r: number;
  owner: string;
  level: number;
  construction_start_time: number;
  construction_end_time: number;
  completed_at: Date | null;
  created_at: Date;
}

export interface TileOwnership {
  q: number;
  r: number;
  owner: string | null;
  building_id: string | null;
  last_modified: Date;
}

export interface BuildingProductionState {
  buildingId: string;
  lastUpdateTime: number;
  productionRates: {
    wood?: number;
    stone?: number;
    iron?: number;
    food?: number;
  };
}

export class BuildingRepository {
  constructor(private pool: Pool) {}

  /**
   * Initialisiere Buildings Table
   */
  static async initializeSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS buildings (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        owner VARCHAR(255) NOT NULL,
        level INTEGER DEFAULT 1,
        construction_start_time BIGINT NOT NULL,
        construction_end_time BIGINT NOT NULL,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_building_owner FOREIGN KEY (owner) 
          REFERENCES players(username) ON DELETE CASCADE
      )
    `);

    // Building Production State Table (für Offline-Produktion)
    await client.query(`
      CREATE TABLE IF NOT EXISTS building_production (
        building_id VARCHAR(255) PRIMARY KEY,
        last_update_time BIGINT NOT NULL,
        production_rates JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_production_building FOREIGN KEY (building_id)
          REFERENCES buildings(id) ON DELETE CASCADE
      )
    `);

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_buildings_owner ON buildings(owner)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_buildings_coords ON buildings(q, r)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_building_production_update_time ON building_production(last_update_time)
    `);
  }

  /**
   * Erstelle neues Gebäude
   */
  async createBuilding(building: Omit<Building, 'created_at' | 'completed_at'>): Promise<Building> {
    const result = await this.pool.query<Building>(
      `INSERT INTO buildings (id, type, q, r, owner, level, construction_start_time, construction_end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        building.id,
        building.type,
        building.q,
        building.r,
        building.owner,
        building.level,
        building.construction_start_time,
        building.construction_end_time
      ]
    );
    return result.rows[0];
  }

  /**
   * Hole Gebäude an Position (jetzt als Array, da mehrere möglich)
   */
  async getBuildingsAtPosition(q: number, r: number): Promise<Building[]> {
    const result = await this.pool.query<Building>(
      'SELECT * FROM buildings WHERE q = $1 AND r = $2 ORDER BY created_at ASC',
      [q, r]
    );
    return result.rows;
  }

  /**
   * @deprecated Use getBuildingsAtPosition instead - kept for backwards compatibility
   */
  async getBuildingAtPosition(q: number, r: number): Promise<Building | null> {
    const buildings = await this.getBuildingsAtPosition(q, r);
    return buildings[0] || null;
  }

  /**
   * Hole alle Gebäude eines Spielers
   */
  async getPlayerBuildings(owner: string): Promise<Building[]> {
    const result = await this.pool.query<Building>(
      'SELECT * FROM buildings WHERE owner = $1 ORDER BY created_at DESC',
      [owner]
    );
    return result.rows;
  }

  /**
   * Hole Gebäude MIT Tile-Informationen (JOIN)
   */
  async getPlayerBuildingsWithTiles(owner: string): Promise<Array<Building & TileOwnership>> {
    const result = await this.pool.query<Building & TileOwnership>(
      `SELECT b.*, t.last_modified as tile_last_modified
       FROM buildings b
       LEFT JOIN tile_ownership t ON b.q = t.q AND b.r = t.r
       WHERE b.owner = $1
       ORDER BY b.created_at DESC`,
      [owner]
    );
    return result.rows;
  }

  /**
   * Markiere Gebäude als fertiggestellt
   */
  async completeBuilding(buildingId: string): Promise<void> {
    await this.pool.query(
      'UPDATE buildings SET completed_at = NOW() WHERE id = $1',
      [buildingId]
    );
  }

  /**
   * Upgrade Gebäude (erhöhe Level)
   */
  async upgradeBuilding(buildingId: string, newLevel: number, endTime: number): Promise<void> {
    await this.pool.query(
      `UPDATE buildings 
       SET level = $2, construction_end_time = $3, completed_at = NULL 
       WHERE id = $1`,
      [buildingId, newLevel, endTime]
    );
  }

  /**
   * Lösche Gebäude
   */
  async deleteBuilding(buildingId: string): Promise<void> {
    await this.pool.query('DELETE FROM buildings WHERE id = $1', [buildingId]);
  }

  /**
   * TRANSAKTION: Gebäude bauen + Tile claimen
   * Verwendet einen expliziten Client für atomare Operation
   */
  async buildBuildingTransaction(
    _owner: string, // Owner wird nicht verwendet, da building.owner bereits gesetzt ist
    building: Omit<Building, 'created_at' | 'completed_at'>,
    _resourceCost: { wood?: number; stone?: number; iron?: number; gold?: number }
  ): Promise<Building> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Prüfe Anzahl der Gebäude auf diesem Tile (optional: Max-Limit)
      const existing = await client.query<Building>(
        'SELECT id FROM buildings WHERE q = $1 AND r = $2',
        [building.q, building.r]
      );
      // Optional: Limit auf z.B. 10 Gebäude pro Tile
      const MAX_BUILDINGS_PER_TILE = 10;
      if (existing.rows.length >= MAX_BUILDINGS_PER_TILE) {
        throw new Error(`Maximum number of buildings (${MAX_BUILDINGS_PER_TILE}) on this tile reached`);
      }

      // 2. Erstelle Building
      const buildingResult = await client.query<Building>(
        `INSERT INTO buildings (id, type, q, r, owner, level, construction_start_time, construction_end_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          building.id,
          building.type,
          building.q,
          building.r,
          building.owner,
          building.level,
          building.construction_start_time,
          building.construction_end_time
        ]
      );

      await client.query('COMMIT');
      console.log(`✅ Transaction completed: Building ${building.id} created`);
      return buildingResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Übertrage alle Gebäude auf einem Tile zu neuem Besitzer
   * (Wird verwendet bei Tile-Eroberung)
   */
  async transferBuildingsOnTile(q: number, r: number, newOwner: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE buildings 
       SET owner = $3 
       WHERE q = $1 AND r = $2
       RETURNING id`,
      [q, r, newOwner]
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      console.log(`✅ Transferred ${count} building(s) on tile (${q},${r}) to ${newOwner}`);
    }
    return count;
  }

  /**
   * Hole alle Gebäude auf einem Tile eines bestimmten Typs
   */
  async getBuildingsOfTypeOnTile(q: number, r: number, type: string): Promise<Building[]> {
    const result = await this.pool.query<Building>(
      'SELECT * FROM buildings WHERE q = $1 AND r = $2 AND type = $3',
      [q, r, type]
    );
    return result.rows;
  }

  /**
   * Lösche alle Gebäude auf einem Tile (für Testing/Reset)
   */
  async deleteBuildingsOnTile(q: number, r: number): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM buildings WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rowCount || 0;
  }

  // ===========================
  // BUILDING PRODUCTION STATE (für Offline-Produktion)
  // ===========================

  /**
   * Speichere Production State für ein Gebäude
   */
  async saveProductionState(state: BuildingProductionState): Promise<void> {
    await this.pool.query(
      `INSERT INTO building_production (building_id, last_update_time, production_rates)
       VALUES ($1, $2, $3)
       ON CONFLICT (building_id) DO UPDATE SET
         last_update_time = $2,
         production_rates = $3`,
      [
        state.buildingId,
        state.lastUpdateTime,
        JSON.stringify(state.productionRates)
      ]
    );
  }

  /**
   * Hole Production States für alle Gebäude eines Spielers
   */
  async getPlayerProductionStates(owner: string): Promise<BuildingProductionState[]> {
    const result = await this.pool.query(
      `SELECT bp.building_id, bp.last_update_time, bp.production_rates
       FROM building_production bp
       JOIN buildings b ON bp.building_id = b.id
       WHERE b.owner = $1`,
      [owner]
    );

    return result.rows.map(row => ({
      buildingId: row.building_id,
      lastUpdateTime: parseInt(row.last_update_time),
      productionRates: row.production_rates
    }));
  }

  /**
   * Hole Production State für ein spezifisches Gebäude
   */
  async getProductionState(buildingId: string): Promise<BuildingProductionState | null> {
    const result = await this.pool.query(
      'SELECT * FROM building_production WHERE building_id = $1',
      [buildingId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      buildingId: row.building_id,
      lastUpdateTime: parseInt(row.last_update_time),
      productionRates: row.production_rates
    };
  }

  /**
   * Lösche Production State (wenn Gebäude zerstört wird)
   */
  async deleteProductionState(buildingId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM building_production WHERE building_id = $1',
      [buildingId]
    );
  }

  /**
   * Aktualisiere nur last_update_time für mehrere Gebäude
   * (Batch-Update für Performance)
   */
  async updateProductionTimestamps(buildingIds: string[], timestamp: number): Promise<void> {
    if (buildingIds.length === 0) return;
    
    await this.pool.query(
      `UPDATE building_production 
       SET last_update_time = $1 
       WHERE building_id = ANY($2)`,
      [timestamp, buildingIds]
    );
  }
}
