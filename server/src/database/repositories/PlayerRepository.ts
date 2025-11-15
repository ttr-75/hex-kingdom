import { Pool, PoolClient } from 'pg';

export interface Player {
  username: string;
  color: string;
  created_at: Date;
  last_login: Date;
}

export interface PlayerResources {
  username: string;
  wood: number;
  stone: number;
  iron: number;
  gold: number;
  food: number;
  fish: number;
  storage_wood: number;
  storage_stone: number;
  storage_iron: number;
  storage_gold: number;
  storage_food: number;
  storage_fish: number;
  last_updated: Date;
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
    
    // Player Resources Table (für Persistence)
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_resources (
        username VARCHAR(255) PRIMARY KEY REFERENCES players(username) ON DELETE CASCADE,
        wood NUMERIC(10,2) DEFAULT 0,
        stone NUMERIC(10,2) DEFAULT 0,
        iron NUMERIC(10,2) DEFAULT 0,
        gold NUMERIC(10,2) DEFAULT 0,
        food NUMERIC(10,2) DEFAULT 0,
        fish NUMERIC(10,2) DEFAULT 0,
        storage_wood INTEGER DEFAULT 1000,
        storage_stone INTEGER DEFAULT 1000,
        storage_iron INTEGER DEFAULT 1000,
        storage_gold INTEGER DEFAULT 1000,
        storage_food INTEGER DEFAULT 1000,
        storage_fish INTEGER DEFAULT 1000,
        last_updated TIMESTAMP DEFAULT NOW()
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
   * Speichere Player Resources in PostgreSQL
   */
  async savePlayerResources(resources: {
    username: string;
    wood: number;
    stone: number;
    iron: number;
    gold: number;
    food: number;
    fish: number;
    storageWood: number;
    storageStone: number;
    storageIron: number;
    storageGold: number;
    storageFood: number;
    storageFish: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_resources 
       (username, wood, stone, iron, gold, food, fish, 
        storage_wood, storage_stone, storage_iron, storage_gold, storage_food, storage_fish, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (username) DO UPDATE 
       SET wood = $2, stone = $3, iron = $4, gold = $5, food = $6, fish = $7,
           storage_wood = $8, storage_stone = $9, storage_iron = $10, 
           storage_gold = $11, storage_food = $12, storage_fish = $13, 
           last_updated = NOW()`,
      [
        resources.username,
        resources.wood,
        resources.stone,
        resources.iron,
        resources.gold,
        resources.food,
        resources.fish,
        resources.storageWood,
        resources.storageStone,
        resources.storageIron,
        resources.storageGold,
        resources.storageFood,
        resources.storageFish
      ]
    );
  }

  /**
   * Lade Player Resources aus PostgreSQL
   */
  async getPlayerResources(username: string): Promise<PlayerResources | null> {
    const result = await this.pool.query<PlayerResources>(
      'SELECT * FROM player_resources WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
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
