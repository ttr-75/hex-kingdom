#!/usr/bin/env node
/**
 * Database Statistics Script
 * 
 * Zeigt Statistiken über MongoDB und PostgreSQL an
 * Nutzung: npm run db-stats
 */

import { ChunkManager } from '../database/ChunkManager.js';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

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
    
    // PostgreSQL Stats
    const pgPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'hex_kingdom',
      user: process.env.POSTGRES_USER || 'hex_user',
      password: process.env.POSTGRES_PASSWORD || 'hex_pass_dev'
    });
    
    try {
      const ownedTilesResult = await pgPool.query(
        'SELECT COUNT(*) as count FROM tile_ownership WHERE owner IS NOT NULL'
      );
      const totalTilesResult = await pgPool.query(
        'SELECT COUNT(*) as count FROM tile_ownership'
      );
      const tilesWithResourcesResult = await pgPool.query(
        'SELECT COUNT(DISTINCT (q, r)) as count FROM tile_resources'
      );
      const tilesWithPopulationResult = await pgPool.query(
        'SELECT COUNT(*) as count FROM tile_population'
      );
      
      console.log('🔄 Dynamic Data (PostgreSQL):');
      console.log(`   Total Tiles in DB: ${parseInt(totalTilesResult.rows[0].count).toLocaleString()}`);
      console.log(`   Owned Tiles: ${parseInt(ownedTilesResult.rows[0].count).toLocaleString()}`);
      console.log(`   Tiles with Resources: ${parseInt(tilesWithResourcesResult.rows[0].count).toLocaleString()}`);
      console.log(`   Tiles with Population: ${parseInt(tilesWithPopulationResult.rows[0].count).toLocaleString()}`);
      console.log('');
      
      await pgPool.end();
    } catch (error) {
      console.error('⚠️ PostgreSQL stats not available:', error);
    }
    
    // Buildings from PostgreSQL
    const pgPool2 = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'hex_kingdom',
      user: process.env.POSTGRES_USER || 'hex_user',
      password: process.env.POSTGRES_PASSWORD || 'hex_pass_dev'
    });
    
    try {
      const buildingsResult = await pgPool2.query('SELECT COUNT(*) as count FROM buildings');
      const totalBuildings = parseInt(buildingsResult.rows[0].count);
      
      console.log('🏗️  Buildings (PostgreSQL):');
      console.log(`   Total: ${totalBuildings.toLocaleString()}`);
      console.log('');
      
      await pgPool2.end();
    } catch (error) {
      console.error('⚠️ Buildings stats not available:', error);
    }
    
    await chunkManager.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

showStats().then(() => process.exit(0));
