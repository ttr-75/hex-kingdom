import { BuildingType, UnitType } from '@hex-kingdom/shared';
import { BuildingState, PlayerState } from '../../types/room-state';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from '@hex-kingdom/shared/src/game-data';

interface BuildingsTabProps {
  buildings: BuildingState[];
  currentPlayer: PlayerState | null;
  canBuild: boolean;
  onBuild: (buildingType: BuildingType) => void;
  onRecruitUnit?: (unitType: string, buildingId: string) => void;
  showBuildMenu: boolean;
  setShowBuildMenu: (show: boolean) => void;
}

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
    if (!currentPlayer) {
      console.warn('⚠️ canAfford: currentPlayer is null/undefined');
      return false;
    }
    const buildingDef = BUILDING_DEFINITIONS[buildingType];
    if (!buildingDef || !buildingDef.baseCost) {
      console.warn(`⚠️ canAfford: No definition or cost for building type: ${buildingType}`);
      return false;
    }
    const cost = buildingDef.baseCost;
    return (
      (cost.wood ?? 0) <= (currentPlayer.wood ?? 0) &&
      (cost.stone ?? 0) <= (currentPlayer.stone ?? 0) &&
      (cost.iron ?? 0) <= (currentPlayer.iron ?? 0) &&
      (cost.gold ?? 0) <= (currentPlayer.gold ?? 0) &&
      (cost.food ?? 0) <= (currentPlayer.food ?? 0)
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
                    {BUILDING_DEFINITIONS[building.type as BuildingType]?.icon} {BUILDING_DEFINITIONS[building.type as BuildingType]?.name || building.type}
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
            onClick={() => {
              if (!currentPlayer) {
                console.error('❌ Cannot open build menu: currentPlayer is null');
                return;
              }
              console.log('🏗️ Opening build menu, currentPlayer:', currentPlayer);
              setShowBuildMenu(!showBuildMenu);
            }}
          >
            <span className="action-icon">🏗️</span>
            <span className="action-label">Bauen</span>
          </button>
        </div>
      )}

      {/* Build Menu Popup */}
      {showBuildMenu && canBuild && currentPlayer && (
        <>
          <div className="build-menu-overlay" onClick={() => setShowBuildMenu(false)} />
          <div className="build-menu-popup">
            <div className="build-menu-header">
              <h4>⚒️ Gebäude bauen</h4>
              <button className="popup-close" onClick={() => setShowBuildMenu(false)}>✕</button>
            </div>
            <div className="build-menu-content">
              {Object.values(BuildingType).map((buildingType) => {
                const buildingDef = BUILDING_DEFINITIONS[buildingType];
                const cost = buildingDef?.baseCost;
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
                        {buildingDef?.icon} {buildingDef?.name || buildingType}
                      </span>
                      <span className="build-button-cost">
                        {cost?.wood && <span className={`cost-item ${currentPlayer && cost.wood > (currentPlayer.wood ?? 0) ? 'insufficient' : ''}`}>🪵 {cost.wood}</span>}
                        {cost?.stone && <span className={`cost-item ${currentPlayer && cost.stone > (currentPlayer.stone ?? 0) ? 'insufficient' : ''}`}>🪨 {cost.stone}</span>}
                        {cost?.iron && <span className={`cost-item ${currentPlayer && cost.iron > (currentPlayer.iron ?? 0) ? 'insufficient' : ''}`}>⚔️ {cost.iron}</span>}
                        {cost?.gold && <span className={`cost-item ${currentPlayer && cost.gold > (currentPlayer.gold ?? 0) ? 'insufficient' : ''}`}>💰 {cost.gold}</span>}
                        {cost?.food && <span className={`cost-item ${currentPlayer && cost.food > (currentPlayer.food ?? 0) ? 'insufficient' : ''}`}>🌾 {cost.food}</span>}
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
