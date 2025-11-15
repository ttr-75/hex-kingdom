import { PostgresManager } from '../database/PostgresManager.js';

async function createPlayerResourcesTable() {
  const postgres = new PostgresManager();
  
  try {
    await postgres.connect();
    console.log('✅ Connected\n');
    
    console.log('📋 Erstelle player_resources Tabelle...');
    
    // Direct SQL execution
    const query = `
      CREATE TABLE IF NOT EXISTS player_resources (
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
    `;
    
    await postgres['pool'].query(query);
    console.log('✅ player_resources Tabelle erstellt!\n');
    
    // Verify
    const result = await postgres['pool'].query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='player_resources'"
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Tabelle existiert in PostgreSQL');
    } else {
      console.log('❌ Tabelle wurde nicht gefunden!');
    }
    
  } finally {
    await postgres.disconnect();
  }
}

createPlayerResourcesTable().catch(console.error);
