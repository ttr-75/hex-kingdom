import { ResourceType, ResourceDefinition } from '../types';

// ===========================
// RESOURCE DEFINITIONS
// ===========================

export const RESOURCE_DEFINITIONS: Record<ResourceType, ResourceDefinition> = {
  [ResourceType.WOOD]: {
    type: ResourceType.WOOD,
    name: 'Holz',
    icon: '🪵',
    color: '#8B4513',
    description: 'Grundbaustoff für viele Gebäude und Einheiten'
  },
  [ResourceType.STONE]: {
    type: ResourceType.STONE,
    name: 'Stein',
    icon: '🪨',
    color: '#696969',
    description: 'Schwerer Baustoff für fortgeschrittene Strukturen'
  },
  [ResourceType.IRON]: {
    type: ResourceType.IRON,
    name: 'Eisen',
    icon: '⚔️',
    color: '#C0C0C0',
    description: 'Wichtig für Waffen und militärische Einheiten'
  },
  [ResourceType.GOLD]: {
    type: ResourceType.GOLD,
    name: 'Gold',
    icon: '💰',
    color: '#FFD700',
    description: 'Wertvolle Währung für Handel und Upgrades'
  },
  [ResourceType.FOOD]: {
    type: ResourceType.FOOD,
    name: 'Nahrung',
    icon: '🌾',
    color: '#c8ca2e',
    description: 'Erhält die Bevölkerung und ermöglicht Wachstum'
  },
  [ResourceType.FISH]: {
    type: ResourceType.FISH,
    name: 'Fisch',
    icon: '🐟',
    color: '#64B5F6',
    description: 'Alternative Nahrungsquelle aus Gewässern'
  }
};

// ===========================
// STARTING RESOURCES
// ===========================

/*
export const STARTING_RESOURCES = {
  [ResourceType.WOOD]: 100,
  [ResourceType.STONE]: 80,
  [ResourceType.IRON]: 40,
  [ResourceType.GOLD]: 50,
  [ResourceType.FOOD]: 100,
  [ResourceType.FISH]: 100
};
*/

export const STARTING_RESOURCES = {
  [ResourceType.WOOD]: 1000,
  [ResourceType.STONE]: 800,
  [ResourceType.IRON]: 400,
  [ResourceType.GOLD]: 500,
  [ResourceType.FOOD]: 1000,
  [ResourceType.FISH]: 1000
};

export const STARTING_STORAGE_CAPACITY = {
  [ResourceType.WOOD]: 5000,
  [ResourceType.STONE]: 5000,
  [ResourceType.IRON]: 3000,
  [ResourceType.GOLD]: 2000,
  [ResourceType.FOOD]: 4000,
  [ResourceType.FISH]: 4000
};
