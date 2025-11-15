// ===========================
// HEX COORDINATE SYSTEM
// ===========================

/**
 * Axiales Hex-Koordinaten-System
 * Siehe: https://www.redblobgames.com/grids/hexagons/
 */
export interface HexCoord {
  q: number; // Spalte (column)
  r: number; // Reihe (row)
}

export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

// ===========================
// RESOURCES
// ===========================

export enum ResourceType {
  WOOD = 'wood',
  STONE = 'stone',
  IRON = 'iron',
  GOLD = 'gold',
  FOOD = 'food',
  FISH = 'fish'
}

export interface Resources {
  [ResourceType.WOOD]: number;
  [ResourceType.STONE]: number;
  [ResourceType.IRON]: number;
  [ResourceType.GOLD]: number;
  [ResourceType.FOOD]: number;
  [ResourceType.FISH]: number;
}

// ===========================
// BUILDINGS
// ===========================

export enum BuildingType {
  MINE = 'mine',           // Produziert Stein/Eisen
  FARM = 'farm',           // Produziert Nahrung
  LUMBERMILL = 'lumbermill', // Produziert Holz
  WAREHOUSE = 'warehouse', // Erhöht Lager-Kapazität
  MARKETPLACE = 'marketplace', // Ermöglicht Handel
  BARRACKS = 'barracks',   // Rekrutiert Einheiten
  RESEARCH_LAB = 'research_lab', // Ermöglicht Forschung
  RESIDENCE = 'residence'  // Beherbergt Einwohner
}

export interface Building {
  id: string;
  type: BuildingType;
  position: HexCoord;
  level: number;
  owner: string; // Spieler-ID
  constructionProgress: number; // 0-1 (1 = fertig)
  productionRate?: Partial<Resources>; // Pro Sekunde
}

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  icon: string; // Emoji für die UI
  description: string;
  baseCost: Partial<Resources>;
  baseProduction?: Partial<Resources>; // Pro Sekunde
  constructionTime: number; // Sekunden
  maxLevel: number;
  upgradeMultiplier: number; // Kosten-Multiplikator pro Level
  housingCapacity?: number; // Anzahl der Einwohner pro Level
}

// ===========================
// UNITS
// ===========================

export enum UnitType {
  WARRIOR = 'warrior',
  ARCHER = 'archer',
  CAVALRY = 'cavalry',
  SCOUT = 'scout'
}

export interface Unit {
  id: string;
  type: UnitType;
  position: HexCoord;
  owner: string;
  health: number;
  movementRange: number;
  attackPower: number;
  defense: number;
}

export interface UnitDefinition {
  type: UnitType;
  name: string;
  cost: Partial<Resources>;
  upkeep: Partial<Resources>; // Pro Minute
  health: number;
  movementRange: number;
  speedMultiplier: number; // 1.0 = normal, 1.5 = fast, 0.8 = slow
  attackPower: number;
  defense: number;
  recruitmentTime: number; // Sekunden
  visionBonus?: number; // Zusätzliche Sichtweite (addiert zu Biome viewDistance)
}

// ===========================
// RESEARCH / TECHNOLOGY
// ===========================

export enum TechnologyType {
  // Wirtschaft
  EFFICIENT_MINING = 'efficient_mining',
  ADVANCED_FARMING = 'advanced_farming',
  LOGGING_TECHNIQUE = 'logging_technique',
  TRADE_ROUTES = 'trade_routes',
  STORAGE_EXPANSION = 'storage_expansion',
  
  // Militär
  WEAPON_FORGING = 'weapon_forging',
  ARMOR_CRAFTING = 'armor_crafting',
  CAVALRY_TRAINING = 'cavalry_training',
  
  // Infrastruktur
  STONE_MASONRY = 'stone_masonry',
  ENGINEERING = 'engineering',
  CARTOGRAPHY = 'cartography',
  DIPLOMACY = 'diplomacy'
}

export interface Technology {
  type: TechnologyType;
  name: string;
  description: string;
  cost: Partial<Resources>;
  researchTime: number; // Sekunden
  prerequisites: TechnologyType[];
  effects: TechnologyEffect[];
}

export interface TechnologyEffect {
  target: 'production' | 'unit_stats' | 'building_cost' | 'trade' | 'other';
  modifier: number; // Multiplikator (z.B. 1.2 = +20%)
  description: string;
}

export interface PlayerResearch {
  completed: Set<TechnologyType>;
  inProgress?: {
    technology: TechnologyType;
    startTime: number;
    endTime: number;
  };
}

