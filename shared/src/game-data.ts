import {
  BuildingType,
  BuildingDefinition,
  ResourceType,
  UnitType,
  UnitDefinition,
  Technology,
  TechnologyType,
  BiomeType,
  BiomeDefinition
} from './types';

// ===========================
// BUILDING DEFINITIONS
// ===========================

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  [BuildingType.MINE]: {
    type: BuildingType.MINE,
    name: 'Bergwerk',
    description: 'Fördert Stein und Eisen aus dem Boden',
    baseCost: { wood: 50, stone: 30 },
    baseProduction: { stone: 0.5, iron: 0.2 }, // Pro Sekunde
    constructionTime: 60,
    maxLevel: 5,
    upgradeMultiplier: 1.5
  },
  [BuildingType.FARM]: {
    type: BuildingType.FARM,
    name: 'Farm',
    description: 'Produziert Nahrung für die Bevölkerung',
    baseCost: { wood: 40, stone: 20 },
    baseProduction: { food: 0.8 },
    constructionTime: 45,
    maxLevel: 5,
    upgradeMultiplier: 1.4
  },
  [BuildingType.LUMBERMILL]: {
    type: BuildingType.LUMBERMILL,
    name: 'Sägewerk',
    description: 'Verarbeitet Holz aus umliegenden Wäldern',
    baseCost: { wood: 30, stone: 25 },
    baseProduction: { wood: 1.0 },
    constructionTime: 40,
    maxLevel: 5,
    upgradeMultiplier: 1.4
  },
  [BuildingType.WAREHOUSE]: {
    type: BuildingType.WAREHOUSE,
    name: 'Lagerhaus',
    description: 'Erhöht die Lagerkapazität für Ressourcen',
    baseCost: { wood: 60, stone: 40 },
    constructionTime: 50,
    maxLevel: 10,
    upgradeMultiplier: 1.3
  },
  [BuildingType.MARKETPLACE]: {
    type: BuildingType.MARKETPLACE,
    name: 'Marktplatz',
    description: 'Ermöglicht Handel mit anderen Spielern',
    baseCost: { wood: 80, stone: 60, gold: 50 },
    constructionTime: 90,
    maxLevel: 3,
    upgradeMultiplier: 2.0
  },
  [BuildingType.BARRACKS]: {
    type: BuildingType.BARRACKS,
    name: 'Kaserne',
    description: 'Rekrutiert und trainiert militärische Einheiten',
    baseCost: { wood: 100, stone: 80, iron: 40 },
    constructionTime: 120,
    maxLevel: 5,
    upgradeMultiplier: 1.6
  },
  [BuildingType.RESEARCH_LAB]: {
    type: BuildingType.RESEARCH_LAB,
    name: 'Forschungslabor',
    description: 'Erforscht neue Technologien',
    baseCost: { wood: 120, stone: 100, gold: 80 },
    constructionTime: 150,
    maxLevel: 5,
    upgradeMultiplier: 1.8
  }
};

// ===========================
// UNIT DEFINITIONS
// ===========================

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  [UnitType.WARRIOR]: {
    type: UnitType.WARRIOR,
    name: 'Krieger',
    cost: { wood: 30, iron: 20, food: 10 },
    upkeep: { food: 2, gold: 1 }, // Pro Minute
    health: 100,
    movementRange: 3,
    speedMultiplier: 0.7, // Normal speed
    attackPower: 15,
    defense: 10,
    recruitmentTime: 60
  },
  [UnitType.ARCHER]: {
    type: UnitType.ARCHER,
    name: 'Bogenschütze',
    cost: { wood: 40, iron: 10, food: 10 },
    upkeep: { food: 1.5, gold: 1 },
    health: 70,
    movementRange: 3,
    speedMultiplier: 0.8, // Normal speed
    attackPower: 20,
    defense: 5,
    recruitmentTime: 50
  },
  [UnitType.CAVALRY]: {
    type: UnitType.CAVALRY,
    name: 'Kavallerie',
    cost: { wood: 50, iron: 40, food: 20, gold: 30 },
    upkeep: { food: 3, gold: 3 },
    health: 120,
    movementRange: 5,
    speedMultiplier: 1.5, // Fast (cavalry)
    attackPower: 25,
    defense: 12,
    recruitmentTime: 90,
    visionBonus: 1 // Späher sehen +1 Tiles weiter
  },
  [UnitType.SCOUT]: {
    type: UnitType.SCOUT,
    name: 'Späher',
    cost: { wood: 20, food: 5, gold: 10 },
    upkeep: { food: 1, gold: 0.5 },
    health: 50,
    movementRange: 6,
    speedMultiplier: 2.5, // Faster than normal units
    attackPower: 5,
    defense: 3,
    recruitmentTime: 30,
    visionBonus: 2 // Späher sehen +2 Tiles weiter
  }
};

// ===========================
// TECHNOLOGY DEFINITIONS
// ===========================

