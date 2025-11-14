// Typen für Colyseus Room State
// Diese müssen mit den Server-Definitionen übereinstimmen

export interface PlayerState {
  id: string;
  username: string;
  color: string;
  
  wood: number;
  stone: number;
  iron: number;
  gold: number;
  food: number;
  
  storageWood: number;
  storageStone: number;
  storageIron: number;
  storageGold: number;
  storageFood: number;
  
  researchedTechs: string[];
  currentResearch: string;
  researchEndTime: number;
}

export interface BuildingState {
  id: string;
  type: string;
  q: number;
  r: number;
  owner: string;
  level: number;
  constructionProgress: number;
  constructionStartTime: number;
  constructionEndTime: number;
}

export interface UnitState {
  id: string;
  type: string;
  q: number;
  r: number;
  owner: string;
  health: number;
}

export interface TradeOfferState {
  id: string;
  seller: string;
  resource: string;
  amount: number;
  pricePerUnit: number;
  expiresAt: number;
}

export interface HexTileState {
  q: number;
  r: number;
  terrain: string;
  owner: string;
  resourceType: string;
  resourceAmount: number;
}

export interface GameRoomState {
  players: Map<string, PlayerState>;
  buildings: Map<string, BuildingState>;
  units: Map<string, UnitState>;
  tradeOffers: Map<string, TradeOfferState>;
  tiles: Map<string, HexTileState>;
  
  worldTime: number;
  tickRate: number;
}
