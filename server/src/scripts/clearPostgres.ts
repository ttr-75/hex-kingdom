import { Pool } from 'pg';

/**
 * Clear PostgreSQL Database
 * 
 * Löscht ALLE Daten aus der PostgreSQL-Datenbank:
 * - Alle Tabellen werden geleert (TRUNCATE CASCADE)
 * - Foreign Key Constraints werden berücksichtigt
 * 
 * WARNUNG: Diese Aktion ist irreversibel!
 */

async function clearPostgres() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'hex_kingdom',
    user: process.env.POSTGRES_USER || 'hex_user',
    password: process.env.POSTGRES_PASSWORD || 'hex_pass_dev'
  });

  try {
    console.log('🔴 WARNUNG: PostgreSQL-Datenbank wird KOMPLETT gelöscht!');
    console.log('⏳ Starte in 3 Sekunden...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      console.log('📋 Hole alle Tabellen...');
      const tablesResult = await client.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);

      const tables = tablesResult.rows.map(row => row.tablename);
      console.log(`📊 Gefundene Tabellen: ${tables.length}`);
      tables.forEach(table => console.log(`   - ${table}`));
      console.log('');

      if (tables.length === 0) {
        console.log('✅ Keine Tabellen vorhanden - Datenbank ist bereits leer');
        await client.query('COMMIT');
        return;
      }

      console.log('🗑️  Lösche alle Daten aus Tabellen (TRUNCATE CASCADE)...');
      
      // TRUNCATE CASCADE löscht alle Daten und respektiert Foreign Keys
      for (const table of tables) {
        try {
          await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
          console.log(`   ✅ ${table} geleert`);
        } catch (error: any) {
          console.log(`   ⚠️  ${table} konnte nicht geleert werden: ${error.message}`);
        }
      }

      console.log('\n🔨 Lösche alle Tabellen (DROP CASCADE)...');
      
      // Lösche alle Tabellen komplett
      for (const table of tables) {
        try {
          await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
          console.log(`   ✅ ${table} gelöscht`);
        } catch (error: any) {
          console.log(`   ⚠️  ${table} konnte nicht gelöscht werden: ${error.message}`);
        }
      }

      await client.query('COMMIT');

      console.log('\n✅ PostgreSQL-Datenbank wurde komplett gelöscht!');
      console.log('');
      
      // Finale Prüfung
      const finalCheck = await client.query(`
        SELECT COUNT(*) as count 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      
      const remainingTables = parseInt(finalCheck.rows[0].count);
      if (remainingTables === 0) {
        console.log('✅ Bestätigung: Keine Tabellen mehr vorhanden');
      } else {
        console.log(`⚠️  Warnung: ${remainingTables} Tabelle(n) noch vorhanden`);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Fehler beim Löschen der Datenbank:', error);
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Verbindungsfehler:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Führe Script aus
clearPostgres()
  .then(() => {
    console.log('👋 Script beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script fehlgeschlagen:', error);
    process.exit(1);
  });
