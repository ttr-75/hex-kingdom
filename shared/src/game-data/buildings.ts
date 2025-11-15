import { BuildingType, BuildingDefinition } from './types';

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
