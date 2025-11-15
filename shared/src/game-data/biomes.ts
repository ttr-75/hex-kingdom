import { BiomeType, BiomeDefinition, ResourceType } from '../types';

// ===========================
// BIOME DEFINITIONS
// ===========================

export const BIOME_DEFINITIONS: Record<BiomeType, BiomeDefinition> = {
  [BiomeType.DECIDUOUS_FOREST]: {
    type: BiomeType.DECIDUOUS_FOREST,
    name: 'Laubwald',
    description: 'Lichter Wald mit Laubbäumen, moderate Sicht und Bewegung',
    viewDistance: 1,          // Mittlere Sichtweite
    movementMultiplier: 0.85, // Leicht verlangsamt
    fertility: { min: 0.6, max: 0.8 },
    resourceSpawns: [
      {
        resourceType: ResourceType.WOOD,
        probability: { min: 0.5, max: 0.7 },
        amount: { min: 300, max: 600 }
      },
      {
        resourceType: ResourceType.FOOD,
        probability: { min: 0.2, max: 0.4 },
        amount: { min: 200, max: 400 }
      }
    ],
    populationSpawn: {
      probability: { min: 0.05, max: 0.15 }, // 5-15% Wahrscheinlichkeit
      amount: { min: 1, max: 3 }              // 1-3 Einwohner
    },
    color: '#4a7c3f'
  },

  [BiomeType.CONIFEROUS_FOREST]: {
    type: BiomeType.CONIFEROUS_FOREST,
    name: 'Nadelwald',
    description: 'Dichter Nadelwald, eingeschränkte Sicht und Bewegung',
    viewDistance: 0,          // Schlechte Sichtweite (dichter)
    movementMultiplier: 0.7,  // Deutlich verlangsamt
    fertility: { min: 0.3, max: 0.5 },
    resourceSpawns: [
      {
        resourceType: ResourceType.WOOD,
        probability: { min: 0.7, max: 0.9 },
        amount: { min: 500, max: 800 }
      },
      {
        resourceType: ResourceType.STONE,
        probability: { min: 0.1, max: 0.2 },
        amount: { min: 200, max: 400 }
      }
    ],
    populationSpawn: {
      probability: { min: 0.02, max: 0.08 }, // 2-8% Wahrscheinlichkeit
      amount: { min: 1, max: 2 }              // 1-2 Einwohner
    },
    color: '#2d5a2d'
  },

  [BiomeType.GRASSLAND]: {
    type: BiomeType.GRASSLAND,
    name: 'Grasland',
    description: 'Offene Ebenen, beste Sicht und Bewegung',
    viewDistance: 5,          // Sehr gute Sichtweite
    movementMultiplier: 1.2,  // Schnellere Bewegung
    fertility: { min: 0.7, max: 0.9 },
    resourceSpawns: [
      {
        resourceType: ResourceType.FOOD,
        probability: { min: 0.4, max: 0.6 },
        amount: { min: 400, max: 700 }
      },
      {
        resourceType: ResourceType.WOOD,
        probability: { min: 0.1, max: 0.2 },
        amount: { min: 100, max: 300 }
      }
    ],
    populationSpawn: {
      probability: { min: 0.15, max: 0.5 }, // 15-50
      // % Wahrscheinlichkeit
      amount: { min: 2, max: 10 }            // 2-10 Einwohner
    },
    color: '#7cb342'
  },

  [BiomeType.HILLS]: {
    type: BiomeType.HILLS,
    name: 'Hügelland',
    description: 'Hügelige Landschaft, gute Sicht aber langsamere Bewegung',
    viewDistance: 4,          // Gute Sichtweite (erhöhte Position)
    movementMultiplier: 0.8,  // Verlangsamt (bergauf/bergab)
    fertility: { min: 0.5, max: 0.7 },
    resourceSpawns: [
      {
        resourceType: ResourceType.STONE,
        probability: { min: 0.3, max: 0.5 },
        amount: { min: 300, max: 600 }
      },
      {
        resourceType: ResourceType.IRON,
        probability: { min: 0.2, max: 0.3 },
        amount: { min: 200, max: 400 }
      },
      {
        resourceType: ResourceType.FOOD,
        probability: { min: 0.2, max: 0.3 },
        amount: { min: 200, max: 400 }
      }
    ],
    color: '#8d6e63'
  },

  [BiomeType.MOUNTAINS]: {
    type: BiomeType.MOUNTAINS,
    name: 'Gebirge',
    description: 'Hochgebirge, exzellente Sicht aber sehr langsame Bewegung',
    viewDistance: 6,          // Beste Sichtweite (Höhenvorteil)
    movementMultiplier: 0.5,  // Sehr langsam (schwieriges Terrain)
    fertility: { min: 0.1, max: 0.3 },
    resourceSpawns: [
      {
        resourceType: ResourceType.STONE,
        probability: { min: 0.6, max: 0.8 },
        amount: { min: 500, max: 1000 }
      },
      {
        resourceType: ResourceType.IRON,
        probability: { min: 0.4, max: 0.6 },
        amount: { min: 400, max: 800 }
      },
      {
        resourceType: ResourceType.GOLD,
        probability: { min: 0.1, max: 0.2 },
        amount: { min: 300, max: 600 }
      }
    ],
    color: '#616161'
  },

  [BiomeType.SWAMP]: {
    type: BiomeType.SWAMP,
    name: 'Sumpf',
    description: 'Sumpfiges Moorland, schlechte Sicht und sehr langsame Bewegung',
    viewDistance: 2,          // Schlechte Sichtweite (Nebel, dichtes Unterholz)
    movementMultiplier: 0.6,  // Sehr langsam (schwieriges Gelände)
    fertility: { min: 0.4, max: 0.6 },
    resourceSpawns: [
      {
        resourceType: ResourceType.WOOD,
        probability: { min: 0.3, max: 0.5 },
        amount: { min: 200, max: 400 }
      },
      {
        resourceType: ResourceType.FOOD,
        probability: { min: 0.2, max: 0.3 },
        amount: { min: 150, max: 300 }
      },
      {
        resourceType: ResourceType.IRON,
        probability: { min: 0.1, max: 0.15 },
        amount: { min: 200, max: 400 }
      }
    ],
    color: '#5d4e37'
  },

  [BiomeType.STEPPE]: {
    type: BiomeType.STEPPE,
    name: 'Steppe',
    description: 'Trockenes Grasland, gute Sicht und Bewegung',
    viewDistance: 4,          // Gute Sichtweite (offen)
    movementMultiplier: 1.1,  // Etwas schneller als normal
    fertility: { min: 0.3, max: 0.5 },
    resourceSpawns: [
      {
        resourceType: ResourceType.FOOD,
        probability: { min: 0.2, max: 0.4 },
        amount: { min: 200, max: 400 }
      },
      {
        resourceType: ResourceType.STONE,
        probability: { min: 0.2, max: 0.3 },
        amount: { min: 200, max: 400 }
      }
    ],
    populationSpawn: {
      probability: { min: 0.01, max: 0.05 }, // 1-5% Wahrscheinlichkeit
      amount: { min: 1, max: 2 }              // 1-2 Einwohner
    },
    color: '#c5a777'
  },

  [BiomeType.DESERT]: {
    type: BiomeType.DESERT,
    name: 'Wüste',
    description: 'Trockene Wüste, sehr gute Sicht aber langsame Bewegung',
    viewDistance: 5,          // Sehr gute Sichtweite (keine Hindernisse)
    movementMultiplier: 0.75, // Verlangsamt (tiefer Sand)
    fertility: { min: 0.05, max: 0.2 },
    resourceSpawns: [
      {
        resourceType: ResourceType.GOLD,
        probability: { min: 0.15, max: 0.3 },
        amount: { min: 400, max: 800 }
      },
      {
        resourceType: ResourceType.STONE,
        probability: { min: 0.2, max: 0.3 },
        amount: { min: 300, max: 500 }
      }
    ],
    color: '#e4a672'
  },

  [BiomeType.OCEAN]: {
    type: BiomeType.OCEAN,
    name: 'Ozean',
    description: 'Tiefes Wasser, unpassierbar ohne Schiffe',
    viewDistance: 5,          // Sehr gute Sichtweite über Wasser
    movementMultiplier: 0.0,  // Nicht passierbar (ohne Schiffe)
    fertility: { min: 0, max: 0 },
    resourceSpawns: [
      {
        resourceType: ResourceType.FISH,
        probability: { min: 0.4, max: 0.6 },
        amount: { min: 400, max: 800 }
      }
    ],
    color: '#1565c0'
  },

  [BiomeType.LAKE]: {
    type: BiomeType.LAKE,
    name: 'See',
    description: 'Süßwassersee, flaches Wasser',
    viewDistance: 4,          // Gute Sichtweite
    movementMultiplier: 0.0,  // Nicht passierbar (ohne Schiffe)
    fertility: { min: 0, max: 0 },
    resourceSpawns: [
      {
        resourceType: ResourceType.FISH,
        probability: { min: 0.5, max: 0.7 },
        amount: { min: 300, max: 600 }
      }
    ],
    color: '#42a5f5'
  },

  [BiomeType.RIVER]: {
    type: BiomeType.RIVER,
    name: 'Fluss',
    description: 'Fließendes Wasser, passierbar an flachen Stellen',
    viewDistance: 1,          // Moderate Sichtweite
    movementMultiplier: 0.3,  // Langsam passierbar (Furten)
    fertility: { min: 0, max: 0 },
    resourceSpawns: [
      {
        resourceType: ResourceType.FISH,
        probability: { min: 0.6, max: 0.8 },
        amount: { min: 200, max: 500 }
      }
    ],
    color: '#64b5f6'
  }
};
