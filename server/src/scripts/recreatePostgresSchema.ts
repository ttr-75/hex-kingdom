import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Script zum Neuerstellen des PostgreSQL Schemas
 * 
 * Führe dieses Script NACH completeCleanup.ts aus, um die Tabellen mit dem aktuellen Schema zu erstellen.
 * 
 * Das Script:
 * 1. Löscht ALLE bestehenden Tabellen (CASCADE)
 * 2. Erstellt das aktuelle Schema neu
 * 3. Legt Indexes an
 * 
 * ACHTUNG: Alle PostgreSQL-Daten werden gelöscht!
 */

async function recreatePostgresSchema() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432');
  const database = process.env.POSTGRES_DB || 'hex_kingdom';
  const user = process.env.POSTGRES_USER || 'hex_user';
  const password = process.env.POSTGRES_PASSWORD || 'hex_pass_dev';

  const pool = new Pool({
    host,
    port,
    database,
    user,
    password,
    max: 5,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('🔄 Verbinde mit PostgreSQL...');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1️⃣ Lösche alle bestehenden Tabellen (CASCADE entfernt auch Foreign Keys)
      console.log('🗑️  Lösche bestehende Tabellen...');
      await client.query('DROP TABLE IF EXISTS units CASCADE');
      await client.query('DROP TABLE IF EXISTS tile_exploration CASCADE');
      await client.query('DROP TABLE IF EXISTS tile_ownership CASCADE');
      await client.query('DROP TABLE IF EXISTS buildings CASCADE');
      await client.query('DROP TABLE IF EXISTS players CASCADE');
      console.log('✅ Alte Tabellen gelöscht');

      // 2️⃣ Erstelle Players Tabelle
      console.log('📋 Erstelle players Tabelle...');
      await client.query(`
        CREATE TABLE players (
          username VARCHAR(255) PRIMARY KEY,
          color VARCHAR(7) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ players Tabelle erstellt');

      // 3️⃣ Erstelle Buildings Tabelle
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
      console.log('✅ buildings Tabelle erstellt');

      // 4️⃣ Erstelle Tile Ownership Tabelle
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
      console.log('✅ tile_ownership Tabelle erstellt');

      // 5️⃣ Erstelle Tile Exploration Tabelle (Fog of War)
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
      console.log('✅ tile_exploration Tabelle erstellt');

      // 6️⃣ Erstelle Units Tabelle
      console.log('📋 Erstelle units Tabelle...');
      await client.query(`
        CREATE TABLE units (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          q INTEGER NOT NULL,
          r INTEGER NOT NULL,
          owner VARCHAR(255) NOT NULL,
          health INTEGER NOT NULL,
          movement_remaining INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          last_moved TIMESTAMP,
          CONSTRAINT fk_unit_owner FOREIGN KEY (owner)
            REFERENCES players(username) ON DELETE CASCADE
        )
      `);
      console.log('✅ units Tabelle erstellt');

      // 7️⃣ Erstelle Indexes für Performance
      console.log('📊 Erstelle Indexes...');
      await client.query('CREATE INDEX idx_buildings_owner ON buildings(owner)');
      await client.query('CREATE INDEX idx_buildings_coords ON buildings(q, r)');
      await client.query('CREATE INDEX idx_tile_ownership_owner ON tile_ownership(owner)');
      await client.query('CREATE INDEX idx_tile_exploration_player ON tile_exploration(player_username)');
      await client.query('CREATE INDEX idx_tile_exploration_coords ON tile_exploration(q, r)');
      await client.query('CREATE INDEX idx_units_owner ON units(owner)');
      await client.query('CREATE INDEX idx_units_coords ON units(q, r)');
      console.log('✅ Indexes erstellt');

      await client.query('COMMIT');
      console.log('\n✅ PostgreSQL Schema erfolgreich neu erstellt!');

      // 6️⃣ Zeige Schema-Info
      console.log('\n📊 Schema-Übersicht:');
      const tablesResult = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name
      `);
      
      for (const row of tablesResult.rows) {
        const tableName = row.table_name;
        const columnsResult = await client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);
        
        console.log(`\n📋 ${tableName}:`);
        columnsResult.rows.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });
      }

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Fehler beim Erstellen des Schemas:', error);
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Verbindungsfehler:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n👋 Verbindung geschlossen');
  }
}

// Führe Script aus
recreatePostgresSchema()
  .then(() => {
    console.log('\n🎉 Schema-Neuerstellung abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Schema-Neuerstellung fehlgeschlagen:', error);
    process.exit(1);
  });
