import { BuildingType, UnitType } from '@hex-kingdom/shared';
import { BuildingState, PlayerState } from '../../types/room-state';
import { UNIT_DEFINITIONS } from '@hex-kingdom/shared/src/game-data';

interface BuildingsTabProps {
  buildings: BuildingState[];
  currentPlayer: PlayerState | null;
  canBuild: boolean;
  onBuild: (buildingType: BuildingType) => void;
  onRecruitUnit?: (unitType: string, buildingId: string) => void;
  showBuildMenu: boolean;
  setShowBuildMenu: (show: boolean) => void;
}

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

export default function BuildingsTab({
  buildings,
  currentPlayer,
  canBuild,
  onBuild,
  onRecruitUnit,
  showBuildMenu,
  setShowBuildMenu
}: BuildingsTabProps) {

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

  return (
    <>
      {/* Gebäude-Liste */}
      {buildings.length > 0 ? (
        buildings.map((building, index) => {
          const isOwnedByPlayer = building.owner === currentPlayer?.username;
          
          return (
            <div key={building.id} className="info-section buildings-section">
              <h4>🏰 Gebäude {buildings.length > 1 ? `#${index + 1}` : ''}</h4>
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
                
                {/* Unit Recruitment - Show if building is a completed barracks owned by player */}
                {building.type === BuildingType.BARRACKS && 
                 building.constructionProgress >= 1 && 
                 building.owner === currentPlayer?.username && (
                  <div className="recruit-section">
                    <h5>⚔️ Einheiten rekrutieren</h5>
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

                {/* Gebäude upgrade Option */}
                {isOwnedByPlayer && building.constructionProgress >= 1 && (
                  <div className="building-actions">
                    <button className="action-button upgrade-action">
                      <span className="action-icon">⬆️</span>
                      <span className="action-label">Upgrade auf Level {building.level + 1}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="info-section">
          <p className="info-message">Keine Gebäude auf diesem Feld</p>
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
    </>
  );
}
