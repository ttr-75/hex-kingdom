#!/usr/bin/env node
/**
 * World Pre-Generation Script
 * 
 * Generiert eine große Welt im Voraus und speichert sie in MongoDB.
 * Kann manuell ausgeführt werden: npm run generate-world
 * 
 * Vorteile:
 * - Viel größere Noise-Scales möglich
 * - Keine Performance-Einbußen im Spiel
 * - Konsistentere Terrain-Muster
 * - Bessere Noise-Algorithmen nutzbar
 */

import { ChunkManager } from '../database/ChunkManager.js';
import { TerrainType, ResourceType } from '../../../shared/src/types.js';

// ===========================
// KONFIGURATION
// ===========================

const CONFIG = {
  // World Settings
  worldSeed: 123456,  // Ändere für andere Welten
  
  // Generation Area (in Chunks)
  minChunkX: -10,     // Generiere von  -10 bis +10 = 21 Chunks
  maxChunkX: 10,
  minChunkY: -10,
  maxChunkY: 10,
  
  // Chunk Size
  chunkSize: 32,      // 32x32 Hexagone pro Chunk (für MongoDB)
  superChunkSize: 10,  // Generiere in 10x10 Chunk-Blöcken = 320x320 tiles auf einmal!
  
  // Noise Parameters - Balance zwischen Kontinenten und Variation
  continentScale1: 0.003,  // Sehr große Kontinente
  continentScale2: 0.001,  // Mega-große Variation
  
  elevationScale1: 0.05,   // Mittlere Höhenunterschiede
  elevationScale2: 0.1,    // Kleine Berge
  elevationScale3: 0.2,    // Feine Hügel
  
  moistureScale1: 0.04,    // Mittlere Klima-Zonen
  moistureScale2: 0.08,    // Kleine Feuchtigkeit
  moistureScale3: 0.15,    // Feine Variation
  
  // Terrain Thresholds
  waterThreshold: -0.15,
  highElevation: 0.6,
  mediumElevation: 0.5,
  wetThreshold: 0,
  forestThreshold: 0.3,
  desertThreshold: -0.5,  // Niedriger = weniger Wüste (war -0.3)
  
  // Batch Size (für Performance)
  batchSize: 10,      // Speichere alle 10 Chunks
};

// ===========================
// NOISE FUNKTIONEN
// ===========================

function continentNoise(q: number, r: number, seed: number): number {
  const seedOffset = seed * 0.001;
  
  const noise1 = Math.sin((q + seedOffset) * CONFIG.continentScale1) * 
                 Math.cos((r + seedOffset) * CONFIG.continentScale1);
  const noise2 = Math.sin((q + seedOffset) * CONFIG.continentScale2 + 100) * 
                 Math.cos((r + seedOffset) * CONFIG.continentScale2 + 100);
  
  return (noise1 * 0.7 + noise2 * 0.3);
}

function elevationNoise(q: number, r: number, seed: number): number {
  const seedOffset = seed * 0.001;
  
  const noise1 = Math.sin((q + seedOffset + 300) * CONFIG.elevationScale1) * 
                 Math.cos((r + seedOffset + 300) * CONFIG.elevationScale1);
  const noise2 = Math.sin((q + seedOffset + 400) * CONFIG.elevationScale2) * 
                 Math.cos((r + seedOffset + 400) * CONFIG.elevationScale2);
  const noise3 = Math.sin((q + seedOffset + 500) * CONFIG.elevationScale3) * 
                 Math.cos((r + seedOffset + 500) * CONFIG.elevationScale3);
  
  return (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2);
}

function moistureNoise(q: number, r: number, seed: number): number {
  const seedOffset = seed * 0.001;
  
  const noise1 = Math.sin((q + seedOffset + 1000) * CONFIG.moistureScale1) * 
                 Math.cos((r + seedOffset + 1000) * CONFIG.moistureScale1);
  const noise2 = Math.sin((q + seedOffset + 1100) * CONFIG.moistureScale2) * 
                 Math.cos((r + seedOffset + 1100) * CONFIG.moistureScale2);
  const noise3 = Math.sin((q + seedOffset + 1200) * CONFIG.moistureScale3) * 
                 Math.cos((r + seedOffset + 1200) * CONFIG.moistureScale3);
  
  return (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2);
}

