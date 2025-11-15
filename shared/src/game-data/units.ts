import { UnitType, UnitDefinition } from './types';

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
