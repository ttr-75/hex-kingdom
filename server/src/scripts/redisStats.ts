import { RedisSessionManager } from '../database/RedisSessionManager.js';

async function showRedisStats() {
  const redis = new RedisSessionManager();
  
  try {
    await redis.connect();
    
    console.log('═══════════════════════════════════════');
    console.log('📊 Redis Session Statistics');
    console.log('═══════════════════════════════════════\n');
    
    const stats = await redis.getStats();
    console.log(`🎮 Active Players: ${stats.activePlayers}`);
    console.log(`🏗️ Active Buildings: ${stats.activeBuildings}`);
    console.log(`🔑 Total Keys: ${stats.totalKeys}\n`);
    
    // Show Player Sessions
    const playerSessions = await redis.getAllPlayerSessions();
    if (playerSessions.length > 0) {
      console.log('👥 Player Sessions:');
      console.log('───────────────────────────────────────');
      playerSessions.forEach(session => {
        const uptime = Math.floor((Date.now() - session.connectedAt) / 1000);
        console.log(`  ${session.username}`);
        console.log(`    Session: ${session.sessionId}`);
        console.log(`    Room: ${session.roomId}`);
        console.log(`    Resources: 🪵${session.wood} 🪨${session.stone} ⚔️${session.iron} 💰${session.gold} 🌾${session.food}`);
        console.log(`    Uptime: ${uptime}s`);
        console.log(`    Last Update: ${new Date(session.lastUpdate).toLocaleTimeString()}\n`);
      });
    }
    
    // Show Building Sessions
    const buildingSessions = await redis.getAllBuildingSessions();
    if (buildingSessions.length > 0) {
      console.log('🏗️ Building Sessions:');
      console.log('───────────────────────────────────────');
      buildingSessions.forEach(session => {
        const progress = (session.constructionProgress * 100).toFixed(1);
        console.log(`  ${session.buildingId}`);
        console.log(`    Progress: ${progress}%`);
        console.log(`    Last Update: ${new Date(session.lastUpdate).toLocaleTimeString()}\n`);
      });
    }
    
    if (playerSessions.length === 0 && buildingSessions.length === 0) {
      console.log('ℹ️ No active sessions found');
    }
    
    console.log('═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await redis.disconnect();
  }
}

showRedisStats();
