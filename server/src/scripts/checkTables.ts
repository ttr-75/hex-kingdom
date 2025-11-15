import { PostgresManager } from '../database/PostgresManager.js';

async function main() {
  const pg = new PostgresManager();
  await pg.connect();
  
  const result = await (pg as any).pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  
  console.log('📊 PostgreSQL Tabellen:');
  result.rows.forEach((row: any) => {
    console.log(`   - ${row.table_name}`);
  });
  
  // Prüfe ob building_production existiert
  const hasProductionTable = result.rows.some((row: any) => row.table_name === 'building_production');
  if (hasProductionTable) {
    console.log('\n✅ building_production Tabelle wurde erfolgreich erstellt!');
  } else {
    console.log('\n❌ building_production Tabelle wurde NICHT erstellt!');
  }
  
  await pg.disconnect();
  process.exit(0);
}

main().catch(console.error);
