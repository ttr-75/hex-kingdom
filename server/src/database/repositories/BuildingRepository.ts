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

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_buildings_owner ON buildings(owner)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_buildings_coords ON buildings(q, r)
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
    owner: string,
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

      // 3. Setze Tile Owner (wenn noch nicht gesetzt)
      await client.query(
        `INSERT INTO tile_ownership (q, r, owner, last_modified)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (q, r) DO UPDATE 
         SET owner = COALESCE(tile_ownership.owner, $3), last_modified = NOW()`,
        [building.q, building.r, owner]
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
}
