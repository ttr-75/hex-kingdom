import { PostgresManager } from '../database/PostgresManager.js';
import { PlayerManager } from '../database/PlayerManager.js';
import { BuildingManager } from '../database/BuildingManager.js';
import { TileDataManager } from '../database/TileDataManager.js';

/**
 * Migration Script: MongoDB → PostgreSQL
 * 
 * Migriert:
 * - Players Collection → players Table
 * - Buildings Collection → buildings Table
 * - tileDynamicData Collection → tile_ownership Table
 */

async function migrate() {
  console.log('═══════════════════════════════════════');
  console.log('🔄 MongoDB → PostgreSQL Migration');
  console.log('═══════════════════════════════════════\n');

  const postgres = new PostgresManager();
  const playerManager = new PlayerManager();
  const buildingManager = new BuildingManager();
  const tileDataManager = new TileDataManager();

  try {
    // Connect to both databases
    console.log('📡 Connecting to databases...');
    await postgres.connect();
    await playerManager.connect();
    await buildingManager.connect();
    await tileDataManager.connect();
    console.log('✅ Connected\n');

    // 1. Migrate Players
    console.log('👥 Migrating Players...');
    const mongoPlayers = await playerManager.getAllPlayers();
    let playersCount = 0;
    
    for (const mongoPlayer of mongoPlayers) {
      try {
        await postgres.createPlayer(mongoPlayer.username, mongoPlayer.color);
        playersCount++;
        console.log(`  ✅ ${mongoPlayer.username}`);
      } catch (error: any) {
        if (error.code === '23505') { // Duplicate key
          console.log(`  ⚠️ ${mongoPlayer.username} (already exists)`);
        } else {
          console.error(`  ❌ ${mongoPlayer.username}:`, error.message);
        }
      }
    }
    console.log(`✅ Migrated ${playersCount}/${mongoPlayers.length} players\n`);

    // 2. Migrate Buildings
    console.log('🏗️ Migrating Buildings...');
    const allPlayers = await postgres.getAllPlayers();
    let buildingsCount = 0;

    for (const player of allPlayers) {
      const mongoBuildings = await buildingManager.getPlayerBuildings(player.username);
      
      for (const mongoBuilding of mongoBuildings) {
        try {
          const building = await postgres.createBuilding({
            id: mongoBuilding.id,
            type: mongoBuilding.type,
            q: mongoBuilding.q,
            r: mongoBuilding.r,
            owner: mongoBuilding.owner,
            level: mongoBuilding.level,
            construction_start_time: mongoBuilding.constructionStartTime,
            construction_end_time: mongoBuilding.constructionEndTime
          });

          // Mark as completed if applicable
          if (mongoBuilding.completedAt) {
            await postgres.completeBuilding(building.id);
          }

          buildingsCount++;
          console.log(`  ✅ ${mongoBuilding.type} at (${mongoBuilding.q}, ${mongoBuilding.r})`);
        } catch (error: any) {
          if (error.code === '23505') { // Duplicate or unique constraint
            console.log(`  ⚠️ Building at (${mongoBuilding.q}, ${mongoBuilding.r}) already exists`);
          } else if (error.code === '23503') { // Foreign key violation
            console.error(`  ❌ Building owner '${mongoBuilding.owner}' not found in players table`);
          } else {
            console.error(`  ❌ ${mongoBuilding.id}:`, error.message);
          }
        }
      }
    }
    console.log(`✅ Migrated ${buildingsCount} buildings\n`);

    // 3. Migrate Tile Ownership
    console.log('🗺️ Migrating Tile Ownership...');
    let tilesCount = 0;

    for (const player of allPlayers) {
      const mongoTiles = await tileDataManager.getPlayerTiles(player.username);
      
      for (const tile of mongoTiles) {
        try {
          await postgres.setTileOwner(tile.q, tile.r, player.username);

          // Check if tile has a building
          const building = await postgres.getBuildingAtPosition(tile.q, tile.r);
          if (building) {
            await postgres.setTileBuilding(tile.q, tile.r, building.id);
          }

          tilesCount++;
        } catch (error: any) {
          if (error.code === '23503') { // Foreign key violation
            console.error(`  ❌ Tile (${tile.q}, ${tile.r}) owner not found`);
          } else {
            console.error(`  ❌ Tile (${tile.q}, ${tile.r}):`, error.message);
          }
        }
      }
    }
    console.log(`✅ Migrated ${tilesCount} tile ownerships\n`);

    // 4. Statistics
    console.log('📊 Migration Summary:');
    console.log('───────────────────────────────────────');
    const pgStats = await postgres.getStats();
    console.log(`  Players: ${pgStats.totalPlayers}`);
    console.log(`  Buildings: ${pgStats.totalBuildings}`);
    console.log(`  Owned Tiles: ${pgStats.totalOwnedTiles}`);
    console.log('\n✅ Migration completed successfully!\n');

    console.log('⚠️ Next Steps:');
    console.log('  1. Verify data: npm run postgres-stats');
    console.log('  2. Update GameRoom to use PostgresManager');
    console.log('  3. Test thoroughly before removing MongoDB collections');
    console.log('  4. Backup MongoDB before final cleanup\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await postgres.disconnect();
    await tileDataManager.disconnect();
    // PlayerManager and BuildingManager don't have disconnect methods currently
    console.log('👋 Disconnected from databases');
  }
}

// Run migration
migrate().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
