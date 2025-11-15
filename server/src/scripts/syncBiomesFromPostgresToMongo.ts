/**
 * Synchronisiere Biome von PostgreSQL nach MongoDB
 * 
 * Problem: BiomeConversionSystem aktualisiert PostgreSQL, aber manchmal schlägt MongoDB-Update fehl
 * Lösung: Lese alle Biome aus PostgreSQL und schreibe sie nach MongoDB
 */

import { config } from 'dotenv';
import { PostgresManager } from '../database/PostgresManager.js';
import { ChunkManager } from '../database/ChunkManager.js';
import { BiomeType } from '@hex-kingdom/shared';

config();

async function syncBiomes() {
  console.log('🔄 Starting Biome Sync: PostgreSQL -> MongoDB\n');

  const postgres = new PostgresManager();
  const chunkManager = new ChunkManager();

  try {
    await postgres.connect();
    await chunkManager.connect();

    // Hole alle Tiles mit Biome aus PostgreSQL
    console.log('📊 Loading all tiles with biomes from PostgreSQL...');
    const tilesWithBiomes = await postgres.tiles.getAllTilesWithBiome();
    
    console.log(`Found ${tilesWithBiomes.length} tiles with biome data in PostgreSQL\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const { q, r, biome } of tilesWithBiomes) {
      try {
        // Check MongoDB current value
        const mongoTile = await chunkManager.getTile(q, r);
        
        if (!mongoTile) {
          console.warn(`⚠️  Tile (${q}, ${r}) not found in MongoDB - skipping`);
          continue;
        }

        if (mongoTile.biome === biome) {
          // Already in sync
          continue;
        }

        // Update MongoDB
        await chunkManager.updateTileBiome(q, r, biome as BiomeType);
        console.log(`✅ Synced (${q}, ${r}): ${mongoTile.biome} -> ${biome}`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error syncing tile (${q}, ${r}):`, error);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Sync Results:');
    console.log(`   Total tiles in PostgreSQL: ${tilesWithBiomes.length}`);
    console.log(`   Successfully synced: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Fatal error during sync:', error);
  } finally {
    await postgres.disconnect();
    await chunkManager.disconnect();
    console.log('✅ Sync complete\n');
  }
}

syncBiomes();
