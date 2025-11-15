import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Lade Environment-Variablen
dotenv.config();

async function addMovementRemainingColumn() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'hex_kingdom',
    user: process.env.POSTGRES_USER || 'hex_user',
    password: process.env.POSTGRES_PASSWORD || 'hex_pass_dev'
  });

  try {
    console.log('🔧 Prüfe units Tabelle...');

    // Prüfe ob Spalte existiert
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'units' 
      AND column_name = 'movement_remaining'
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✅ Spalte movement_remaining existiert bereits!');
      await pool.end();
      return;
    }

    console.log('➕ Füge movement_remaining Spalte hinzu...');

    // Füge Spalte hinzu mit Standardwerten basierend auf Unit-Typ
    await pool.query(`
      ALTER TABLE units 
      ADD COLUMN movement_remaining INTEGER NOT NULL DEFAULT 3
    `);

    console.log('🔄 Setze korrekte movement_remaining Werte basierend auf Unit-Typ...');

    // Aktualisiere Werte basierend auf Unit-Typ
    await pool.query(`
      UPDATE units 
      SET movement_remaining = CASE 
        WHEN type = 'warrior' THEN 3
        WHEN type = 'archer' THEN 3
        WHEN type = 'cavalry' THEN 5
        WHEN type = 'scout' THEN 6
        ELSE 3
      END
    `);

    console.log('✅ Migration erfolgreich abgeschlossen!');
    console.log('📊 Überprüfe Ergebnis...');

    const result = await pool.query('SELECT id, type, movement_remaining FROM units LIMIT 10');
    console.log(`   Gefunden: ${result.rows.length} Units`);
    if (result.rows.length > 0) {
      console.log('   Beispiel-Daten:');
      result.rows.forEach(row => {
        console.log(`   - ${row.type}: movement_remaining = ${row.movement_remaining}`);
      });
    }

  } catch (error) {
    console.error('❌ Fehler bei Migration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addMovementRemainingColumn()
  .then(() => {
    console.log('✅ Skript beendet');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
