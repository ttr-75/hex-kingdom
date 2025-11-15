import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

/**
 * FULL RESET SCRIPT
 * 
 * Führt folgende Schritte aus:
 * 1. Löscht alle Daten aus MongoDB, Redis, PostgreSQL
 * 2. Erstellt PostgreSQL Schema neu
 * 3. Generiert neue Welt in MongoDB
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

// ========================================
// SCHRITT 1: CLEANUP
// ========================================

async function cleanupMongoDB() {
  console.log('\n🔵 MongoDB Cleanup...');
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ MongoDB connected');

    const db = client.db(MONGODB_DB);
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('ℹ️  Keine Collections vorhanden');
      return;
    }

    console.log(`📋 Gefundene Collections: ${collections.length}`);

    for (const col of collections) {
      try {
        const count = await db.collection(col.name).countDocuments();
        if (count > 0) {
          await db.collection(col.name).deleteMany({});
          console.log(`🗑️  ${col.name}: ${count} Dokumente gelöscht`);
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

    const keys = await redis.keys('*');
    console.log(`📋 Gefundene Keys: ${keys.length}`);
    
    if (keys.length > 0) {
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

// ========================================
// SCHRITT 2: PostgreSQL Schema neu erstellen
// ========================================

async function recreatePostgresSchema() {
  console.log('\n🟢 PostgreSQL Schema neu erstellen...');
  const pool = new Pool(POSTGRES_CONFIG);

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lösche alle bestehenden Tabellen
      console.log('🗑️  Lösche bestehende Tabellen...');
      await client.query('DROP TABLE IF EXISTS unit_movements CASCADE');
      await client.query('DROP TABLE IF EXISTS units CASCADE');
      await client.query('DROP TABLE IF EXISTS tile_exploration CASCADE');
      await client.query('DROP TABLE IF EXISTS tile_ownership CASCADE');
      await client.query('DROP TABLE IF EXISTS buildings CASCADE');
      await client.query('DROP TABLE IF EXISTS player_resources CASCADE');
      await client.query('DROP TABLE IF EXISTS players CASCADE');
      console.log('✅ Alte Tabellen gelöscht');

      // Erstelle Players Tabelle
      console.log('📋 Erstelle players Tabelle...');
      await client.query(`
        CREATE TABLE players (
          username VARCHAR(255) PRIMARY KEY,
          color VARCHAR(7) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP DEFAULT NOW()
        )
      `);

      // Erstelle Player Resources Tabelle
      console.log('📋 Erstelle player_resources Tabelle...');
      await client.query(`
        CREATE TABLE player_resources (
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

      // Erstelle Buildings Tabelle
      console.log('📋 Erstelle buildings Tabelle...');
      await client.query(`
        CREATE TABLE buildings (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          owner VARCHAR(255) NOT NULL,
          level INTEGER DEFAULT 1,
          construction_start_time BIGINT NOT NULL,
          construction_end_time BIGINT NOT NULL,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_building_owner FOREIGN KEY (owner) 
            REFERENCES players(username) ON DELETE CASCADE,
          CONSTRAINT unique_tile_building UNIQUE (q, r)
        )
      `);

      // Erstelle Tile Ownership Tabelle
      console.log('📋 Erstelle tile_ownership Tabelle...');
      await client.query(`
        CREATE TABLE tile_ownership (
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          owner VARCHAR(255),
          building_id VARCHAR(255),
          last_modified TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (q, r),
          CONSTRAINT fk_tile_owner FOREIGN KEY (owner) 
            REFERENCES players(username) ON DELETE SET NULL,
          CONSTRAINT fk_tile_building FOREIGN KEY (building_id) 
            REFERENCES buildings(id) ON DELETE SET NULL
        )
      `);

      // Erstelle Tile Exploration Tabelle
      console.log('📋 Erstelle tile_exploration Tabelle...');
      await client.query(`
        CREATE TABLE tile_exploration (
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

      // Erstelle Units Tabelle
      console.log('📋 Erstelle units Tabelle...');
      await client.query(`
        CREATE TABLE units (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          owner VARCHAR(255) NOT NULL,
          health INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_unit_owner FOREIGN KEY (owner)
            REFERENCES players(username) ON DELETE CASCADE
        )
      `);

      // Erstelle Unit Movements Tabelle
      console.log('📋 Erstelle unit_movements Tabelle...');
      await client.query(`
        CREATE TABLE unit_movements (
          unit_id VARCHAR(255) PRIMARY KEY,
          path JSONB NOT NULL,
          current_step INTEGER DEFAULT 0,
          next_move_time BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_movement_unit FOREIGN KEY (unit_id)
            REFERENCES units(id) ON DELETE CASCADE
        )
      `);

      // Erstelle Indexes
      console.log('📊 Erstelle Indexes...');
      await client.query('CREATE INDEX idx_buildings_owner ON buildings(owner)');
      await client.query('CREATE INDEX idx_buildings_coords ON buildings(q, r)');
      await client.query('CREATE INDEX idx_tile_ownership_owner ON tile_ownership(owner)');
      await client.query('CREATE INDEX idx_tile_exploration_player ON tile_exploration(player_username)');
      await client.query('CREATE INDEX idx_tile_exploration_coords ON tile_exploration(q, r)');
      await client.query('CREATE INDEX idx_units_owner ON units(owner)');
      await client.query('CREATE INDEX idx_units_coords ON units(q, r)');
      await client.query('CREATE INDEX idx_unit_movements_next_move ON unit_movements(next_move_time)');

      await client.query('COMMIT');
      console.log('✅ PostgreSQL Schema erfolgreich neu erstellt');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ PostgreSQL Schema-Erstellung fehlgeschlagen:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// ========================================
// SCHRITT 3: Welt generieren
// ========================================

async function generateWorld() {
  console.log('\n🗺️  Generiere neue Welt...');
  console.log('(Dies kann einige Minuten dauern)\n');
  
  try {
    // Führe generateWorld.ts als Child-Process aus
    execSync('npm run generate-world', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('\n✅ Weltgenerierung abgeschlossen');
  } catch (error) {
    console.error('❌ Weltgenerierung fehlgeschlagen:', error);
    throw error;
  }
}

// ========================================
// HAUPT-FUNKTION
// ========================================

async function fullReset() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║      🔄 FULL DATABASE RESET & REGENERATE 🔄    ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('\n⚠️  Dieser Prozess wird:');
  console.log('   1. ❌ ALLE Daten löschen (MongoDB, Redis, PostgreSQL)');
  console.log('   2. 🔧 PostgreSQL Schema neu erstellen');
  console.log('   3. 🗺️  Neue Welt generieren');
  console.log('\n⏳ Starte in 3 Sekunden...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Schritt 1: Cleanup
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║         SCHRITT 1/3: CLEANUP                    ║');
    console.log('╚════════════════════════════════════════════════╝');
    
    await cleanupMongoDB();
    await cleanupRedis();

    // Schritt 2: PostgreSQL Schema
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║         SCHRITT 2/3: SCHEMA ERSTELLEN           ║');
    console.log('╚════════════════════════════════════════════════╝');
    
    await recreatePostgresSchema();

    // Schritt 3: Welt generieren
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║         SCHRITT 3/3: WELT GENERIEREN            ║');
    console.log('╚════════════════════════════════════════════════╝');
    
    await generateWorld();

    // Fertig!
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║      ✅ FULL RESET ERFOLGREICH! ✅              ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('\n🎉 Die Datenbank wurde zurückgesetzt und eine neue Welt generiert!');
    console.log('💡 Du kannst jetzt den Server starten: npm run dev\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════╗');
    console.error('║      ❌ RESET FEHLGESCHLAGEN ❌                 ║');
    console.error('╚════════════════════════════════════════════════╝\n');
    console.error(error);
    process.exit(1);
  }
}

fullReset();
