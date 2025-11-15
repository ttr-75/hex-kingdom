import { Pool, PoolClient } from 'pg';

export interface Player {
  username: string;
  color: string;
  created_at: Date;
  last_login: Date;
}

export class PlayerRepository {
  constructor(private pool: Pool) {}

  /**
   * Initialisiere Players Table
   */
  static async initializeSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        username VARCHAR(255) PRIMARY KEY,
        color VARCHAR(7) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  /**
   * Erstelle oder aktualisiere Spieler (UPSERT)
   */
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

  /**
   * Hole Spieler nach Username
   */
  async getPlayer(username: string): Promise<Player | null> {
    const result = await this.pool.query<Player>(
      'SELECT * FROM players WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  /**
   * Aktualisiere Login-Zeitstempel
   */
  async updatePlayerLogin(username: string): Promise<void> {
    await this.pool.query(
      'UPDATE players SET last_login = NOW() WHERE username = $1',
      [username]
    );
  }

  /**
   * Lösche Spieler (CASCADE löscht auch Gebäude, Units, etc.)
   */
  async deletePlayer(username: string): Promise<void> {
    await this.pool.query('DELETE FROM players WHERE username = $1', [username]);
  }

  /**
   * Hole alle Spieler
   */
  async getAllPlayers(): Promise<Player[]> {
    const result = await this.pool.query<Player>(
      'SELECT * FROM players ORDER BY created_at DESC'
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
}
