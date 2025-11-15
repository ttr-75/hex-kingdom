import { Pool, PoolClient } from 'pg';

export interface Unit {
  id: string;
  type: string;
  q: number;
  r: number;
  owner: string;
  health: number;
  movement_remaining: number;
  created_at: Date;
  last_moved: Date | null;
}

export interface UnitMovement {
  unitId: string;
  path: Array<{ q: number; r: number }>;
  currentTileIndex: number;
  startTime: number;
  tileStartTime: number;
  tileDuration: number;
}

export class UnitRepository {
  constructor(private pool: Pool) {}

  /**
   * Initialisiere Units & Unit Movements Tables
   */
  static async initializeSchema(client: PoolClient): Promise<void> {
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

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_units_coords ON units(q, r)
    `);
  }

  // ===========================
  // UNIT CRUD
  // ===========================

  /**
   * Erstelle neue Unit
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
  async getPlayerUnits(owner: string): Promise<Unit[]> {
    const result = await this.pool.query<Unit>(
      'SELECT * FROM units WHERE owner = $1',
      [owner]
    );
    return result.rows;
  }

  /**
   * Hole Unit an bestimmter Position
   */
  async getUnitAtPosition(q: number, r: number): Promise<Unit | null> {
    const result = await this.pool.query<Unit>(
      'SELECT * FROM units WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows[0] || null;
  }

  /**
   * Bewege Unit zu neuer Position
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
   * Aktualisiere Unit Health
   * Wenn Health <= 0, wird Unit gelöscht
   */
  async updateUnitHealth(unitId: string, health: number): Promise<void> {
    if (health <= 0) {
      await this.pool.query('DELETE FROM units WHERE id = $1', [unitId]);
    } else {
      await this.pool.query(
        'UPDATE units SET health = $2 WHERE id = $1',
        [unitId, health]
      );
    }
  }

  /**
   * Lösche Unit
   */
  async deleteUnit(unitId: string): Promise<void> {
    await this.pool.query('DELETE FROM units WHERE id = $1', [unitId]);
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

  // ===========================
  // UNIT MOVEMENT PERSISTENCE
  // ===========================

  /**
   * Speichere aktive Unit-Bewegung (für Server-Restart Persistenz)
   */
  async saveUnitMovement(movement: UnitMovement): Promise<void> {
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
   * Lade alle aktiven Unit-Bewegungen (beim Server-Start)
   */
  async getActiveMovements(): Promise<UnitMovement[]> {
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
}
