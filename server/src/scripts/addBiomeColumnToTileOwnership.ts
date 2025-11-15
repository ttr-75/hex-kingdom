import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Lade Umgebungsvariablen
dotenv.config();

/**
 * Migration Script: Fügt biome Spalte zur tile_ownership Tabelle hinzu
 */
async function addBiomeColumn() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432');
  const database = process.env.POSTGRES_DB || 'hex_kingdom';
  const user = process.env.POSTGRES_USER || 'hex_user';
  const password = process.env.POSTGRES_PASSWORD || 'hex_pass_dev';

  console.log(`🔄 Connecting to PostgreSQL at ${host}:${port}/${database} as ${user}...`);

  const pool = new Pool({
    host,
    port,
    database,
    user,
    password
  });
  
  try {
    console.log('🔄 Adding biome column to tile_ownership table...');
    
    // Die Spalte wird nur hinzugefügt wenn sie nicht existiert (IF NOT EXISTS)
    await pool.query(`
      ALTER TABLE tile_ownership 
      ADD COLUMN IF NOT EXISTS biome VARCHAR(50)
    `);
    
    console.log('✅ Biome column added successfully!');
    console.log('ℹ️  Existing tiles will have NULL biome until converted');
    
    // Zeige Statistiken
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_tiles,
        COUNT(biome) as tiles_with_biome,
        COUNT(*) - COUNT(biome) as tiles_without_biome
      FROM tile_ownership
    `);
    
    const stats = result.rows[0];
    console.log(`
📊 Statistics:
   Total tiles: ${stats.total_tiles}
   Tiles with biome: ${stats.tiles_with_biome}
   Tiles without biome: ${stats.tiles_without_biome}
    `);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('👋 Disconnected from PostgreSQL');
    process.exit(0);
  }
}

addBiomeColumn();
