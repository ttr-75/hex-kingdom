import { PostgresManager } from '../database/PostgresManager.js';

async function showPostgresStats() {
  const postgres = new PostgresManager();

  try {
    await postgres.connect();

    console.log('═══════════════════════════════════════');
    console.log('🐘 PostgreSQL Statistics');
    console.log('═══════════════════════════════════════\n');

    const stats = await postgres.getStats();
    console.log(`👥 Total Players: ${stats.totalPlayers}`);
    console.log(`🏗️ Total Buildings: ${stats.totalBuildings}`);
    console.log(`🗺️ Total Owned Tiles: ${stats.totalOwnedTiles}\n`);

    // Show all players
    const players = await postgres.getAllPlayers();
    if (players.length > 0) {
      console.log('👥 Players:');
      console.log('───────────────────────────────────────');
      for (const player of players) {
        const playerStats = await postgres.getPlayerStats(player.username);
        console.log(`  ${player.username} (${player.color})`);
        console.log(`    Created: ${player.created_at.toLocaleDateString()}`);
        console.log(`    Last Login: ${player.last_login.toLocaleString()}`);
        console.log(`    Tiles: ${playerStats.totalTiles}`);
        console.log(`    Buildings: ${playerStats.completedBuildings}/${playerStats.totalBuildings}\n`);
      }
    }

    console.log('═══════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await postgres.disconnect();
  }
}

showPostgresStats();
