import { HexCoord, BuildingType } from '@hex-kingdom/shared';
import { HexTileState, BuildingState, PlayerState } from '../types/room-state';
import { useState } from 'react';
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
        <button className="tile-panel-close" onClick={onClose}>✕</button>
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

  const isOwnedByPlayer = tile?.owner === currentPlayer?.username; // Verwende username statt id
  const canBuild = isOwnedByPlayer && !building;
  
  const [showBuildMenu, setShowBuildMenu] = useState(false);

  return (
    <div className="tile-info-panel">
      <button className="tile-panel-close" onClick={onClose}>✕</button>
      <div className="panel-header">
        <h3>{titleText}</h3>
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
          <div className="info-section buildings-section">
            <h4>🏰 Gebäude auf diesem Feld</h4>
            <div className="building-card">
              <div className="building-header">
                <span className="building-type">
                  {BUILDING_NAMES[building.type] || building.type}
                </span>
                <span className="building-level-badge">Lv. {building.level}</span>
              </div>
              <div className="building-owner">
                <span className="owner-label">Besitzer:</span>
                <span className={`owner-name ${building.owner === currentPlayer?.username ? 'is-player' : ''}`}>
                  {building.owner === currentPlayer?.username ? '👤 Du' : `👤 ${building.owner}`}
                </span>
              </div>
              {building.constructionProgress < 1 ? (
                <div className="construction-progress">
                  <p className="progress-label">🔨 Baufortschritt</p>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${building.constructionProgress * 100}%` }}
                    />
                  </div>
                  <p className="progress-text">
                    {(building.constructionProgress * 100).toFixed(0)}% abgeschlossen
                  </p>
                </div>
              ) : (
                <div className="building-status-complete">
                  <p>✅ Gebäude fertiggestellt</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bau-Optionen */}
        {canBuild && (
          <div className="info-section">
            <h4>Aktionen</h4>
            <button 
              className="action-button build-action"
              onClick={() => setShowBuildMenu(!showBuildMenu)}
            >
              <span className="action-icon">🏗️</span>
              <span className="action-label">Bauen</span>
            </button>
          </div>
        )}
        
        {/* Build Menu Popup */}
        {showBuildMenu && canBuild && (
          <>
            <div className="build-menu-overlay" onClick={() => setShowBuildMenu(false)} />
            <div className="build-menu-popup">
              <div className="build-menu-header">
                <h4>⚒️ Gebäude bauen</h4>
                <button className="popup-close" onClick={() => setShowBuildMenu(false)}>✕</button>
              </div>
              <div className="build-menu-content">
                {Object.values(BuildingType).map((buildingType) => {
                  const cost = BUILDING_COSTS[buildingType];
                  const affordable = canAfford(buildingType);
                  
                  return (
                    <button
                      key={buildingType}
                      className="build-button"
                      onClick={() => {
                        if (affordable) {
                          onBuild(buildingType);
                          setShowBuildMenu(false);
                        }
                      }}
                      disabled={!affordable}
                    >
                      <div className="build-button-content">
                        <span className="build-button-name">
                          {BUILDING_NAMES[buildingType]}
                        </span>
                        <span className="build-button-cost">
                          {cost.wood && <span className={`cost-item ${currentPlayer && cost.wood > currentPlayer.wood ? 'insufficient' : ''}`}>🪵 {cost.wood}</span>}
                          {cost.stone && <span className={`cost-item ${currentPlayer && cost.stone > currentPlayer.stone ? 'insufficient' : ''}`}>🪨 {cost.stone}</span>}
                          {cost.iron && <span className={`cost-item ${currentPlayer && cost.iron > currentPlayer.iron ? 'insufficient' : ''}`}>⚔️ {cost.iron}</span>}
                          {cost.gold && <span className={`cost-item ${currentPlayer && cost.gold > currentPlayer.gold ? 'insufficient' : ''}`}>💰 {cost.gold}</span>}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
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
            <button className="action-button upgrade-action">
              <span className="action-icon">⬆️</span>
              <span className="action-label">Upgrade auf Level {building.level + 1}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