export const TECHNOLOGY_DEFINITIONS: Record<TechnologyType, Technology> = {
  // Wirtschaft
  [TechnologyType.EFFICIENT_MINING]: {
    type: TechnologyType.EFFICIENT_MINING,
    name: 'Effizienter Bergbau',
    description: 'Erhöht die Stein- und Eisenproduktion um 25%',
    cost: { gold: 100, stone: 50 },
    researchTime: 120,
    prerequisites: [],
    effects: [
      { target: 'production', modifier: 1.25, description: 'Bergwerk +25%' }
    ]
  },
  [TechnologyType.ADVANCED_FARMING]: {
    type: TechnologyType.ADVANCED_FARMING,
    name: 'Fortgeschrittene Landwirtschaft',
    description: 'Erhöht die Nahrungsproduktion um 30%',
    cost: { gold: 80, wood: 40 },
    researchTime: 100,
    prerequisites: [],
    effects: [
      { target: 'production', modifier: 1.3, description: 'Farm +30%' }
    ]
  },
  [TechnologyType.LOGGING_TECHNIQUE]: {
    type: TechnologyType.LOGGING_TECHNIQUE,
    name: 'Holzfälltechnik',
    description: 'Erhöht die Holzproduktion um 25%',
    cost: { gold: 60, stone: 30 },
    researchTime: 90,
    prerequisites: [],
    effects: [
      { target: 'production', modifier: 1.25, description: 'Sägewerk +25%' }
    ]
  },
  [TechnologyType.TRADE_ROUTES]: {
    type: TechnologyType.TRADE_ROUTES,
    name: 'Handelsrouten',
    description: 'Reduziert Handelsgebühren um 20%',
    cost: { gold: 150, wood: 50 },
    researchTime: 180,
    prerequisites: [],
    effects: [
      { target: 'trade', modifier: 0.8, description: 'Handelskosten -20%' }
    ]
  },
  [TechnologyType.STORAGE_EXPANSION]: {
    type: TechnologyType.STORAGE_EXPANSION,
    name: 'Lagererweiterung',
    description: 'Erhöht die Lagerkapazität um 50%',
    cost: { gold: 200, wood: 100, stone: 100 },
    researchTime: 200,
    prerequisites: [],
    effects: [
      { target: 'other', modifier: 1.5, description: 'Lagerkapazität +50%' }
    ]
  },

  // Militär
  [TechnologyType.WEAPON_FORGING]: {
    type: TechnologyType.WEAPON_FORGING,
    name: 'Waffenschmieden',
    description: 'Erhöht den Angriffswert aller Einheiten um 20%',
    cost: { gold: 180, iron: 100 },
    researchTime: 150,
    prerequisites: [],
    effects: [
      { target: 'unit_stats', modifier: 1.2, description: 'Angriff +20%' }
    ]
  },
  [TechnologyType.ARMOR_CRAFTING]: {
    type: TechnologyType.ARMOR_CRAFTING,
    name: 'Rüstungshandwerk',
    description: 'Erhöht die Verteidigung aller Einheiten um 25%',
    cost: { gold: 200, iron: 120 },
    researchTime: 160,
    prerequisites: [],
    effects: [
      { target: 'unit_stats', modifier: 1.25, description: 'Verteidigung +25%' }
    ]
  },
  [TechnologyType.CAVALRY_TRAINING]: {
    type: TechnologyType.CAVALRY_TRAINING,
    name: 'Kavallerieausbildung',
    description: 'Reduziert Rekrutierungszeit für Kavallerie um 30%',
    cost: { gold: 250, food: 100 },
    researchTime: 180,
    prerequisites: [],
    effects: [
      { target: 'other', modifier: 0.7, description: 'Kavallerie-Training -30%' }
    ]
  },

  // Infrastruktur
  [TechnologyType.STONE_MASONRY]: {
    type: TechnologyType.STONE_MASONRY,
    name: 'Steinmetzkunst',
    description: 'Reduziert Baukosten für Gebäude um 15%',
    cost: { gold: 120, stone: 80 },
    researchTime: 130,
    prerequisites: [],
    effects: [
      { target: 'building_cost', modifier: 0.85, description: 'Baukosten -15%' }
    ]
  },
  [TechnologyType.ENGINEERING]: {
    type: TechnologyType.ENGINEERING,
    name: 'Ingenieurwesen',
    description: 'Reduziert Bauzeit um 25%',
    cost: { gold: 180, stone: 100, iron: 50 },
    researchTime: 200,
    prerequisites: [TechnologyType.STONE_MASONRY],
    effects: [
      { target: 'other', modifier: 0.75, description: 'Bauzeit -25%' }
    ]
  },
  [TechnologyType.CARTOGRAPHY]: {
    type: TechnologyType.CARTOGRAPHY,
    name: 'Kartographie',
    description: 'Erhöht Sichtweite um 2 Felder',
    cost: { gold: 100, wood: 50 },
    researchTime: 120,
    prerequisites: [],
    effects: [
      { target: 'other', modifier: 2, description: 'Sichtweite +2' }
    ]
  },
  [TechnologyType.DIPLOMACY]: {
    type: TechnologyType.DIPLOMACY,
    name: 'Diplomatie',
    description: 'Ermöglicht Bündnisse und Handelsverträge',
    cost: { gold: 300, food: 100 },
    researchTime: 240,
    prerequisites: [TechnologyType.TRADE_ROUTES],
    effects: [
      { target: 'other', modifier: 1, description: 'Schaltet Diplomatie-Features frei' }
    ]
  }
};

// ===========================
// STARTING RESOURCES
// ===========================

export const STARTING_RESOURCES = {
  [ResourceType.WOOD]: 100,
  [ResourceType.STONE]: 80,
  [ResourceType.IRON]: 40,
  [ResourceType.GOLD]: 50,
  [ResourceType.FOOD]: 100,
  [ResourceType.FISH]: 100
};

export const STARTING_STORAGE_CAPACITY = {
  [ResourceType.WOOD]: 500,
  [ResourceType.STONE]: 500,
  [ResourceType.IRON]: 300,
  [ResourceType.GOLD]: 200,
  [ResourceType.FOOD]: 400,
  [ResourceType.FISH]: 400
};

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