function getTerrain(q: number, r: number, seed: number): TerrainType {
  // Layer 1: Kontinente
  const continentValue = continentNoise(q, r, seed);
  
  // Leichte Bias zum Zentrum
  const distance = Math.sqrt(q * q + r * r) / 100;
  const centerBias = 1.0 - Math.min(distance * 0.3, 0.5);
  
  const adjustedContinent = continentValue + centerBias * 0.2;
  
  // Wasser?
  if (adjustedContinent < CONFIG.waterThreshold) return TerrainType.WATER;
  
  // Layer 2: Höhe
  const elevation = elevationNoise(q, r, seed);
  
  // Layer 3: Feuchtigkeit
  const moisture = moistureNoise(q, r, seed);
  
  const isHighElevation = elevation > CONFIG.highElevation;
  const isMediumElevation = elevation > CONFIG.mediumElevation && elevation <= CONFIG.highElevation;
  const isWet = moisture > CONFIG.wetThreshold;
  
  // Berge
  if (isHighElevation && elevation > 0.5) return TerrainType.MOUNTAIN;
  
  // Hügel - Note: 'hills' gibt es nicht im Enum, verwende MOUNTAIN für jetzt
  if (isHighElevation || isMediumElevation) return TerrainType.MOUNTAIN;
  
  // Flachland
  if (isWet) {
    return moisture > CONFIG.forestThreshold ? TerrainType.FOREST : TerrainType.GRASS;
  } else {
    return moisture < CONFIG.desertThreshold ? TerrainType.DESERT : TerrainType.GRASS;
  }
}

function getResourceType(terrain: TerrainType): ResourceType | undefined {
  const rand = Math.random();
  
  if (terrain === TerrainType.FOREST && rand < 0.25) return ResourceType.WOOD;
  if (terrain === TerrainType.MOUNTAIN && rand < 0.30) return rand > 0.15 ? ResourceType.STONE : ResourceType.IRON;
  if (terrain === TerrainType.GRASS && rand < 0.10) return ResourceType.WOOD;
  if (terrain === TerrainType.DESERT && rand < 0.05) return ResourceType.GOLD;
  
  return undefined;
}

// ===========================
// MAIN GENERATION
// ===========================

