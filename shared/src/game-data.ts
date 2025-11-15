// ===========================
// GAME DATA - Central Export
// ===========================
// This file re-exports all game data from their respective modules

export { BUILDING_DEFINITIONS } from './game-data/buildings';
export { UNIT_DEFINITIONS } from './game-data/units';
export { TECHNOLOGY_DEFINITIONS } from './game-data/technologies';
export { BIOME_DEFINITIONS } from './game-data/biomes';
export { RESOURCE_DEFINITIONS, STARTING_RESOURCES, BASE_STORAGE_CAPACITY } from './game-data/resources';
export { 
  BIOME_COLORS, 
  BIOME_SHADOWS, 
  RESOURCE_COLORS, 
  UI_COLORS,
  hexToCSS,
  cssToHex
} from './game-data/colors';
