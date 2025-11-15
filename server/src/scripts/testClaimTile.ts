import { PostgresManager } from '../database/PostgresManager.js';

async function testClaimTile() {
  console.log('🧪 Test: Tile Claiming mit MongoDB Migration\n');
  
  const postgres = new PostgresManager();
  
  try {
    await postgres.connect();
    console.log('✅ PostgreSQL verbunden\n');
    
    // Erstelle Test-Player
    console.log('📝 Erstelle Test-Player...');
    await postgres.createPlayer('test_player', '#FF0000');
    console.log('✅ Player erstellt\n');
    
    // Test 1: Tile mit Resources
    console.log('===== TEST 1: Tile mit Resources =====\n');
    const testQ1 = -320;
    const testR1 = -320;
    
    console.log(`🎯 Claime Tile (${testQ1}, ${testR1})...\n`);
    await postgres.claimTile(testQ1, testR1, 'test_player');
    
    console.log('📊 Prüfe Ergebnis Test 1...');
    const owner1 = await postgres.getTileOwner(testQ1, testR1);
    const resources1 = await postgres.tiles.getTileResources(testQ1, testR1);
    const population1 = await postgres.tiles.getTilePopulation(testQ1, testR1);
    console.log(`   Owner: ${owner1}`);
    console.log(`   Resources: ${JSON.stringify(resources1)}`);
    console.log(`   Population: ${population1}`);
    
    if (resources1.length > 0) {
      console.log('✅ Test 1 erfolgreich! Resources wurden migriert.\n');
    } else {
      console.log('❌ Test 1 fehlgeschlagen! Keine Resources.\n');
    }
    
    // Test 2: Tile mit Population
    console.log('===== TEST 2: Tile mit Population =====\n');
    const testQ2 = -320;
    const testR2 = -318;
    
    console.log(`🎯 Claime Tile (${testQ2}, ${testR2})...\n`);
    await postgres.claimTile(testQ2, testR2, 'test_player');
    
    console.log('📊 Prüfe Ergebnis Test 2...');
    const owner2 = await postgres.getTileOwner(testQ2, testR2);
    const resources2 = await postgres.tiles.getTileResources(testQ2, testR2);
    const population2 = await postgres.tiles.getTilePopulation(testQ2, testR2);
    console.log(`   Owner: ${owner2}`);
    console.log(`   Resources: ${JSON.stringify(resources2)}`);
    console.log(`   Population: ${population2}`);
    
    if (population2 > 0) {
      console.log('✅ Test 2 erfolgreich! Population wurde migriert.\n');
    } else {
      console.log('❌ Test 2 fehlgeschlagen! Keine Population.\n');
    }
    
    console.log('========================================');
    console.log('ZUSAMMENFASSUNG:');
    console.log(`Test 1 (Resources): ${resources1.length > 0 ? '✅' : '❌'}`);
    console.log(`Test 2 (Population): ${population2 > 0 ? '✅' : '❌'}`);
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  } finally {
    await postgres.disconnect();
  }
}

testClaimTile().catch(console.error);
