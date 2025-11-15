import { Technology, TechnologyType } from '../types';

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
