import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
// Import types if needed later
// import {
//   HexCoord,
//   ResourceType,
//   Resources,
//   BuildingType,
//   UnitType,
//   TechnologyType
// } from '@hex-kingdom/shared';

// Player State
export class PlayerState extends Schema {
  @type('string') id: string = '';
  @type('string') username: string = '';
  @type('string') color: string = '';
  
  @type('number') wood: number = 100;
  @type('number') stone: number = 80;
  @type('number') iron: number = 40;
  @type('number') gold: number = 50;
  @type('number') food: number = 100;
  @type('number') fish: number = 0;
  
  @type('number') storageWood: number = 500;
  @type('number') storageStone: number = 500;
  @type('number') storageIron: number = 300;
  @type('number') storageGold: number = 200;
  @type('number') storageFood: number = 400;
  @type('number') storageFish: number = 300;
  
  @type(['string']) researchedTechs = new Array<string>();
  @type('string') currentResearch: string = '';
  @type('number') researchEndTime: number = 0;
}

// Building State
export class BuildingState extends Schema {
  @type('string') id: string = '';
  @type('string') type: string = '';
  @type('number') q: number = 0;
  @type('number') r: number = 0;
  @type('string') owner: string = '';
  @type('number') level: number = 1;
  @type('number') constructionProgress: number = 1; // 0-1 (berechnet)
  @type('number') constructionStartTime: number = 0; // Unix timestamp in ms
  @type('number') constructionEndTime: number = 0; // Unix timestamp in ms
}

// Unit State
export class UnitState extends Schema {
  @type('string') id: string = '';
  @type('string') type: string = '';
  @type('number') q: number = 0;
  @type('number') r: number = 0;
  @type('string') owner: string = '';
  @type('number') health: number = 100;
  @type('boolean') isMoving: boolean = false;
}

// Trade Offer State
export class TradeOfferState extends Schema {
  @type('string') id: string = '';
  @type('string') seller: string = '';
  @type('string') resource: string = '';
  @type('number') amount: number = 0;
  @type('number') pricePerUnit: number = 0;
  @type('number') expiresAt: number = 0;
}

// Resource on Tile
export class TileResource extends Schema {
  @type('string') type: string = '';
  @type('number') amount: number = 0;
}

// Hex Tile State
export class HexTileState extends Schema {
  @type('number') q: number = 0;
  @type('number') r: number = 0;
  @type('string') biome: string = 'grassland';    // Biome-System
  @type('number') fertility: number = 0.5;        // Fruchtbarkeit 0-1
  @type('string') owner: string = '';
  @type([TileResource]) resources = new ArraySchema<TileResource>(); // Mehrere Ressourcen möglich
  @type('number') population: number = 0;         // Anzahl der Einwohner
}

// Main Game State
export class GameRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: BuildingState }) buildings = new MapSchema<BuildingState>();
  @type({ map: UnitState }) units = new MapSchema<UnitState>();
  @type({ map: TradeOfferState }) tradeOffers = new MapSchema<TradeOfferState>();
  @type({ map: HexTileState }) tiles = new MapSchema<HexTileState>();
  
  @type('number') worldTime: number = 0; // Spielzeit in Sekunden
  @type('number') tickRate: number = 10; // Updates pro Sekunde
}
