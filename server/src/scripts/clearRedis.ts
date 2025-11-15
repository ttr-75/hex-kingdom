import { createClient } from 'redis';

/**
 * Clear Redis Cache
 * 
 * Löscht ALLE Daten aus Redis:
 * - Player Sessions (inkl. Ressourcen)
 * - Building Sessions
 * - Alle anderen gecachten Daten
 * 
 * WARNUNG: Diese Aktion ist irreversibel!
 */

async function clearRedis() {
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  try {
    console.log('🔴 WARNUNG: Redis-Cache wird KOMPLETT gelöscht!');
    console.log('⏳ Starte in 3 Sekunden...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    await redisClient.connect();
    console.log('✅ Redis verbunden\n');

    // Hole alle Keys
    const keys = await redisClient.keys('*');
    console.log(`📊 Gefundene Redis-Keys: ${keys.length}`);
    
    if (keys.length > 0) {
      // Zeige erste 20 Keys als Beispiel
      const preview = keys.slice(0, 20);
      console.log('\n📋 Beispiel-Keys:');
      preview.forEach((key: string) => console.log(`   - ${key}`));
      if (keys.length > 20) {
        console.log(`   ... und ${keys.length - 20} weitere\n`);
      } else {
        console.log('');
      }

      // Gruppiere Keys nach Typ
      const keyTypes = {
        playerSessions: keys.filter(k => k.startsWith('session:player:')).length,
        buildingSessions: keys.filter(k => k.startsWith('session:building:')).length,
        other: keys.filter(k => !k.startsWith('session:')).length
      };

      console.log('📊 Key-Typen:');
      console.log(`   - Player Sessions: ${keyTypes.playerSessions}`);
      console.log(`   - Building Sessions: ${keyTypes.buildingSessions}`);
      console.log(`   - Andere: ${keyTypes.other}\n`);

      // Lösche alle Keys
      console.log('🗑️  Lösche alle Keys...');
      await redisClient.flushDb();
      console.log('✅ FLUSHDB ausgeführt - Redis Cache komplett gelöscht\n');
      
      // Finale Prüfung
      const remainingKeys = await redisClient.keys('*');
      if (remainingKeys.length === 0) {
        console.log('✅ Bestätigung: Keine Redis-Keys mehr vorhanden');
      } else {
        console.log(`⚠️  Warnung: ${remainingKeys.length} Key(s) noch vorhanden`);
      }
    } else {
      console.log('✅ Redis Cache war bereits leer');
    }

    await redisClient.quit();

    console.log('\n✅ Redis-Cache wurde erfolgreich geleert!');
    console.log('💡 Hinweis: PostgreSQL und MongoDB wurden NICHT verändert.');
    console.log('💡 Beim nächsten Login werden Daten aus PostgreSQL geladen.\n');

  } catch (error) {
    console.error('❌ Fehler beim Löschen von Redis:', error);
    process.exit(1);
  }
}

// Führe Script aus
clearRedis()
  .then(() => {
    console.log('👋 Script beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });
