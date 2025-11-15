import { HexCoord, BuildingType, UnitType } from '@hex-kingdom/shared';
import { HexTileState, BuildingState, PlayerState, UnitState } from '../types/room-state';
import { useState } from 'react';
import './TileInfoPanel.css';
import { UNIT_DEFINITIONS } from '@hex-kingdom/shared/src/game-data';

interface TileInfoPanelProps {
  selectedHex: HexCoord | null;
  tile: HexTileState | undefined;
  building: BuildingState | undefined;
  units: Map<string, UnitState>;
  currentPlayer: PlayerState | null;
  onBuild: (buildingType: BuildingType) => void;
  onRecruitUnit?: (unitType: string, buildingId: string) => void;
  onMoveUnit?: (unitId: string) => void;
  onCancelMovement?: (unitId: string) => void;
  onClose: () => void;
}

const BIOME_NAMES: Record<string, string> = {
  deciduous_forest: '🌳 Laubwald',
  coniferous_forest: '🌲 Nadelwald',
  grassland: '🌾 Grasland',
  hills: '⛰️ Hügelland',
  mountains: '🏔️ Gebirge',
  swamp: '🌿 Sumpf',
  steppe: '🌾 Steppe',
  desert: '🏜️ Wüste',
  ocean: '🌊 Ozean',
  lake: '🏞️ See',
  river: '〰️ Fluss'
};

const RESOURCE_NAMES: Record<string, string> = {
  wood: '🪵 Holz',
  stone: '🪨 Stein',
  iron: '⚔️ Eisen',
  gold: '💰 Gold',
  food: '🌾 Nahrung',
  fish: '🐟 Fisch'
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
  units,
  currentPlayer,
  onBuild,
  onRecruitUnit,
  onMoveUnit,
  onCancelMovement,
  onClose
}: TileInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'units'>('info');
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  
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

  // Title mit Biom-Typ und Koordinaten
  const biomeName = tile ? (BIOME_NAMES[tile.biome] || tile.biome) : 'Unbekannt';
  const titleText = `${biomeName} (${selectedHex.q}/${selectedHex.r})`;

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

  const isOwnedByPlayer = tile?.owner === currentPlayer?.username;
  const canBuild = isOwnedByPlayer && !building;

  return (
    <div className="tile-info-panel">
      <button className="tile-panel-close" onClick={onClose}>✕</button>
      <div className="panel-header">
        <h3>{titleText}</h3>
        <div className="panel-tabs">
          <button 
            className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            📋 Info
          </button>
          <button 
            className={`tab-button ${activeTab === 'units' ? 'active' : ''}`}
            onClick={() => setActiveTab('units')}
          >
            🗡️ Einheiten
          </button>
        </div>
      </div>

      <div className="panel-content">
        {activeTab === 'info' && (
          <>
        {/* Wenn kein Tile geladen */}
        {!tile && (
          <div className="info-section">
            <p className="info-message">
              ⏳ Tile-Daten werden geladen...
            </p>
          </div>
        )}

        {/* Ressourcen */}
        {tile && tile.resources && tile.resources.length > 0 && (
          <div className="info-section">
            <h4>Ressourcen</h4>
            <div className="resources-list">
              {tile.resources.map((resource, idx) => (
                <p key={idx} className="resource">
                  {RESOURCE_NAMES[resource.type] || resource.type}
                  {resource.amount > 0 && ` (${resource.amount.toFixed(0)} verfügbar)`}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Keine Ressourcen */}
        {tile && (!tile.resources || tile.resources.length === 0) && (
          <div className="info-section">
            <h4>Ressourcen</h4>
            <p className="resource">
              Keine natürlichen Ressourcen
            </p>
          </div>
        )}

        {/* Fruchtbarkeit */}
        {tile && tile.fertility !== undefined && (
          <div className="info-section">
            <h4>Fruchtbarkeit</h4>
            <div className="fertility-bar">
              <div 
                className="fertility-fill" 
                style={{ 
                  width: `${tile.fertility * 100}%`,
                  backgroundColor: tile.fertility > 0.7 ? '#4caf50' : tile.fertility > 0.4 ? '#ff9800' : '#f44336'
                }}
              />
            </div>
            <p className="fertility-text">
              {(tile.fertility * 100).toFixed(0)}% 
              {tile.fertility > 0.7 ? ' (Sehr fruchtbar)' : tile.fertility > 0.4 ? ' (Mäßig fruchtbar)' : ' (Unfruchtbar)'}
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

        {/* Unit Recruitment - Show if building is a completed barracks owned by player */}
        {building && 
         building.type === BuildingType.BARRACKS && 
         building.constructionProgress >= 1 && 
         building.owner === currentPlayer?.username && (
          <div className="info-section">
            <h4>⚔️ Einheiten rekrutieren</h4>
            <div className="recruit-menu">
              <button
                className="recruit-button"
                onClick={() => onRecruitUnit?.(UnitType.SCOUT, building.id)}
                disabled={!currentPlayer || 
                  (UNIT_DEFINITIONS[UnitType.SCOUT].cost.wood ?? 0) > currentPlayer.wood ||
                  (UNIT_DEFINITIONS[UnitType.SCOUT].cost.food ?? 0) > currentPlayer.food ||
                  (UNIT_DEFINITIONS[UnitType.SCOUT].cost.gold ?? 0) > currentPlayer.gold}
              >
                <div className="recruit-button-content">
                  <span className="recruit-button-icon">👁</span>
                  <span className="recruit-button-name">
                    {UNIT_DEFINITIONS[UnitType.SCOUT].name}
                  </span>
                  <span className="recruit-button-cost">
                    {UNIT_DEFINITIONS[UnitType.SCOUT].cost.wood && (
                      <span className={`cost-item ${currentPlayer && UNIT_DEFINITIONS[UnitType.SCOUT].cost.wood > currentPlayer.wood ? 'insufficient' : ''}`}>
                        🪵 {UNIT_DEFINITIONS[UnitType.SCOUT].cost.wood}
                      </span>
                    )}
                    {UNIT_DEFINITIONS[UnitType.SCOUT].cost.food && (
                      <span className={`cost-item ${currentPlayer && UNIT_DEFINITIONS[UnitType.SCOUT].cost.food > currentPlayer.food ? 'insufficient' : ''}`}>
                        🌾 {UNIT_DEFINITIONS[UnitType.SCOUT].cost.food}
                      </span>
                    )}
                    {UNIT_DEFINITIONS[UnitType.SCOUT].cost.gold && (
                      <span className={`cost-item ${currentPlayer && UNIT_DEFINITIONS[UnitType.SCOUT].cost.gold > currentPlayer.gold ? 'insufficient' : ''}`}>
                        💰 {UNIT_DEFINITIONS[UnitType.SCOUT].cost.gold}
                      </span>
                    )}
                  </span>
                </div>
              </button>
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
        </>
        )}

        {activeTab === 'units' && (
          <>
            <div className="info-section">
              <h4>Einheiten auf diesem Feld</h4>
              {(() => {
                const tileUnits = Array.from(units.values()).filter(
                  unit => unit.q === selectedHex.q && unit.r === selectedHex.r
                );
                
                if (tileUnits.length === 0) {
                  return <p className="info-message">Keine Einheiten auf diesem Feld</p>;
                }
                
                return (
                  <div className="units-list">
                    {tileUnits.map(unit => (
                      <div key={unit.id} className="unit-card">
                        <div className="unit-header">
                          <span className="unit-icon">
                            {unit.type === 'SCOUT' ? '👁' : '🗡️'}
                          </span>
                          <span className="unit-name">
                            {UNIT_DEFINITIONS[unit.type as UnitType]?.name || unit.type}
                          </span>
                          <span className={`unit-owner ${unit.owner === currentPlayer?.username ? 'is-player' : ''}`}>
                            {unit.owner === currentPlayer?.username ? '(Deine)' : `(${unit.owner})`}
                          </span>
                        </div>
                        {unit.isMoving && (
                          <div className="unit-status-badge moving">
                            <span className="status-icon">🚶</span>
                            <span className="status-text">In Bewegung</span>
                          </div>
                        )}
                        <div className="unit-stats">
                          <div className="unit-stat">
                            <span className="stat-label">❤️ Leben:</span>
                            <div className="health-bar">
                              <div 
                                className="health-fill" 
                                style={{ width: `${unit.health}%` }}
                              />
                            </div>
                            <span className="stat-value">{unit.health}/100</span>
                          </div>
                        </div>
                        {unit.owner === currentPlayer?.username && (
                          <div className="unit-actions">
                            {unit.isMoving ? (
                              <button 
                                className="action-button cancel-action"
                                onClick={() => onCancelMovement?.(unit.id)}
                              >
                                <span className="action-icon">⏹️</span>
                                <span className="action-label">Bewegung abbrechen</span>
                              </button>
                            ) : (
                              <button 
                                className="action-button move-action"
                                onClick={() => onMoveUnit?.(unit.id)}
                              >
                                <span className="action-icon">🚶</span>
                                <span className="action-label">Bewegen</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
