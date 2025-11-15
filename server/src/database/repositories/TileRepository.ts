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

export interface TileResourceData {
  q: number;
  r: number;
  resource_type: string;
  amount: number;
  last_modified: Date;
}

export interface TilePopulationData {
  q: number;
  r: number;
  population: number;
  last_modified: Date;
}

export class TileRepository {
  constructor(private pool: Pool) {}

  /**
   * Initialisiere Tile Ownership, Exploration, Resources & Population Tables
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

    // Tile Resources Table (Dynamische Ressourcen für claimed Tiles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tile_resources (
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        last_modified TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (q, r, resource_type)
      )
    `);

    // Tile Population Table (Dynamische Population für claimed Tiles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tile_population (
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        population INTEGER NOT NULL DEFAULT 0,
        last_modified TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (q, r)
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_resources_coords ON tile_resources(q, r)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_population_coords ON tile_population(q, r)
    `);
  }

  // ===========================
  // TILE OWNERSHIP
  // ===========================

  /**
   * Setze Tile Owner (UPSERT)
   */
  /**
   * 🎯 OFFIZIELL: Tile für Spieler claimen
   * 
   * Prüft ob Tile bereits einen Owner hat:
   * - Wenn KEIN Owner: Setze neuen Owner und migriere Daten
   * - Wenn OWNER existiert: Werfe Fehler (Tile schon vergeben)
   * 
   * @throws Error wenn Tile bereits einem anderen Spieler gehört
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
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Prüfe ob Tile bereits einen Owner hat
      const existingOwner = await client.query<TileOwnership>(
        'SELECT owner FROM tile_ownership WHERE q = $1 AND r = $2',
        [q, r]
      );
      
      if (existingOwner.rows.length > 0 && existingOwner.rows[0].owner) {
        throw new Error(`Tile (${q},${r}) gehört bereits ${existingOwner.rows[0].owner}`);
      }
      
      // 2. Setze Owner
      await client.query(
        `INSERT INTO tile_ownership (q, r, owner, last_modified)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (q, r) DO UPDATE 
         SET owner = $3, last_modified = NOW()`,
        [q, r, owner]
      );
      
      // 3. Migriere Resources (falls vorhanden)
      if (staticData?.resources && staticData.resources.length > 0) {
        await this.setTileResources(q, r, staticData.resources);
      }
      
      // 4. Migriere Population (falls vorhanden)
      if (staticData?.population && staticData.population > 0) {
        await this.setTilePopulation(q, r, staticData.population);
      }
      
      await client.query('COMMIT');
      console.log(`✅ Tile (${q},${r}) claimed by ${owner}${staticData ? ' with static data migrated' : ''}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ⚠️ INTERNAL: Setze/Update Tile Owner ohne Prüfungen
   * Verwende claimTile() für neue Tile-Übernahme!
   * Diese Methode wird für Transfers/Updates verwendet.
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

  // ===========================
  // TILE RESOURCES (DYNAMISCH)
  // ===========================

  /**
   * Setze Ressourcen für ein Tile (ersetzt alle bestehenden)
   */
  async setTileResources(
    q: number,
    r: number,
    resources: Array<{ type: string; amount: number }>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lösche alte Ressourcen
      await client.query(
        'DELETE FROM tile_resources WHERE q = $1 AND r = $2',
        [q, r]
      );

      // Füge neue Ressourcen hinzu
      if (resources.length > 0) {
        const values: any[] = [];
        const placeholders: string[] = [];

        resources.forEach((res, index) => {
          const offset = index * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(q, r, res.type, res.amount);
        });

        await client.query(
          `INSERT INTO tile_resources (q, r, resource_type, amount)
           VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to set tile resources:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Hole alle Ressourcen eines Tiles
   */
  async getTileResources(q: number, r: number): Promise<Array<{ type: string; amount: number }>> {
    const result = await this.pool.query<{ resource_type: string; amount: string }>(
      'SELECT resource_type, amount FROM tile_resources WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows.map(row => ({ 
      type: row.resource_type, 
      amount: parseFloat(row.amount) 
    }));
  }

  /**
   * Update eine einzelne Ressource auf einem Tile (UPSERT)
   */
  async updateTileResource(
    q: number,
    r: number,
    resourceType: string,
    amount: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO tile_resources (q, r, resource_type, amount, last_modified)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (q, r, resource_type) DO UPDATE 
       SET amount = $4, last_modified = NOW()`,
      [q, r, resourceType, amount]
    );
  }

  /**
   * Erhöhe/Verringere Ressourcenmenge (Delta)
   */
  async adjustTileResource(
    q: number,
    r: number,
    resourceType: string,
    delta: number
  ): Promise<number> {
    const result = await this.pool.query<{ amount: string }>(
      `INSERT INTO tile_resources (q, r, resource_type, amount, last_modified)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (q, r, resource_type) DO UPDATE 
       SET amount = tile_resources.amount + $4, last_modified = NOW()
       RETURNING amount`,
      [q, r, resourceType, delta]
    );
    return parseFloat(result.rows[0].amount);
  }

  /**
   * Lösche alle Ressourcen eines Tiles
   */
  async clearTileResources(q: number, r: number): Promise<void> {
    await this.pool.query(
      'DELETE FROM tile_resources WHERE q = $1 AND r = $2',
      [q, r]
    );
  }

  // ===========================
  // TILE POPULATION (DYNAMISCH)
  // ===========================

  /**
   * Setze Population für ein Tile (UPSERT)
   */
  async setTilePopulation(q: number, r: number, population: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO tile_population (q, r, population, last_modified)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (q, r) DO UPDATE 
       SET population = $3, last_modified = NOW()`,
      [q, r, population]
    );
  }

  /**
   * Hole Population eines Tiles
   */
  async getTilePopulation(q: number, r: number): Promise<number> {
    const result = await this.pool.query<{ population: number }>(
      'SELECT population FROM tile_population WHERE q = $1 AND r = $2',
      [q, r]
    );
    return result.rows[0]?.population || 0;
  }

  /**
   * Erhöhe/Verringere Population (Delta)
   */
  async adjustTilePopulation(q: number, r: number, delta: number): Promise<number> {
    const result = await this.pool.query<{ population: number }>(
      `INSERT INTO tile_population (q, r, population, last_modified)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (q, r) DO UPDATE 
       SET population = tile_population.population + $3, last_modified = NOW()
       RETURNING population`,
      [q, r, delta]
    );
    return result.rows[0].population;
  }

  /**
   * Lösche Population eines Tiles
   */
  async clearTilePopulation(q: number, r: number): Promise<void> {
    await this.pool.query(
      'DELETE FROM tile_population WHERE q = $1 AND r = $2',
      [q, r]
    );
  }

  /**
   * Hole gesamte Population eines Spielers
   */
  async getPlayerTotalPopulation(owner: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(tp.population), 0) as total
       FROM tile_population tp
       JOIN tile_ownership tow ON tp.q = tow.q AND tp.r = tow.r
       WHERE tow.owner = $1`,
      [owner]
    );
    return parseInt(result.rows[0].total);
  }
}
