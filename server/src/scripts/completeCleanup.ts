import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import pkg from 'pg';
const { Pool } = pkg;

/**
 * COMPLETE CLEANUP SCRIPT
 * 
 * Löscht ALLE Daten aus:
 * - MongoDB (alle Collections leeren)
 * - Redis (FLUSHDB)
 * - PostgreSQL (alle Tabellen leeren)
 * 
 * ⚠️ WARNUNG: Dies löscht ALLE Spieldaten unwiderruflich!
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = 'hex-kingdom';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const POSTGRES_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'hex_kingdom',
  user: process.env.POSTGRES_USER || 'hex_user',
  password: process.env.POSTGRES_PASSWORD || 'hex_pass_dev',
};

async function cleanupMongoDB() {
  console.log('\n🔵 MongoDB Cleanup...');
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ MongoDB connected');

    const db = client.db(MONGODB_DB);

    // Liste alle Collections auf
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('ℹ️  Keine Collections vorhanden');
      return;
    }

    console.log(`📋 Gefundene Collections: ${collections.length}`);
    collections.forEach(col => console.log(`   - ${col.name}`));

    // Lösche alle Collections
    for (const col of collections) {
      try {
        const count = await db.collection(col.name).countDocuments();
        if (count > 0) {
          await db.collection(col.name).deleteMany({});
          console.log(`🗑️  ${col.name}: ${count} Dokumente gelöscht`);
        } else {
          console.log(`⚪ ${col.name}: bereits leer`);
        }
      } catch (err) {
        console.error(`❌ Fehler bei ${col.name}:`, err);
      }
    }

    console.log('✅ MongoDB cleanup abgeschlossen');
  } catch (error) {
    console.error('❌ MongoDB cleanup fehlgeschlagen:', error);
    throw error;
  } finally {
    await client.close();
  }
}

async function cleanupRedis() {
  console.log('\n🔴 Redis Cleanup...');
  const redis = createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    }
  });

  try {
    await redis.connect();
    console.log('✅ Redis connected');

    // Zeige vorhandene Keys
    const keys = await redis.keys('*');
    console.log(`📋 Gefundene Keys: ${keys.length}`);
    
    if (keys.length > 0) {
      // Zeige erste 10 Keys als Beispiel
      const preview = keys.slice(0, 10);
      preview.forEach((key: string) => console.log(`   - ${key}`));
      if (keys.length > 10) {
        console.log(`   ... und ${keys.length - 10} weitere`);
      }

      // FLUSHDB - Löscht alle Keys in der aktuellen DB
      await redis.flushDb();
      console.log('🗑️  FLUSHDB ausgeführt - alle Keys gelöscht');
    } else {
      console.log('ℹ️  Keine Keys vorhanden');
    }

    console.log('✅ Redis cleanup abgeschlossen');
  } catch (error) {
    console.error('❌ Redis cleanup fehlgeschlagen:', error);
    throw error;
  } finally {
    await redis.quit();
  }
}

async function cleanupPostgreSQL() {
  console.log('\n🟢 PostgreSQL Cleanup...');
  const pool = new Pool(POSTGRES_CONFIG);

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected');

    // Zeige Stats vor dem Löschen
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM players) as players,
        (SELECT COUNT(*) FROM player_resources) as player_resources,
        (SELECT COUNT(*) FROM buildings) as buildings,
        (SELECT COUNT(*) FROM tile_ownership) as tile_ownership,
        (SELECT COUNT(*) FROM tile_exploration) as tile_exploration,
        (SELECT COUNT(*) FROM units) as units
    `);

    const counts = stats.rows[0];
    console.log('📋 Aktuelle Daten:');
    console.log(`   - players: ${counts.players}`);
    console.log(`   - player_resources: ${counts.player_resources}`);
    console.log(`   - buildings: ${counts.buildings}`);
    console.log(`   - tile_ownership: ${counts.tile_ownership}`);
    console.log(`   - tile_exploration: ${counts.tile_exploration}`);
    console.log(`   - units: ${counts.units}`);

    // Lösche alle Daten in der richtigen Reihenfolge (wegen Foreign Keys)
    // 1. Buildings, tile_ownership, tile_exploration, units und player_resources (haben FKs zu players)
    console.log('\n🗑️  Lösche Daten...');
    
    await pool.query('TRUNCATE TABLE unit_movements CASCADE');
    console.log('   ✓ unit_movements gelöscht');
    
    await pool.query('TRUNCATE TABLE units CASCADE');
    console.log('   ✓ units gelöscht');
    
    await pool.query('TRUNCATE TABLE buildings CASCADE');
    console.log('   ✓ buildings gelöscht');
    
    await pool.query('TRUNCATE TABLE tile_ownership CASCADE');
    console.log('   ✓ tile_ownership gelöscht');
    
    await pool.query('TRUNCATE TABLE tile_exploration CASCADE');
    console.log('   ✓ tile_exploration gelöscht');
    
    await pool.query('TRUNCATE TABLE player_resources CASCADE');
    console.log('   ✓ player_resources gelöscht');
    
    await pool.query('TRUNCATE TABLE players CASCADE');
    console.log('   ✓ players gelöscht');

    console.log('✅ PostgreSQL cleanup abgeschlossen');
  } catch (error) {
    console.error('❌ PostgreSQL cleanup fehlgeschlagen:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function completeCleanup() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║    🚨 COMPLETE DATABASE CLEANUP 🚨              ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('\n⚠️  Dies löscht ALLE Daten aus:');
  console.log('   - MongoDB (alle Collections)');
  console.log('   - Redis (alle Keys)');
  console.log('   - PostgreSQL (alle Tabellen)');
  console.log('\n⏳ Starte in 3 Sekunden...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Cleanup in Reihenfolge durchführen
    await cleanupMongoDB();
    await cleanupRedis();
    await cleanupPostgreSQL();

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║    ✅ CLEANUP ERFOLGREICH ABGESCHLOSSEN ✅      ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('\n💡 Alle Datenbanken sind jetzt leer.');
    console.log('💡 Du kannst den Server neu starten.\n');
  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════╗');
    console.error('║    ❌ CLEANUP FEHLGESCHLAGEN ❌                 ║');
    console.error('╚════════════════════════════════════════════════╝\n');
    console.error(error);
    process.exit(1);
  }
}

completeCleanup();
