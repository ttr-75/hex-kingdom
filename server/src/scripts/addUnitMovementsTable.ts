import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Script zum Hinzufügen der unit_movements Tabelle
 * 
 * Diese Tabelle speichert aktive Unit-Bewegungen für Persistierung bei Server-Restart
 */

async function addUnitMovementsTable() {
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

      // Check if table already exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'unit_movements'
        );
      `);

      if (tableExists.rows[0].exists) {
        console.log('⚠️  Tabelle unit_movements existiert bereits');
        await client.query('ROLLBACK');
        return;
      }

      console.log('➕ Erstelle unit_movements Tabelle...');
      
      // Create unit_movements table
      await client.query(`
        CREATE TABLE unit_movements (
          unit_id VARCHAR(255) PRIMARY KEY,
          path_json TEXT NOT NULL,
          current_tile_index INTEGER NOT NULL,
          start_time BIGINT NOT NULL,
          tile_start_time BIGINT NOT NULL,
          tile_duration BIGINT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_movement_unit FOREIGN KEY (unit_id)
            REFERENCES units(id) ON DELETE CASCADE
        )
      `);

      await client.query('COMMIT');
      console.log('✅ Tabelle unit_movements erfolgreich erstellt!');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Migration fehlgeschlagen:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Führe Script aus
addUnitMovementsTable()
  .then(() => {
    console.log('\n🎉 Migration abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration fehlgeschlagen:', error);
    process.exit(1);
  });