async function generateWorld() {
  console.log('🌍 Starting World Generation...');
  console.log(`   Seed: ${CONFIG.worldSeed}`);
  console.log(`   Area: ${CONFIG.minChunkX} to ${CONFIG.maxChunkX}, ${CONFIG.minChunkY} to ${CONFIG.maxChunkY}`);
  console.log(`   Total Chunks: ${(CONFIG.maxChunkX - CONFIG.minChunkX + 1) * (CONFIG.maxChunkY - CONFIG.minChunkY + 1)}`);
  console.log(`   Total Tiles: ${(CONFIG.maxChunkX - CONFIG.minChunkX + 1) * (CONFIG.maxChunkY - CONFIG.minChunkY + 1) * CONFIG.chunkSize * CONFIG.chunkSize}`);
  console.log('');
  
  // MongoDB verbinden
  const chunkManager = new ChunkManager();
  await chunkManager.connect();
  
  let totalChunks = 0;
  let totalTiles = 0;
  const startTime = Date.now();
  
  // ===========================
  // SUPER-CHUNK GENERATION
  // ===========================
  // Generiere in großen Blöcken (z.B. 5x5 Chunks = 160x160 Tiles)
  // Das eliminiert Chunk-Boundary-Patterns!
  
  const totalSuperChunksX = Math.ceil((CONFIG.maxChunkX - CONFIG.minChunkX + 1) / CONFIG.superChunkSize);
  const totalSuperChunksY = Math.ceil((CONFIG.maxChunkY - CONFIG.minChunkY + 1) / CONFIG.superChunkSize);
  
  console.log(`🔷 Generating in ${totalSuperChunksX}x${totalSuperChunksY} super-chunks (${CONFIG.superChunkSize}x${CONFIG.superChunkSize} chunks each = ${CONFIG.superChunkSize * CONFIG.chunkSize}x${CONFIG.superChunkSize * CONFIG.chunkSize} tiles)`);
  console.log('');
  
  // Iteriere über Super-Chunks
  for (let superChunkX = 0; superChunkX < totalSuperChunksX; superChunkX++) {
    for (let superChunkY = 0; superChunkY < totalSuperChunksY; superChunkY++) {
      
      // Berechne Chunk-Range für diesen Super-Chunk
      const chunkStartX = CONFIG.minChunkX + (superChunkX * CONFIG.superChunkSize);
      const chunkEndX = Math.min(chunkStartX + CONFIG.superChunkSize - 1, CONFIG.maxChunkX);
      const chunkStartY = CONFIG.minChunkY + (superChunkY * CONFIG.superChunkSize);
      const chunkEndY = Math.min(chunkStartY + CONFIG.superChunkSize - 1, CONFIG.maxChunkY);
      
      // 1. Generiere ALLE Tiles in diesem Super-Chunk kontinuierlich
      const superChunkTiles = new Map<string, {
        q: number;
        r: number;
        terrain: TerrainType;
        resourceType?: ResourceType;
        resourceAmount?: number;
      }>();
      
      const tileStartQ = chunkStartX * CONFIG.chunkSize;
      const tileEndQ = (chunkEndX + 1) * CONFIG.chunkSize - 1;
      const tileStartR = chunkStartY * CONFIG.chunkSize;
      const tileEndR = (chunkEndY + 1) * CONFIG.chunkSize - 1;
      
      // Kontinuierliche Noise-Evaluation über den ganzen Super-Chunk!
      for (let q = tileStartQ; q <= tileEndQ; q++) {
        for (let r = tileStartR; r <= tileEndR; r++) {
          const terrain = getTerrain(q, r, CONFIG.worldSeed);
          const resourceType = getResourceType(terrain);
          
          superChunkTiles.set(`${q},${r}`, {
            q,
            r,
            terrain,
            resourceType,
            resourceAmount: resourceType ? Math.floor(Math.random() * 500) + 500 : undefined
          });
          
          totalTiles++;
        }
      }
      
      // 2. Unterteile Super-Chunk in 32x32 Storage-Chunks
      for (let chunkX = chunkStartX; chunkX <= chunkEndX; chunkX++) {
        for (let chunkY = chunkStartY; chunkY <= chunkEndY; chunkY++) {
          
          const tiles: typeof superChunkTiles extends Map<string, infer T> ? T[] : never = [];
          
          const startQ = chunkX * CONFIG.chunkSize;
          const startR = chunkY * CONFIG.chunkSize;
          
          // Sammle Tiles für diesen Storage-Chunk aus dem Super-Chunk
          for (let localQ = 0; localQ < CONFIG.chunkSize; localQ++) {
            for (let localR = 0; localR < CONFIG.chunkSize; localR++) {
              const q = startQ + localQ;
              const r = startR + localR;
              
              const tile = superChunkTiles.get(`${q},${r}`);
              if (tile) {
                tiles.push(tile);
              }
            }
          }
          
          // Speichere in MongoDB
          const chunkData = {
            _id: `chunk_${chunkX}_${chunkY}`,
            chunkX,
            chunkY,
            tiles,
            lastModified: new Date()
          };
          
          await chunkManager.saveChunk(chunkData);
          totalChunks++;
        }
      }
      
      // Progress
      const elapsed = (Date.now() - startTime) / 1000;
      const chunkPerSec = totalChunks / elapsed;
      const totalChunksExpected = (CONFIG.maxChunkX - CONFIG.minChunkX + 1) * (CONFIG.maxChunkY - CONFIG.minChunkY + 1);
      const remaining = (totalChunksExpected - totalChunks) / chunkPerSec;
      
      console.log(`📦 Super-Chunk [${superChunkX + 1}/${totalSuperChunksX}, ${superChunkY + 1}/${totalSuperChunksY}] → ${totalChunks} chunks (${totalTiles.toLocaleString()} tiles) - ${chunkPerSec.toFixed(1)} chunks/s - ETA: ${Math.ceil(remaining)}s`);
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  console.log('');
  console.log('✅ World Generation Complete!');
  console.log(`   Total Chunks: ${totalChunks}`);
  console.log(`   Total Tiles: ${totalTiles.toLocaleString()}`);
  console.log(`   Time: ${elapsed.toFixed(1)}s`);
  console.log(`   Speed: ${(totalChunks / elapsed).toFixed(1)} chunks/s`);
  console.log('');
  
  await chunkManager.disconnect();
  process.exit(0);
}

// Run
generateWorld().catch(error => {
  console.error('❌ Error during world generation:', error);
  process.exit(1);
});