// ===========================
// TRADING
// ===========================

export interface TradeOffer {
  id: string;
  seller: string; // Spieler-ID
  resource: ResourceType;
  amount: number;
  pricePerUnit: number; // In Gold
  createdAt: number;
  expiresAt: number;
}

export interface TradeTransaction {
  id: string;
  buyer: string;
  seller: string;
  resource: ResourceType;
  amount: number;
  totalPrice: number;
  timestamp: number;
}

// ===========================
// PLAYER
// ===========================

export interface Player {
  id: string;
  username: string;
  color: string; // Hex color code
  resources: Resources;
  storageCapacity: Resources;
  buildings: Building[];
  units: Unit[];
  research: PlayerResearch;
  territories: HexCoord[]; // Kontrollierte Hexfelder
}

// ===========================
// GAME STATE
// ===========================

export interface GameState {
  id: string;
  name: string;
  createdAt: number;
  players: Map<string, Player>;
  map: HexTile[];
  tradeOffers: TradeOffer[];
  worldTime: number; // Spielzeit in Sekunden
}

export interface HexTile {
  position: HexCoord;
  biome: BiomeType;      // Biome-System
  resourceNode?: ResourceNode;
  owner?: string; // Spieler-ID
  
  // Biome-spezifische Eigenschaften
  fertility?: number;    // 0-1, für Farming
}

// ===========================
// BIOMES
// ===========================

export enum BiomeType {
  DECIDUOUS_FOREST = 'deciduous_forest',  // Laubwald (lichter)
  CONIFEROUS_FOREST = 'coniferous_forest', // Nadelwald (dichter)
  GRASSLAND = 'grassland',                 // Grassland / Ebene
  HILLS = 'hills',                         // Hügel
  MOUNTAINS = 'mountains',                 // Gebirge
  SWAMP = 'swamp',                         // Sumpf/Moor
  STEPPE = 'steppe',                       // Steppe/Trockenland
  DESERT = 'desert',                       // Wüste
  OCEAN = 'ocean',                         // Ozean (tiefes Wasser)
  LAKE = 'lake',                           // See (flaches Wasser auf Land)
  RIVER = 'river'                          // Fluss
}

/**
 * Ressourcen-Spawn-Konfiguration für ein Biom
 */
export interface BiomeResourceSpawn {
  resourceType: ResourceType;
  probability: { min: number; max: number }; // Wahrscheinlichkeit 0-1
  amount: { min: number; max: number };      // Menge der Ressource
}

/**
 * Definition eines Bioms mit all seinen Eigenschaften
 */
export interface BiomeDefinition {
  type: BiomeType;
  name: string;
  description: string;
  
  // Sichtweite (in Hex-Feldern)
  viewDistance: number;
  
  // Bewegungsgeschwindigkeit (Multiplikator)
  // 1.0 = normal, 0.5 = halb so schnell, 1.5 = 50% schneller
  movementMultiplier: number;
  
  // Fruchtbarkeit (für Farming/Nahrungsproduktion)
  fertility: { min: number; max: number }; // 0-1, wird später in TileDetails definiert
  
  // Welche Ressourcen können spawnen
  resourceSpawns: BiomeResourceSpawn[];
  
  // Bevölkerung die auf diesem Biom spawnen kann
  populationSpawn?: {
    probability: { min: number; max: number }; // Wahrscheinlichkeit 0-1
    amount: { min: number; max: number };      // Anzahl der Einwohner
  };
  
  // Visuelle Eigenschaften (für später)
  color?: string; // Hex color für Minimap
}

export interface ResourceNode {
  type: ResourceType;
  amount: number; // Verbleibende Ressourcen
  maxAmount: number;
  regenerationRate?: number; // Pro Sekunde (für erneuerbare Ressourcen)
}

// ===========================
// NETWORK MESSAGES
// ===========================

export interface BuildCommand {
  position: HexCoord;
  buildingType: BuildingType;
}

export interface MoveUnitCommand {
  unitId: string;
  destination: HexCoord;
}

export interface RecruitUnitCommand {
  buildingId: string;  // Kaserne ID
  unitType: UnitType;
}

export interface ResearchCommand {
  technology: TechnologyType;
}

export interface CreateTradeOfferCommand {
  resource: ResourceType;
  amount: number;
  pricePerUnit: number;
}

export interface AcceptTradeOfferCommand {
  offerId: string;
  amount: number;
}
