import { ResourceType } from '../types';

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
