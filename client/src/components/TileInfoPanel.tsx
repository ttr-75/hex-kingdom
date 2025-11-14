import { HexCoord, BuildingType } from '@hex-kingdom/shared';
import { HexTileState, BuildingState, PlayerState } from '../types/room-state';
import './TileInfoPanel.css';

interface TileInfoPanelProps {
  selectedHex: HexCoord | null;
  tile: HexTileState | undefined;
  building: BuildingState | undefined;
  currentPlayer: PlayerState | null;
  onBuild: (buildingType: BuildingType) => void;
  onClose: () => void;
}

const TERRAIN_NAMES: Record<string, string> = {
  grass: '🌱 Grasland',
  forest: '🌲 Wald',
  mountain: '⛰️ Gebirge',
  water: '💧 Wasser',
  desert: '🏜️ Wüste',
  hills: '⛰️ Hügel'
};

const RESOURCE_NAMES: Record<string, string> = {
  wood: '🪵 Holz',
  stone: '🪨 Stein',
  iron: '⚔️ Eisen',
  gold: '💰 Gold',
  food: '🌾 Nahrung'
};

const BUILDING_NAMES: Record<string, string> = {
  [BuildingType.LUMBERMILL]: '🪵 Sägewerk',
  [BuildingType.MINE]: '⛏️ Bergwerk',
  [BuildingType.FARM]: '🌾 Farm',
  [BuildingType.WAREHOUSE]: '📦 Lagerhaus',
  [BuildingType.MARKETPLACE]: '🏪 Marktplatz',
  [BuildingType.BARRACKS]: '⚔️ Kaserne',
  [BuildingType.RESEARCH_LAB]: '🔬 Forschungslabor'
};

const BUILDING_COSTS: Record<string, { wood?: number; stone?: number; iron?: number; gold?: number }> = {
  [BuildingType.LUMBERMILL]: { wood: 30, stone: 25 },
  [BuildingType.MINE]: { wood: 50, stone: 30 },
  [BuildingType.FARM]: { wood: 40, stone: 20 },
  [BuildingType.WAREHOUSE]: { wood: 60, stone: 40 },
  [BuildingType.MARKETPLACE]: { wood: 80, stone: 60, gold: 50 },
  [BuildingType.BARRACKS]: { wood: 100, stone: 80, iron: 40 },
  [BuildingType.RESEARCH_LAB]: { wood: 120, stone: 100, gold: 80 }
};

export default function TileInfoPanel({
  selectedHex,
  tile,
  building,
  currentPlayer,
  onBuild,
  onClose
}: TileInfoPanelProps) {
  if (!selectedHex) {
    return (
      <div className="tile-info-panel empty">
        <div className="panel-header">
          <h3>📍 Tile-Info</h3>
        </div>
        <div className="panel-content">
          <p className="empty-message">Klicke auf ein Tile, um Details anzuzeigen</p>
        </div>
      </div>
    );
  }

  // Title mit Terrain-Typ und Koordinaten
  const terrainName = tile ? (TERRAIN_NAMES[tile.terrain] || tile.terrain) : 'Unbekannt';
  const titleText = `${terrainName} (${selectedHex.q}/${selectedHex.r})`;

  const canAfford = (buildingType: BuildingType): boolean => {
    if (!currentPlayer) return false;
    const cost = BUILDING_COSTS[buildingType];
    return (
      (cost.wood ?? 0) <= currentPlayer.wood &&
      (cost.stone ?? 0) <= currentPlayer.stone &&
      (cost.iron ?? 0) <= currentPlayer.iron &&
      (cost.gold ?? 0) <= currentPlayer.gold
    );
  };

  const isOwnedByPlayer = tile?.owner === currentPlayer?.id;
  const canBuild = isOwnedByPlayer && !building;

  return (
    <div className="tile-info-panel">
      <div className="panel-header">
        <h3>{titleText}</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-content">
        {/* Wenn kein Tile geladen */}
        {!tile && (
          <div className="info-section">
            <p className="info-message">
              ⏳ Tile-Daten werden geladen...
            </p>
          </div>
        )}

        {/* Ressourcen */}
        {tile?.resourceType && (
          <div className="info-section">
            <h4>Ressource</h4>
            <p className="resource">
              {RESOURCE_NAMES[tile.resourceType] || tile.resourceType}
              {tile.resourceAmount > 0 && ` (${tile.resourceAmount.toFixed(0)} verfügbar)`}
            </p>
          </div>
        )}

        {/* Keine Ressourcen */}
        {tile && !tile.resourceType && (
          <div className="info-section">
            <h4>Ressource</h4>
            <p className="resource">
              Keine natürlichen Ressourcen
            </p>
          </div>
        )}

        {/* Besitzer */}
        <div className="info-section">
          <h4>Besitzer</h4>
          {tile?.owner ? (
            <p className={`owner ${isOwnedByPlayer ? 'owned-by-player' : ''}`}>
              {isOwnedByPlayer ? '👤 Du' : `👤 ${tile.owner}`}
            </p>
          ) : (
            <p className="owner unclaimed">
              🏳️ Nicht beansprucht
            </p>
          )}
        </div>

        {/* Gebäude */}
        {building && (
          <div className="info-section">
            <h4>Gebäude</h4>
            <div className="building-info">
              <p className="building-type">
                {BUILDING_NAMES[building.type] || building.type}
              </p>
              <p className="building-level">Level: {building.level}</p>
              {building.constructionProgress < 1 && (
                <div className="construction-progress">
                  <p>🔨 Im Bau...</p>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${building.constructionProgress * 100}%` }}
                    />
                  </div>
                  <p className="progress-text">
                    {(building.constructionProgress * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bau-Optionen */}
        {canBuild && (
          <div className="info-section build-section">
            <h4>⚒️ Gebäude bauen</h4>
            <div className="build-options">
              {Object.values(BuildingType).map((buildingType) => {
                const cost = BUILDING_COSTS[buildingType];
                const affordable = canAfford(buildingType);
                
                return (
                  <button
                    key={buildingType}
                    className={`build-btn ${!affordable ? 'disabled' : ''}`}
                    onClick={() => affordable && onBuild(buildingType)}
                    disabled={!affordable}
                  >
                    <span className="building-name">
                      {BUILDING_NAMES[buildingType]}
                    </span>
                    <span className="building-cost">
                      {cost.wood && `${cost.wood}🪵 `}
                      {cost.stone && `${cost.stone}🪨 `}
                      {cost.iron && `${cost.iron}⚔️ `}
                      {cost.gold && `${cost.gold}💰`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Keine Bau-Option Hinweise */}
        {!canBuild && !building && tile && (
          <div className="info-section">
            <h4>Aktionen</h4>
            <p className="info-message">
              {!tile.owner && '💡 Beanspruche dieses Tile, um darauf zu bauen'}
              {tile.owner && !isOwnedByPlayer && '⚠️ Dieses Tile gehört einem anderen Spieler'}
            </p>
          </div>
        )}

        {/* Gebäude upgrade Option */}
        {building && isOwnedByPlayer && building.constructionProgress >= 1 && (
          <div className="info-section">
            <h4>Aktionen</h4>
            <button className="build-btn action-btn">
              ⬆️ Upgrade auf Level {building.level + 1}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
