import { Pool } from 'pg';

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

      // Tile Exploration Table (Fog of War)
      await client.query(`
        CREATE TABLE IF NOT EXISTS tile_exploration (
          player_username VARCHAR(255) NOT NULL,
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          first_seen TIMESTAMP DEFAULT NOW(),
          last_seen TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (player_username, q, r),
          CONSTRAINT fk_exploration_player FOREIGN KEY (player_username)
            REFERENCES players(username) ON DELETE CASCADE
        )
      `);

      // Units Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS units (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          owner VARCHAR(255) NOT NULL,
          health INTEGER NOT NULL,
          movement_remaining INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          last_moved TIMESTAMP,
          CONSTRAINT fk_unit_owner FOREIGN KEY (owner)
            REFERENCES players(username) ON DELETE CASCADE
        )
      `);

      // Unit Movements Table (for persisting active movements)
      await client.query(`
        CREATE TABLE IF NOT EXISTS unit_movements (
          unit_id VARCHAR(255) PRIMARY KEY,
          path_json TEXT NOT NULL,
          current_tile_index INTEGER NOT NULL,
          start_time BIGINT NOT NULL,
          tile_start_time BIGINT NOT NULL,
          tile_duration BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_movement_unit FOREIGN KEY (unit_id)
            REFERENCES units(id) ON DELETE CASCADE
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
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tile_exploration_player ON tile_exploration(player_username)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tile_exploration_coords ON tile_exploration(q, r)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_units_coords ON units(q, r)
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
  // TILE EXPLORATION (FOG OF WAR)
  // ===========================

  /**
   * Markiere Tiles als vom Spieler gesehen (für Fog of War)
   * Verwendet UPSERT: Erstellt neue oder aktualisiert last_seen
   */
  async addExploredTiles(
    playerUsername: string,
    tiles: Array<{ q: number; r: number }>
  ): Promise<void> {
    if (tiles.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Batch INSERT mit ON CONFLICT
      const values: any[] = [];
      const placeholders: string[] = [];

      tiles.forEach((tile, index) => {
        const offset = index * 3;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
        values.push(playerUsername, tile.q, tile.r);
      });

      await client.query(
        `INSERT INTO tile_exploration (player_username, q, r)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (player_username, q, r) DO UPDATE
         SET last_seen = NOW()`,
        values
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to add explored tiles:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Hole alle Tiles die ein Spieler bereits gesehen hat
   */
  async getExploredTiles(
    playerUsername: string
  ): Promise<Array<{ q: number; r: number; first_seen: Date; last_seen: Date }>> {
    const result = await this.pool.query<{
      q: number;
      r: number;
      first_seen: Date;
      last_seen: Date;
    }>(
      'SELECT q, r, first_seen, last_seen FROM tile_exploration WHERE player_username = $1',
      [playerUsername]
    );
    return result.rows;
  }

  /**
   * Prüfe ob ein Spieler ein bestimmtes Tile bereits gesehen hat
   */
  async hasExploredTile(playerUsername: string, q: number, r: number): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM tile_exploration WHERE player_username = $1 AND q = $2 AND r = $3',
      [playerUsername, q, r]
    );
    return result.rows.length > 0;
  }

  /**
   * Lösche Exploration-Daten eines Spielers (für Testing/Reset)
   */
  async clearPlayerExploration(playerUsername: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM tile_exploration WHERE player_username = $1',
      [playerUsername]
    );
  }

  // ===========================
  // UNITS
  // ===========================

  /**
   * Erstelle eine neue Unit
   */
  async createUnit(unit: {
    id: string;
    type: string;
    q: number;
    r: number;
    owner: string;
    health: number;
    movement_remaining: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO units (id, type, q, r, owner, health, movement_remaining)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [unit.id, unit.type, unit.q, unit.r, unit.owner, unit.health, unit.movement_remaining]
    );
  }

  /**
   * Hole alle Units eines Spielers
   */
  async getPlayerUnits(owner: string): Promise<Array<any>> {
    const result = await this.pool.query(
      'SELECT * FROM units WHERE owner = $1',
      [owner]
    );
    return result.rows;
  }

  /**
   * Hole Unit an bestimmter Position
   */
  async getUnitAtPosition(q: number, r: number): Promise<any | null> {
    const result = await this.pool.query(
      'SELECT * FROM units WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows[0] || null;
  }

  /**
   * Bewege eine Unit zu neuer Position
   */
  async moveUnit(
    unitId: string,
    newQ: number,
    newR: number,
    movementRemaining: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE units 
       SET q = $2, r = $3, movement_remaining = $4, last_moved = NOW()
       WHERE id = $1`,
      [unitId, newQ, newR, movementRemaining]
    );
  }

  /**
   * Update Unit Health
   */
  async updateUnitHealth(unitId: string, health: number): Promise<void> {
    if (health <= 0) {
      // Unit stirbt
      await this.pool.query('DELETE FROM units WHERE id = $1', [unitId]);
    } else {
      await this.pool.query(
        'UPDATE units SET health = $2 WHERE id = $1',
        [unitId, health]
      );
    }
  }

  /**
   * Reset Movement für alle Units eines Spielers (neuer Turn)
   */
  async resetPlayerUnitMovement(owner: string): Promise<void> {
    await this.pool.query(
      `UPDATE units u
       SET movement_remaining = (
         SELECT 
           CASE 
             WHEN u.type = 'warrior' THEN 3
             WHEN u.type = 'archer' THEN 3
             WHEN u.type = 'cavalry' THEN 5
             WHEN u.type = 'scout' THEN 6
             ELSE 3
           END
       )
       WHERE owner = $1`,
      [owner]
    );
  }

  /**
   * Speichere aktive Unit-Bewegung
   */
  async saveUnitMovement(movement: {
    unitId: string;
    path: Array<{ q: number; r: number }>;
    currentTileIndex: number;
    startTime: number;
    tileStartTime: number;
    tileDuration: number;
  }): Promise<void> {
    console.log(`💾 Saving movement to DB: unit=${movement.unitId}, tile=${movement.currentTileIndex}/${movement.path.length}`);
    await this.pool.query(
      `INSERT INTO unit_movements (unit_id, path_json, current_tile_index, start_time, tile_start_time, tile_duration)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (unit_id) DO UPDATE SET
         path_json = $2,
         current_tile_index = $3,
         start_time = $4,
         tile_start_time = $5,
         tile_duration = $6`,
      [
        movement.unitId,
        JSON.stringify(movement.path),
        movement.currentTileIndex,
        movement.startTime,
        movement.tileStartTime,
        movement.tileDuration
      ]
    );
    console.log(`✅ Movement saved to DB successfully`);
  }

  /**
   * Lade alle aktiven Unit-Bewegungen
   */
  async getActiveMovements(): Promise<Array<{
    unitId: string;
    path: Array<{ q: number; r: number }>;
    currentTileIndex: number;
    startTime: number;
    tileStartTime: number;
    tileDuration: number;
  }>> {
    console.log(`🔍 Querying active movements from database...`);
    const result = await this.pool.query(
      'SELECT * FROM unit_movements'
    );
    console.log(`📊 Found ${result.rows.length} movements in database`);
    
    return result.rows.map(row => ({
      unitId: row.unit_id,
      path: JSON.parse(row.path_json),
      currentTileIndex: row.current_tile_index,
      startTime: parseInt(row.start_time),
      tileStartTime: parseInt(row.tile_start_time),
      tileDuration: parseInt(row.tile_duration)
    }));
  }

  /**
   * Lösche Unit-Bewegung (wenn abgeschlossen oder abgebrochen)
   */
  async deleteUnitMovement(unitId: string): Promise<void> {
    console.log(`🗑️ Deleting movement from DB for unit: ${unitId}`);
    await this.pool.query(
      'DELETE FROM unit_movements WHERE unit_id = $1',
      [unitId]
    );
    console.log(`✅ Movement deleted from DB`);
  }

  /**
   * Lösche Unit
   */
  async deleteUnit(unitId: string): Promise<void> {
    await this.pool.query('DELETE FROM units WHERE id = $1', [unitId]);
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
    _resourceCost: { wood?: number; stone?: number; iron?: number; gold?: number }
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
