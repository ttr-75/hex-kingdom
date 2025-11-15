import { Pool, PoolClient } from 'pg';

export interface TileOwnership {
  q: number;
  r: number;
  owner: string | null;
  last_modified: Date;
}

export interface TileExploration {
  player_username: string;
  q: number;
  r: number;
  first_seen: Date;
  last_seen: Date;
}

export class TileRepository {
  constructor(private pool: Pool) {}

  /**
   * Initialisiere Tile Ownership & Exploration Tables
   */
  static async initializeSchema(client: PoolClient): Promise<void> {
    // Tile Ownership Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tile_ownership (
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        owner VARCHAR(255),
        last_modified TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (q, r),
        CONSTRAINT fk_tile_owner FOREIGN KEY (owner) 
          REFERENCES players(username) ON DELETE SET NULL
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

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_ownership_owner ON tile_ownership(owner)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_exploration_player ON tile_exploration(player_username)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_exploration_coords ON tile_exploration(q, r)
    `);
  }

  // ===========================
  // TILE OWNERSHIP
  // ===========================

  /**
   * Setze Tile Owner (UPSERT)
   */
  async setTileOwner(q: number, r: number, owner: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tile_ownership (q, r, owner, last_modified)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (q, r) DO UPDATE 
       SET owner = $3, last_modified = NOW()`,
      [q, r, owner]
    );
  }

  /**
   * Entferne Tile Owner
   */
  async removeTileOwner(q: number, r: number): Promise<void> {
    await this.pool.query(
      'UPDATE tile_ownership SET owner = NULL, last_modified = NOW() WHERE q = $1 AND r = $2',
      [q, r]
    );
  }

  /**
   * Hole Tile Owner
   */
  async getTileOwner(q: number, r: number): Promise<string | null> {
    const result = await this.pool.query<TileOwnership>(
      'SELECT owner FROM tile_ownership WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows[0]?.owner || null;
  }

  /**
   * Hole alle Tiles eines Spielers
   */
  async getPlayerTiles(owner: string): Promise<Array<{ q: number; r: number }>> {
    const result = await this.pool.query<{ q: number; r: number }>(
      'SELECT q, r FROM tile_ownership WHERE owner = $1',
      [owner]
    );
    return result.rows;
  }

  /**
   * @deprecated Building references are now managed separately via buildings table
   */
  async setTileBuilding(_q: number, _r: number, _buildingId: string): Promise<void> {
    console.warn('setTileBuilding is deprecated - buildings are now managed via the buildings table');
    // No-op: Buildings sind jetzt direkt über die buildings table mit q,r verknüpft
  }

  /**
   * @deprecated Building references are now managed separately via buildings table
   */
  async removeTileBuilding(_q: number, _r: number): Promise<void> {
    console.warn('removeTileBuilding is deprecated - buildings are now managed via the buildings table');
    // No-op: Buildings werden über die buildings table verwaltet
  }

  /**
   * Cleanup: Lösche Tiles ohne Owner
   */
  async cleanupOrphanedTiles(): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM tile_ownership WHERE owner IS NULL'
    );
    return result.rowCount || 0;
  }

  // ===========================
  // TILE EXPLORATION (FOG OF WAR)
  // ===========================

  /**
   * Markiere Tiles als vom Spieler gesehen (Batch UPSERT)
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
   * Hole alle vom Spieler erkundeten Tiles
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
   * Prüfe ob Spieler ein Tile gesehen hat
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
}
