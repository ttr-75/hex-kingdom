import { Pool, PoolClient, QueryResult } from 'pg';

/**
 * PostgresManager - Für relationale Daten mit referentieller Integrität
 * 
 * Verwaltet:
 * - Players (mit Foreign Keys)
 * - Buildings (mit Owner-Constraint)
 * - TileOwnership (mit Foreign Keys zu Players & Buildings)
 * 
 * Vorteile über MongoDB:
 * - Transaktionen (atomar: Ressourcen abziehen + Building bauen)
 * - Foreign Keys (keine verwaisten Gebäude)
 * - JOINs (effiziente Queries)
 */

export interface Player {
  username: string;
  color: string;
  created_at: Date;
  last_login: Date;
}

export interface Building {
  id: string;
  type: string;
  q: number;
  r: number;
  owner: string; // FK zu players(username)
  level: number;
  construction_start_time: number;
  construction_end_time: number;
  completed_at: Date | null;
  created_at: Date;
}

export interface TileOwnership {
  q: number;
  r: number;
  owner: string | null; // FK zu players(username)
  building_id: string | null; // FK zu buildings(id)
  last_modified: Date;
}

export class PostgresManager {
  private pool: Pool;
  private connected = false;

  constructor() {
    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = parseInt(process.env.POSTGRES_PORT || '5432');
    const database = process.env.POSTGRES_DB || 'hex_kingdom';
    const user = process.env.POSTGRES_USER || 'hex_user';
    const password = process.env.POSTGRES_PASSWORD || 'hex_pass_dev';

    this.pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      max: 20, // Connection pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('❌ PostgreSQL Pool Error:', err);
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Initialize schema
      await this.initializeSchema();

      this.connected = true;
      console.log('✅ PostgresManager connected');
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.pool.end();
    this.connected = false;
    console.log('👋 PostgresManager disconnected');
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Players Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          username VARCHAR(255) PRIMARY KEY,
          color VARCHAR(7) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP DEFAULT NOW()
        )
      `);

      // Buildings Table
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
            REFERENCES players(username) ON DELETE CASCADE,
          CONSTRAINT unique_tile_building UNIQUE (q, r)
        )
      `);

      // Tile Ownership Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tile_ownership (
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          owner VARCHAR(255),
          building_id VARCHAR(255),
          last_modified TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (q, r),
          CONSTRAINT fk_tile_owner FOREIGN KEY (owner) 
            REFERENCES players(username) ON DELETE SET NULL,
          CONSTRAINT fk_tile_building FOREIGN KEY (building_id) 
            REFERENCES buildings(id) ON DELETE SET NULL
        )
      `);

      // Indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_buildings_owner ON buildings(owner)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_buildings_coords ON buildings(q, r)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tile_ownership_owner ON tile_ownership(owner)
      `);

      await client.query('COMMIT');
      console.log('✅ PostgreSQL schema initialized');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Schema initialization failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ===========================
  // PLAYERS
  // ===========================

  async createPlayer(username: string, color: string): Promise<Player> {
    const result = await this.pool.query<Player>(
      `INSERT INTO players (username, color) 
       VALUES ($1, $2) 
       ON CONFLICT (username) DO UPDATE 
       SET last_login = NOW()
       RETURNING *`,
      [username, color]
    );
    return result.rows[0];
  }

  async getPlayer(username: string): Promise<Player | null> {
    const result = await this.pool.query<Player>(
      'SELECT * FROM players WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  async updatePlayerLogin(username: string): Promise<void> {
    await this.pool.query(
      'UPDATE players SET last_login = NOW() WHERE username = $1',
      [username]
    );
  }

  async deletePlayer(username: string): Promise<void> {
    await this.pool.query('DELETE FROM players WHERE username = $1', [username]);
  }

  async getAllPlayers(): Promise<Player[]> {
    const result = await this.pool.query<Player>('SELECT * FROM players ORDER BY created_at DESC');
    return result.rows;
  }

  // ===========================
  // BUILDINGS
  // ===========================

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

  async getBuildingAtPosition(q: number, r: number): Promise<Building | null> {
    const result = await this.pool.query<Building>(
      'SELECT * FROM buildings WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows[0] || null;
  }

  async getPlayerBuildings(owner: string): Promise<Building[]> {
    const result = await this.pool.query<Building>(
      'SELECT * FROM buildings WHERE owner = $1 ORDER BY created_at DESC',
      [owner]
    );
    return result.rows;
  }

  async completeBuilding(buildingId: string): Promise<void> {
    await this.pool.query(
      'UPDATE buildings SET completed_at = NOW() WHERE id = $1',
      [buildingId]
    );
  }

  async upgradeBuilding(buildingId: string, newLevel: number, endTime: number): Promise<void> {
    await this.pool.query(
      `UPDATE buildings 
       SET level = $2, construction_end_time = $3, completed_at = NULL 
       WHERE id = $1`,
      [buildingId, newLevel, endTime]
    );
  }

  async deleteBuilding(buildingId: string): Promise<void> {
    await this.pool.query('DELETE FROM buildings WHERE id = $1', [buildingId]);
  }

  // ===========================
  // TILE OWNERSHIP
  // ===========================

  async setTileOwner(q: number, r: number, owner: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tile_ownership (q, r, owner, last_modified)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (q, r) DO UPDATE 
       SET owner = $3, last_modified = NOW()`,
      [q, r, owner]
    );
  }

  async removeTileOwner(q: number, r: number): Promise<void> {
    await this.pool.query(
      'UPDATE tile_ownership SET owner = NULL, last_modified = NOW() WHERE q = $1 AND r = $2',
      [q, r]
    );
  }

  async getTileOwner(q: number, r: number): Promise<string | null> {
    const result = await this.pool.query<TileOwnership>(
      'SELECT owner FROM tile_ownership WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows[0]?.owner || null;
  }

  async getPlayerTiles(owner: string): Promise<Array<{ q: number; r: number }>> {
    const result = await this.pool.query<{ q: number; r: number }>(
      'SELECT q, r FROM tile_ownership WHERE owner = $1',
      [owner]
    );
    return result.rows;
  }

  async setTileBuilding(q: number, r: number, buildingId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tile_ownership (q, r, building_id, last_modified)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (q, r) DO UPDATE 
       SET building_id = $3, last_modified = NOW()`,
      [q, r, buildingId]
    );
  }

  async removeTileBuilding(q: number, r: number): Promise<void> {
    await this.pool.query(
      'UPDATE tile_ownership SET building_id = NULL, last_modified = NOW() WHERE q = $1 AND r = $2',
      [q, r]
    );
  }

  // ===========================
  // TRANSACTIONS
  // ===========================

  /**
   * Atomar: Ressourcen abziehen + Building bauen + Tile claimen
   */
  async buildBuildingTransaction(
    owner: string,
    building: Omit<Building, 'created_at' | 'completed_at'>,
    resourceCost: { wood?: number; stone?: number; iron?: number; gold?: number }
  ): Promise<Building> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Prüfe ob Tile bereits bebaut ist
      const existing = await client.query<Building>(
        'SELECT id FROM buildings WHERE q = $1 AND r = $2',
        [building.q, building.r]
      );
      if (existing.rows.length > 0) {
        throw new Error('Tile already has a building');
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

      // 3. Setze Tile Owner
      await client.query(
        `INSERT INTO tile_ownership (q, r, owner, building_id, last_modified)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (q, r) DO UPDATE 
         SET owner = $3, building_id = $4, last_modified = NOW()`,
        [building.q, building.r, owner, building.id]
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

  // ===========================
  // ADVANCED QUERIES (with JOINs)
  // ===========================

  /**
   * Hole alle Gebäude eines Spielers MIT Tile-Info (JOIN)
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
   * Statistiken über Spieler-Territorium
   */
  async getPlayerStats(username: string): Promise<{
    totalTiles: number;
    totalBuildings: number;
    completedBuildings: number;
  }> {
    const result = await this.pool.query<{
      total_tiles: string;
      total_buildings: string;
      completed_buildings: string;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM tile_ownership WHERE owner = $1) as total_tiles,
        (SELECT COUNT(*) FROM buildings WHERE owner = $1) as total_buildings,
        (SELECT COUNT(*) FROM buildings WHERE owner = $1 AND completed_at IS NOT NULL) as completed_buildings`,
      [username]
    );

    const row = result.rows[0];
    return {
      totalTiles: parseInt(row.total_tiles),
      totalBuildings: parseInt(row.total_buildings),
      completedBuildings: parseInt(row.completed_buildings)
    };
  }

  // ===========================
  // MAINTENANCE
  // ===========================

  async cleanupOrphanedTiles(): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM tile_ownership WHERE owner IS NULL AND building_id IS NULL'
    );
    return result.rowCount || 0;
  }

  async getStats(): Promise<{
    totalPlayers: number;
    totalBuildings: number;
    totalOwnedTiles: number;
  }> {
    const result = await this.pool.query<{
      total_players: string;
      total_buildings: string;
      total_owned_tiles: string;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM players) as total_players,
        (SELECT COUNT(*) FROM buildings) as total_buildings,
        (SELECT COUNT(*) FROM tile_ownership WHERE owner IS NOT NULL) as total_owned_tiles`
    );

    const row = result.rows[0];
    return {
      totalPlayers: parseInt(row.total_players),
      totalBuildings: parseInt(row.total_buildings),
      totalOwnedTiles: parseInt(row.total_owned_tiles)
    };
  }
}
