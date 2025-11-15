/**
 * Migration Script: Tile Resources & Population Tables
 * 
 * Erstellt die neuen PostgreSQL Tabellen für dynamische Tile-Daten:
 * - tile_resources: Ressourcen auf claimed Tiles
 * - tile_population: Population auf claimed Tiles
 * 
 * WICHTIG: Führe dieses Script aus BEVOR du die neuen Features nutzt!
 * 
 * Usage: npm run migrate:tile-resources
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Parse DATABASE_URL oder nutze einzelne ENV-Variablen
let poolConfig: any;

if (process.env.DATABASE_URL) {
  // Parse postgresql://user:password@host:port/database
  const dbUrl = new URL(process.env.DATABASE_URL);
  poolConfig = {
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port || '5432'),
    database: dbUrl.pathname.slice(1), // Remove leading /
    user: dbUrl.username,
    password: dbUrl.password
  };
} else {
  poolConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'hex_kingdom',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  };
}

const pool = new Pool(poolConfig);

console.log(`🔌 Connecting to PostgreSQL at ${poolConfig.host}:${poolConfig.port}/${poolConfig.database} as ${poolConfig.user}`);

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting migration: tile_resources & tile_population tables...');
    await client.query('BEGIN');

    // 1. Tile Resources Table
    console.log('📦 Creating tile_resources table...');
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

    // 2. Tile Population Table
    console.log('👥 Creating tile_population table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tile_population (
        q INTEGER NOT NULL,
        r INTEGER NOT NULL,
        population INTEGER NOT NULL DEFAULT 0,
        last_modified TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (q, r)
      )
    `);

    // 3. Indexes für Performance
    console.log('🔍 Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_resources_coords ON tile_resources(q, r)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tile_population_coords ON tile_population(q, r)
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    
    // 4. Statistiken
    const statsResources = await client.query('SELECT COUNT(*) FROM tile_resources');
    const statsPopulation = await client.query('SELECT COUNT(*) FROM tile_population');
    
    console.log('\n📊 Database Statistics:');
    console.log(`   - tile_resources: ${statsResources.rows[0].count} entries`);
    console.log(`   - tile_population: ${statsPopulation.rows[0].count} entries`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Optional: Migriere existierende Daten aus MongoDB zu PostgreSQL
async function migrateExistingData() {
  console.log('\n🔄 Migrating existing data from MongoDB to PostgreSQL...');
  console.log('⚠️  This feature requires MongoDB connection - skipping for now');
  console.log('💡 Tiles will be migrated automatically when claimed by players');
}

// Run migration
migrate()
  .then(() => migrateExistingData())
  .then(() => {
    console.log('\n✨ All done! You can now use the new tile resource system.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
