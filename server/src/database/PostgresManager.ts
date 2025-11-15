import { Pool } from 'pg';
import { PlayerRepository, Player } from './repositories/PlayerRepository';
import { BuildingRepository, Building, TileOwnership } from './repositories/BuildingRepository';
import { UnitRepository, Unit, UnitMovement } from './repositories/UnitRepository';
import { TileRepository } from './repositories/TileRepository';

/**
 * PostgresManager - Connection Pool & Repository Coordinator
 * 
 * Repository Pattern mit Domain-Driven Design:
 * - Jedes Repository verwaltet sein eigenes Schema
 * - PlayerRepository: Player CRUD & stats + schema
 * - BuildingRepository: Building operations & transactions + schema
 * - UnitRepository: Unit management & movement persistence + schema
 * - TileRepository: Tile ownership & exploration + schema
 * 
 * Vorteile:
 * - Separation of Concerns (Domain = Entity + Schema)
 * - Bessere Testbarkeit (Repositories einzeln mockbar)
 * - Klarere Code-Organisation
 * - Einfachere Migration (jedes Repository kennt seine Tabellen)
 */

// Re-export types for backward compatibility
export type { Player, Building, TileOwnership, Unit, UnitMovement };

export class PostgresManager {
  private pool: Pool;
  private connected = false;

  // Repositories (Dependency Injection Pattern)
  public readonly players: PlayerRepository;
  public readonly buildings: BuildingRepository;
  public readonly units: UnitRepository;
  public readonly tiles: TileRepository;

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

    // Initialize repositories
    this.players = new PlayerRepository(this.pool);
    this.buildings = new BuildingRepository(this.pool);
    this.units = new UnitRepository(this.pool);
    this.tiles = new TileRepository(this.pool);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Test connection & Initialize schema
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      
      // Initialize schema (each repository manages its own tables)
      await client.query('BEGIN');
      await PlayerRepository.initializeSchema(client);
      await BuildingRepository.initializeSchema(client);
      await UnitRepository.initializeSchema(client);
      await TileRepository.initializeSchema(client);
      await client.query('COMMIT');
      
      client.release();

      this.connected = true;
      console.log('✅ PostgresManager connected & schema initialized');
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

  // ===========================
  // PLAYERS (Delegate to PlayerRepository)
  // ===========================

  async createPlayer(username: string, color: string): Promise<Player> {
    return this.players.createPlayer(username, color);
  }

  async getPlayer(username: string): Promise<Player | null> {
    return this.players.getPlayer(username);
  }

  async updatePlayerLogin(username: string): Promise<void> {
    return this.players.updatePlayerLogin(username);
  }

  async deletePlayer(username: string): Promise<void> {
    return this.players.deletePlayer(username);
  }

  async getAllPlayers(): Promise<Player[]> {
    return this.players.getAllPlayers();
  }

  async getPlayerStats(username: string): Promise<{
    totalTiles: number;
    totalBuildings: number;
    completedBuildings: number;
  }> {
    return this.players.getPlayerStats(username);
  }

  // ===========================
  // BUILDINGS (Delegate to BuildingRepository)
  // ===========================

  async createBuilding(building: Omit<Building, 'created_at' | 'completed_at'>): Promise<Building> {
    return this.buildings.createBuilding(building);
  }

  async getBuildingAtPosition(q: number, r: number): Promise<Building | null> {
    return this.buildings.getBuildingAtPosition(q, r);
  }

  async getBuildingsAtPosition(q: number, r: number): Promise<Building[]> {
    return this.buildings.getBuildingsAtPosition(q, r);
  }

  async getPlayerBuildings(owner: string): Promise<Building[]> {
    return this.buildings.getPlayerBuildings(owner);
  }

  async getPlayerBuildingsWithTiles(owner: string): Promise<Array<Building & TileOwnership>> {
    return this.buildings.getPlayerBuildingsWithTiles(owner);
  }

  async completeBuilding(buildingId: string): Promise<void> {
    return this.buildings.completeBuilding(buildingId);
  }

