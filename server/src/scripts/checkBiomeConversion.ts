/**
 * Debug-Script: Überprüfe Biome-Konvertierungskriterien für spezifische Tiles
 * Vergleicht PostgreSQL, MongoDB und identifiziert Sync-Probleme
 */

import { config } from 'dotenv';
import { PostgresManager } from '../database/PostgresManager.js';
import { ChunkManager } from '../database/ChunkManager.js';
import { BIOME_DEFINITIONS, BiomeType, BuildingType } from '@hex-kingdom/shared';

config();

const TARGET_TILES = [
  { q: -10, r: 4, expected: 'should be SETTLEMENT' },
  { q: -16, r: 4, expected: 'is currently SETTLEMENT but should not be' }
];

async function checkBiomeConversion() {
  console.log('🔍 Starting Biome Conversion Check...\n');

  const postgres = new PostgresManager();
  const chunkManager = new ChunkManager();

  try {
    await postgres.connect();
    await chunkManager.connect();

    for (const target of TARGET_TILES) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📍 Checking Tile (${target.q}, ${target.r})`);
      console.log(`   Expected: ${target.expected}`);
      console.log(`${'='.repeat(60)}`);

      // 1. Check PostgreSQL data
      console.log('\n📊 PostgreSQL Data:');
      const tileOwner = await postgres.getTileOwner(target.q, target.r);
      const tileBiome = await postgres.getTileBiome(target.q, target.r);
      
      if (tileOwner) {
        console.log(`   Owner: ${tileOwner}`);
        console.log(`   Biome in PostgreSQL: ${tileBiome || 'NULL'}`);
      } else {
        console.log('   ❌ No ownership data found');
        continue;
      }

      // 2. Check MongoDB data
      console.log('\n🗄️  MongoDB Data:');
      const mongoTile = await chunkManager.getTile(target.q, target.r);
      if (mongoTile) {
        console.log(`   Biome: ${mongoTile.biome}`);
        console.log(`   Population: ${mongoTile.population || 0}`);
        console.log(`   Fertility: ${mongoTile.fertility?.toFixed(2) || 'N/A'}`);
        console.log(`   Resources: ${mongoTile.resources?.length || 0} types`);
        
        // Check sync
        if (tileBiome !== mongoTile.biome) {
          console.log(`   ⚠️  SYNC ISSUE: PostgreSQL has "${tileBiome}" but MongoDB has "${mongoTile.biome}"`);
        }
      } else {
        console.log('   ❌ No tile data found');
      }

      // 3. Check Buildings (alle Gebäude des Besitzers)
      console.log('\n🏗️  Buildings:');
      if (!tileOwner) {
        console.log('   ❌ No owner, skipping building check');
        continue;
      }
      
      const allBuildings = await postgres.getPlayerBuildings(tileOwner);
      const buildingsOnTile = allBuildings.filter((b: any) => b.q === target.q && b.r === target.r);
      
      console.log(`   Total Buildings: ${buildingsOnTile.length}`);
      
      // Berechne constructionProgress für jedes Gebäude
      const now = Date.now();
      const completedBuildings = buildingsOnTile.filter((b: any) => {
        const endTime = parseInt(b.construction_end_time as string);
        return b.completed_at || now >= endTime;
      });
      console.log(`   Completed Buildings: ${completedBuildings.length}`);
      
      if (completedBuildings.length > 0) {
        completedBuildings.forEach((b: any) => {
          console.log(`      - ${b.type} (Level ${b.level}, Owner: ${b.owner})`);
        });
      }

      const buildingTypes = completedBuildings.map((b: any) => b.type);
      const hasResidence = buildingTypes.includes(BuildingType.RESIDENCE);
      console.log(`   Has Residence: ${hasResidence ? '✅' : '❌'}`);

      // 4. Check SETTLEMENT criteria
      console.log('\n🏘️  SETTLEMENT Conversion Criteria:');
      const settlementDef = BIOME_DEFINITIONS[BiomeType.SETTLEMENT];
      const criteria = settlementDef.conversionCriteria;
      
      if (criteria && mongoTile) {
        console.log(`   Required Population: ${criteria.minPopulation || 'N/A'}`);
        console.log(`   Current Population: ${mongoTile.population || 0}`);
        const meetsPopulation = (mongoTile.population || 0) >= (criteria.minPopulation || 0);
        console.log(`   ➜ Population Check: ${meetsPopulation ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n   Required Buildings: ${criteria.minBuildings || 'N/A'}`);
        console.log(`   Current Buildings: ${completedBuildings.length}`);
        const meetsBuildings = completedBuildings.length >= (criteria.minBuildings || 0);
        console.log(`   ➜ Buildings Check: ${meetsBuildings ? '✅ PASS' : '❌ FAIL'}`);

        console.log(`\n   Required Building Types: ${criteria.requiredBuildingTypes?.join(', ') || 'None'}`);
        const meetsTypes = criteria.requiredBuildingTypes?.every(
          type => buildingTypes.includes(type)
        ) ?? true;
        console.log(`   ➜ Building Types Check: ${meetsTypes ? '✅ PASS' : '❌ FAIL'}`);

        const shouldBeSettlement = meetsPopulation && meetsBuildings && meetsTypes;
        console.log(`\n   🎯 OVERALL: ${shouldBeSettlement ? '✅ SHOULD BE SETTLEMENT' : '❌ NOT ELIGIBLE'}`);
        
        // Check if current state matches expected
        console.log('\n🔄 Sync Status:');
        console.log(`   PostgreSQL says: ${tileBiome}`);
        console.log(`   MongoDB says: ${mongoTile.biome}`);
        console.log(`   Should be: ${shouldBeSettlement ? BiomeType.SETTLEMENT : mongoTile.biome}`);
        
        if (shouldBeSettlement && tileBiome === BiomeType.SETTLEMENT && mongoTile.biome !== BiomeType.SETTLEMENT) {
          console.log(`   ❌ PROBLEM: PostgreSQL is correct, but MongoDB is NOT updated!`);
          console.log(`   💡 Solution: Need to sync MongoDB from PostgreSQL`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error during check:', error);
  } finally {
    await postgres.disconnect();
    await chunkManager.disconnect();
    console.log('\n✅ Check complete\n');
  }
}

checkBiomeConversion();
