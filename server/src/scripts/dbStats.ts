#!/usr/bin/env node
/**
 * Database Statistics Script
 * 
 * Zeigt Statistiken über die MongoDB-Datenbank an
 * Nutzung: npm run db-stats
 */

import { ChunkManager } from '../database/ChunkManager.js';
import { TileDataManager } from '../database/TileDataManager.js';
import { MongoClient } from 'mongodb';

async function showStats() {
  console.log('📊 Hex Kingdom - Database Statistics\n');
  
  const mongoUrl = 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    const db = client.db('hex-kingdom');
    
    // ChunkManager Stats
    const chunkManager = new ChunkManager(mongoUrl);
    await chunkManager.connect();
    
    const chunksCollection = db.collection('chunks');
    const totalChunks = await chunksCollection.countDocuments();
    
    // Sample ein paar Chunks für Tile-Statistiken
    const sampleChunks = await chunksCollection.find().limit(10).toArray();
    const avgTilesPerChunk = sampleChunks.length > 0
      ? sampleChunks.reduce((sum, chunk: any) => sum + chunk.tiles.length, 0) / sampleChunks.length
      : 0;
    const estimatedTotalTiles = Math.round(totalChunks * avgTilesPerChunk);
    
    // Dokument-Größen
    const stats: any = await db.command({ collStats: 'chunks' });
    const avgChunkSize = stats.avgObjSize || 0;
    
    console.log('🗺️  Static Data (Chunks Collection):');
    console.log(`   Total Chunks: ${totalChunks.toLocaleString()}`);
    console.log(`   Estimated Tiles: ${estimatedTotalTiles.toLocaleString()}`);
    console.log(`   Avg Chunk Size: ${(avgChunkSize / 1024).toFixed(2)} KB`);
    console.log(`   Total Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    
    // TileDataManager Stats
    const tileDataManager = new TileDataManager(mongoUrl);
    await tileDataManager.connect();
    
    const dynamicStats = await tileDataManager.getStats();
    
    console.log('🔄 Dynamic Data (TileDynamicData Collection):');
    console.log(`   Total Dynamic Tiles: ${dynamicStats.totalDynamicTiles.toLocaleString()}`);
    console.log(`   Owned Tiles: ${dynamicStats.ownedTiles.toLocaleString()}`);
    console.log(`   Tiles with Buildings: ${dynamicStats.tilesWithBuildings.toLocaleString()}`);
    
    const dynamicDataStats: any = await db.command({ collStats: 'tile_dynamic_data' }).catch(() => null);
    if (dynamicDataStats) {
      console.log(`   Total Size: ${(dynamicDataStats.size / 1024 / 1024).toFixed(2)} MB`);
    }
    console.log('');
    
    // Buildings
    const buildingsCollection = db.collection('buildings');
    const totalBuildings = await buildingsCollection.countDocuments().catch(() => 0);
    
    console.log('🏗️  Buildings:');
    console.log(`   Total: ${totalBuildings.toLocaleString()}`);
    console.log('');
    
    // Efficiency Ratio
    const efficiency = dynamicStats.totalDynamicTiles / estimatedTotalTiles * 100;
    console.log('📈 Efficiency:');
    console.log(`   Dynamic/Static Ratio: ${efficiency.toFixed(2)}%`);
    console.log(`   (Lower is better - only changed tiles stored dynamically)`);
    console.log('');
    
    // Cleanup suggestion
    if (dynamicStats.totalDynamicTiles > dynamicStats.ownedTiles + dynamicStats.tilesWithBuildings) {
      const orphaned = dynamicStats.totalDynamicTiles - dynamicStats.ownedTiles - dynamicStats.tilesWithBuildings;
      console.log('⚠️  Maintenance:');
      console.log(`   ${orphaned} orphaned dynamic tiles could be cleaned up`);
      console.log(`   Run: npm run db-cleanup`);
      console.log('');
    }
    
    await chunkManager.disconnect();
    await tileDataManager.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

showStats().then(() => process.exit(0));