  async upgradeBuilding(buildingId: string, newLevel: number, endTime: number): Promise<void> {
    return this.buildings.upgradeBuilding(buildingId, newLevel, endTime);
  }

  async deleteBuilding(buildingId: string): Promise<void> {
    return this.buildings.deleteBuilding(buildingId);
  }

  async buildBuildingTransaction(
    owner: string,
    building: Omit<Building, 'created_at' | 'completed_at'>,
    resourceCost: { wood?: number; stone?: number; iron?: number; gold?: number }
  ): Promise<Building> {
    return this.buildings.buildBuildingTransaction(owner, building, resourceCost);
  }

  // ===========================
  // TILE OWNERSHIP (Delegate to TileRepository)
  // ===========================

  async setTileOwner(q: number, r: number, owner: string): Promise<void> {
    return this.tiles.setTileOwner(q, r, owner);
  }

  async removeTileOwner(q: number, r: number): Promise<void> {
    return this.tiles.removeTileOwner(q, r);
  }

  async getTileOwner(q: number, r: number): Promise<string | null> {
    return this.tiles.getTileOwner(q, r);
  }

  async getPlayerTiles(owner: string): Promise<Array<{ q: number; r: number }>> {
    return this.tiles.getPlayerTiles(owner);
  }

  async setTileBuilding(q: number, r: number, buildingId: string): Promise<void> {
    return this.tiles.setTileBuilding(q, r, buildingId);
  }

  async removeTileBuilding(q: number, r: number): Promise<void> {
    return this.tiles.removeTileBuilding(q, r);
  }

  async cleanupOrphanedTiles(): Promise<number> {
    return this.tiles.cleanupOrphanedTiles();
  }

  // ===========================
  // TILE EXPLORATION (Delegate to TileRepository)
  // ===========================

  async addExploredTiles(
    playerUsername: string,
    tiles: Array<{ q: number; r: number }>
  ): Promise<void> {
    return this.tiles.addExploredTiles(playerUsername, tiles);
  }

  async getExploredTiles(
    playerUsername: string
  ): Promise<Array<{ q: number; r: number; first_seen: Date; last_seen: Date }>> {
    return this.tiles.getExploredTiles(playerUsername);
  }

  async hasExploredTile(playerUsername: string, q: number, r: number): Promise<boolean> {
    return this.tiles.hasExploredTile(playerUsername, q, r);
  }

  async clearPlayerExploration(playerUsername: string): Promise<void> {
    return this.tiles.clearPlayerExploration(playerUsername);
  }

  // ===========================
  // UNITS (Delegate to UnitRepository)
  // ===========================

  async createUnit(unit: {
    id: string;
    type: string;
    q: number;
    r: number;
    owner: string;
    health: number;
    movement_remaining: number;
  }): Promise<void> {
    return this.units.createUnit(unit);
  }

  async getPlayerUnits(owner: string): Promise<Unit[]> {
    return this.units.getPlayerUnits(owner);
  }

  async getUnitAtPosition(q: number, r: number): Promise<Unit | null> {
    return this.units.getUnitAtPosition(q, r);
  }

  async moveUnit(
    unitId: string,
    newQ: number,
    newR: number,
    movementRemaining: number
  ): Promise<void> {
    return this.units.moveUnit(unitId, newQ, newR, movementRemaining);
  }

  async updateUnitHealth(unitId: string, health: number): Promise<void> {
    return this.units.updateUnitHealth(unitId, health);
  }

  async deleteUnit(unitId: string): Promise<void> {
    return this.units.deleteUnit(unitId);
  }

  async resetPlayerUnitMovement(owner: string): Promise<void> {
    return this.units.resetPlayerUnitMovement(owner);
  }

  async saveUnitMovement(movement: UnitMovement): Promise<void> {
    return this.units.saveUnitMovement(movement);
  }

  async getActiveMovements(): Promise<UnitMovement[]> {
    return this.units.getActiveMovements();
  }

  async deleteUnitMovement(unitId: string): Promise<void> {
    return this.units.deleteUnitMovement(unitId);
  }

  // ===========================
  // MAINTENANCE & STATS
  // ===========================

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
