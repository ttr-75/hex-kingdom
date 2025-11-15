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
import { ResourceType, BiomeType } from '../../../shared/src/types.js';
import { BIOME_DEFINITIONS } from '../../../shared/src/game-data.js';
import { MongoClient } from 'mongodb';

// ===========================
// KONFIGURATION
// ===========================

const CONFIG = {
  // Database
  cleanDatabase: true,  // ⚠️ ACHTUNG: Löscht ALLE existierenden Chunks und Dynamic Data!

  // World Settings
  worldSeed: Math.round(Math.random() * 1000000),  // Ändere für andere Welten

  // Generation Area (in Chunks)
  minChunkX: -20,     // Generiere von  -10 bis +10 = 21 Chunks
  maxChunkX: 20,
  minChunkY: -20,
  maxChunkY: 20,

  // Chunk Size
  chunkSize: 16,      // 16x16 Hexagone pro Chunk (kleinere Dokumente für bessere Granularität)
  superChunkSize: 50,  // Generiere in 50x50 Chunk-Blöcken = 800x800 tiles auf einmal!

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

  // River Generation
  riverFrequency: 0.015,    // Wie oft Flüsse starten (höher = mehr Flüsse)
  riverMinLength: 15,       // Minimale Flusslänge
  riverMaxLength: 80,       // Maximale Flusslänge
  lakeFrequency: 0.0001,     // Wie oft Seen generiert werden (reduziert von 0.008)
  lakeMinSize: 2,           // Minimale Seegröße (Radius)
  lakeMaxSize: 10,          // Maximale Seegröße (Radius)
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

/**
 * Bestimmt das Biom basierend auf Elevation, Moisture und weiteren Faktoren
 */
function getBiome(q: number, r: number, seed: number): BiomeType {
  // Layer 1: Kontinente
  const continentValue = continentNoise(q, r, seed);

  // Leichte Bias zum Zentrum
  const distance = Math.sqrt(q * q + r * r) / 100;
  const centerBias = 1.0 - Math.min(distance * 0.3, 0.5);

  const adjustedContinent = continentValue + centerBias * 0.2;

  // Ocean (tiefes Wasser)?
  if (adjustedContinent < CONFIG.waterThreshold) return BiomeType.OCEAN;

  // Layer 2: Höhe
  const elevation = elevationNoise(q, r, seed);

  // Layer 3: Feuchtigkeit
  const moisture = moistureNoise(q, r, seed);

  // Layer 4: Temperatur (basierend auf Breitengrad + Noise)
  const temperature = Math.abs(r / 50) + moistureNoise(r, q, seed + 5000) * 0.3;

  // === GEBIRGE & HÜGEL (höhenbasiert) ===
  if (elevation > 0.7) return BiomeType.MOUNTAINS;
  if (elevation > 0.5) return BiomeType.HILLS;

  // === FLACHLAND (feuchtigkeit & temperatur) ===

  // Sehr trocken -> Wüste oder Steppe
  if (moisture < -0.5) {
    return temperature > 0.6 ? BiomeType.DESERT : BiomeType.STEPPE;
  }

  // Sehr feucht -> Sumpf oder Wälder
  if (moisture > 0.5) {
    return elevation < 0.2 ? BiomeType.SWAMP :
      (temperature > 0.5 ? BiomeType.DECIDUOUS_FOREST : BiomeType.CONIFEROUS_FOREST);
  }

  // Mittlere Feuchtigkeit -> Grasland oder Wälder
  if (moisture > 0.2) {
    return temperature > 0.6 ? BiomeType.DECIDUOUS_FOREST : BiomeType.CONIFEROUS_FOREST;
  }

  // Trocken -> Steppe (nur bei hoher Temperatur), sonst Grasland
  if (moisture < -0.2) {
    return temperature > 0.7 ? BiomeType.STEPPE : BiomeType.GRASSLAND;
  }

  // Default: Grasland (für moisture zwischen -0.2 und 0.2)
  return BiomeType.GRASSLAND;
}

/**
 * Generiert alle möglichen Ressourcen für ein Biom (mehrere möglich!)
 */
function getResourcesForBiome(biome: BiomeType, q: number, r: number): Array<{ type: ResourceType; amount: number }> {
  const biomeDef = BIOME_DEFINITIONS[biome];
  const resources: Array<{ type: ResourceType; amount: number }> = [];

  // Prüfe alle möglichen Ressourcen für dieses Biom
  for (let i = 0; i < biomeDef.resourceSpawns.length; i++) {
    const spawn = biomeDef.resourceSpawns[i];
    
    // Verwende unterschiedliche Seeds für jede Ressource
    const coordSeed = Math.abs(Math.sin(q * 12.9898 + r * 78.233 + i * 1000) * 43758.5453);
    const rand = coordSeed - Math.floor(coordSeed);

    // Interpoliere zwischen min und max probability
    const probRange = spawn.probability.max - spawn.probability.min;
    const coordSeed2 = Math.abs(Math.sin(q * 37.123 + r * 51.456 + i * 2000) * 23421.8765);
    const rand2 = coordSeed2 - Math.floor(coordSeed2);
    const actualProb = spawn.probability.min + (rand2 * probRange);

    if (rand < actualProb) {
      // Bestimme Menge
      const amountRange = spawn.amount.max - spawn.amount.min;
      const coordSeed3 = Math.abs(Math.sin(q * 63.789 + r * 29.123 + i * 3000) * 12345.6789);
      const rand3 = coordSeed3 - Math.floor(coordSeed3);
      const amount = Math.floor(spawn.amount.min + (rand3 * amountRange));

      resources.push({
        type: spawn.resourceType,
        amount
      });
    }
  }

  return resources;
}

function getFertility(biome: BiomeType, q: number, r: number): number {
  const biomeDef = BIOME_DEFINITIONS[biome];

  // Verwende Koordinaten für deterministisches "Random"
  const coordSeed = Math.abs(Math.sin(q * 45.678 + r * 87.234) * 56789.1234);
  const rand = coordSeed - Math.floor(coordSeed);

  const fertilityRange = biomeDef.fertility.max - biomeDef.fertility.min;
  return biomeDef.fertility.min + (rand * fertilityRange);
}

function getPopulation(biome: BiomeType, q: number, r: number): number {
  const biomeDef = BIOME_DEFINITIONS[biome];

  // Kein populationSpawn definiert = keine Bevölkerung
  if (!biomeDef.populationSpawn) {
    return 0;
  }

  // Verwende Koordinaten für deterministisches "Random"
  const coordSeed = Math.abs(Math.sin(q * 91.234 + r * 67.891) * 34567.8901);
  const rand = coordSeed - Math.floor(coordSeed);

  // Interpoliere zwischen min und max probability
  const probRange = biomeDef.populationSpawn.probability.max - biomeDef.populationSpawn.probability.min;
  const coordSeed2 = Math.abs(Math.sin(q * 23.456 + r * 78.912) * 87654.3210);
  const rand2 = coordSeed2 - Math.floor(coordSeed2);
  const actualProb = biomeDef.populationSpawn.probability.min + (rand2 * probRange);

  // Prüfe ob Bevölkerung spawnt
  if (rand >= actualProb) {
    return 0;
  }

  // Bestimme Anzahl
  const amountRange = biomeDef.populationSpawn.amount.max - biomeDef.populationSpawn.amount.min;
  const coordSeed3 = Math.abs(Math.sin(q * 56.789 + r * 34.567) * 98765.4321);
  const rand3 = coordSeed3 - Math.floor(coordSeed3);
  const amount = Math.floor(biomeDef.populationSpawn.amount.min + (rand3 * amountRange));

  return amount;
}

// ===========================
// FLUSS & SEE GENERATION
// ===========================

interface RiverPoint {
  q: number;
  r: number;
}

/**
 * Generiert Flusspfade basierend auf Elevation (Flüsse fließen bergab)
 */
function generateRivers(
  tiles: Map<string, { q: number; r: number; biome: BiomeType; elevation: number }>,
  seed: number
): Set<string> {
  const riverTiles = new Set<string>();
  const processedStarts = new Set<string>();

  // Sammle potentielle Startpunkte (Berge/Hügel)
  const startPoints: RiverPoint[] = [];
  tiles.forEach((tile) => {
    if (tile.biome === BiomeType.MOUNTAINS || tile.biome === BiomeType.HILLS) {
      // Deterministisches "Random" für Startpunkt-Selektion
      const coordSeed = Math.abs(Math.sin(tile.q * 91.234 + tile.r * 71.456 + seed) * 54321.9876);
      const rand = coordSeed - Math.floor(coordSeed);
      
      if (rand < CONFIG.riverFrequency) {
        startPoints.push({ q: tile.q, r: tile.r });
      }
    }
  });

  console.log(`🌊 Generiere ${startPoints.length} Flüsse...`);

  // Generiere Flüsse von jedem Startpunkt
  for (const start of startPoints) {
    const key = `${start.q},${start.r}`;
    if (processedStarts.has(key)) continue;
    processedStarts.add(key);

    // Trace river downhill
    let current = start;
    let length = 0;
    const visited = new Set<string>();
    visited.add(`${current.q},${current.r}`);

    while (length < CONFIG.riverMaxLength) {
      const currentTile = tiles.get(`${current.q},${current.r}`);
      if (!currentTile) break;

      // Wenn Ocean erreicht, stoppe
      if (currentTile.biome === BiomeType.OCEAN) break;

      // Finde niedrigsten Nachbarn (6 Hex-Richtungen)
      const neighbors = [
        { q: current.q + 1, r: current.r },
        { q: current.q - 1, r: current.r },
        { q: current.q, r: current.r + 1 },
        { q: current.q, r: current.r - 1 },
        { q: current.q + 1, r: current.r - 1 },
        { q: current.q - 1, r: current.r + 1 },
      ];

      let lowestNeighbor: RiverPoint | null = null;
      let lowestElevation = currentTile.elevation;

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.q},${neighbor.r}`;
        if (visited.has(neighborKey)) continue;

        const neighborTile = tiles.get(neighborKey);
        if (!neighborTile) continue;

        if (neighborTile.elevation < lowestElevation) {
          lowestElevation = neighborTile.elevation;
          lowestNeighbor = neighbor;
        }
      }

      // Kein niedrigerer Nachbar = Ende (See bilden)
      if (!lowestNeighbor) break;

      // Bewege zu niedrigerem Nachbarn
      current = lowestNeighbor;
      const currentKey = `${current.q},${current.r}`;
      visited.add(currentKey);
      
      // Markiere als Fluss (nur wenn nicht bereits Ocean)
      const tile = tiles.get(currentKey);
      if (tile && tile.biome !== BiomeType.OCEAN) {
        riverTiles.add(currentKey);
      }

      length++;

      // Früher Stop wenn zu kurz
      if (length >= CONFIG.riverMinLength && tile?.biome === BiomeType.OCEAN) break;
    }
  }

  return riverTiles;
}

/**
 * Generiert Seen an niedrigen Punkten auf dem Land
 */
function generateLakes(
  tiles: Map<string, { q: number; r: number; biome: BiomeType; elevation: number }>,
  seed: number
): Set<string> {
  const lakeTiles = new Set<string>();

  // Finde potentielle See-Zentren (niedrige Elevation, nicht Ocean)
  const lakecenters: RiverPoint[] = [];
  tiles.forEach((tile) => {
    if (tile.biome !== BiomeType.OCEAN && tile.elevation < 0.3) {
      // Deterministisches "Random"
      const coordSeed = Math.abs(Math.sin(tile.q * 83.456 + tile.r * 61.789 + seed) * 98765.4321);
      const rand = coordSeed - Math.floor(coordSeed);

      if (rand < CONFIG.lakeFrequency) {
        lakecenters.push({ q: tile.q, r: tile.r });
      }
    }
  });

  console.log(`🏞️ Generiere ${lakecenters.length} Seen...`);

  // Generiere See um jedes Zentrum
  for (const center of lakecenters) {
    // Bestimme Größe
    const coordSeed = Math.abs(Math.sin(center.q * 53.789 + center.r * 41.234 + seed) * 32109.8765);
    const rand = coordSeed - Math.floor(coordSeed);
    const radius = Math.floor(CONFIG.lakeMinSize + rand * (CONFIG.lakeMaxSize - CONFIG.lakeMinSize));

    // Fülle Hexagon-Radius mit See-Tiles
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const ds = -dq - dr;
        if (Math.abs(ds) <= radius) {
          const q = center.q + dq;
          const r = center.r + dr;
          const key = `${q},${r}`;
          const tile = tiles.get(key);

          if (tile && tile.biome !== BiomeType.OCEAN) {
            lakeTiles.add(key);
          }
        }
      }
    }
  }

  return lakeTiles;
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

  // ===========================
  // CLEANUP (Optional)
  // ===========================
  if (CONFIG.cleanDatabase) {
    console.log('🧹 Cleaning database...');
    const mongoUrl = 'mongodb://localhost:27017';
    const client = new MongoClient(mongoUrl);
    await client.connect();
    const db = client.db('hex-kingdom');

    const chunksDeleted = await db.collection('chunks').deleteMany({});
    const dynamicDeleted = await db.collection('tile_dynamic_data').deleteMany({});

    console.log(`   ✅ Deleted ${chunksDeleted.deletedCount} chunks`);
    console.log(`   ✅ Deleted ${dynamicDeleted.deletedCount} dynamic tile data`);
    console.log('');

    await client.close();
  }

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
        biome: BiomeType;
        fertility: number;
        resources: Array<{ type: ResourceType; amount: number }>;
        population?: number;
      }>();

      const tileStartQ = chunkStartX * CONFIG.chunkSize;
      const tileEndQ = (chunkEndX + 1) * CONFIG.chunkSize - 1;
      const tileStartR = chunkStartY * CONFIG.chunkSize;
      const tileEndR = (chunkEndY + 1) * CONFIG.chunkSize - 1;

      // Kontinuierliche Noise-Evaluation über den ganzen Super-Chunk!
      const tilesWithElevation = new Map<string, {
        q: number;
        r: number;
        biome: BiomeType;
        elevation: number;
        fertility: number;
        resources: Array<{ type: ResourceType; amount: number }>;
        population?: number;
      }>();

      for (let q = tileStartQ; q <= tileEndQ; q++) {
        for (let r = tileStartR; r <= tileEndR; r++) {
          const biome = getBiome(q, r, CONFIG.worldSeed);
          const elevation = elevationNoise(q, r, CONFIG.worldSeed);
          const fertility = getFertility(biome, q, r);
          const resources = getResourcesForBiome(biome, q, r);
          const population = getPopulation(biome, q, r);

          tilesWithElevation.set(`${q},${r}`, {
            q,
            r,
            biome,
            elevation,
            fertility,
            resources,
            population: population > 0 ? population : undefined
          });

          totalTiles++;
        }
      }

      // 🌊 Generiere Flüsse und Seen für diesen Super-Chunk
      const riverTiles = generateRivers(tilesWithElevation, CONFIG.worldSeed);
      const lakeTiles = generateLakes(tilesWithElevation, CONFIG.worldSeed);

      // Überschreibe Biome mit Flüssen und Seen UND regeneriere Ressourcen
      riverTiles.forEach(key => {
        const tile = tilesWithElevation.get(key);
        if (tile) {
          tile.biome = BiomeType.RIVER;
          // Regeneriere Ressourcen für das neue Biom (Fisch statt alte Ressourcen)
          tile.resources = getResourcesForBiome(BiomeType.RIVER, tile.q, tile.r);
          tile.fertility = 0; // Gewässer haben keine Fruchtbarkeit
          tile.population = undefined; // Gewässer haben keine Bevölkerung
        }
      });

      lakeTiles.forEach(key => {
        const tile = tilesWithElevation.get(key);
        if (tile) {
          tile.biome = BiomeType.LAKE;
          // Regeneriere Ressourcen für das neue Biom (Fisch statt alte Ressourcen)
          tile.resources = getResourcesForBiome(BiomeType.LAKE, tile.q, tile.r);
          tile.fertility = 0; // Gewässer haben keine Fruchtbarkeit
          tile.population = undefined; // Gewässer haben keine Bevölkerung
        }
      });

      // Konvertiere zu finalem Format (ohne elevation)
      tilesWithElevation.forEach((tile, key) => {
        superChunkTiles.set(key, {
          q: tile.q,
          r: tile.r,
          biome: tile.biome,
          fertility: tile.fertility,
          resources: tile.resources,
          population: tile.population
        });
      });

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
