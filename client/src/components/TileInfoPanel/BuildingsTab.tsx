import { BuildingType, UnitType, ResourceType, RESOURCE_DEFINITIONS } from '@hex-kingdom/shared';
import { BuildingState, PlayerState } from '../../types/room-state';
import { UNIT_DEFINITIONS, BUILDING_DEFINITIONS } from '@hex-kingdom/shared/src/game-data';
import { useState } from 'react';
import BuildingDetailPanel from './BuildingDetailPanel';

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
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingState | null>(null);

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
      {/* Gebäude-Liste - Kompakte Darstellung */}
      {buildings.length > 0 ? (
        <div className="info-section buildings-section">
          <h4>🏰 Gebäude ({buildings.length})</h4>
          <div className="buildings-compact-list">
            {buildings.map((building) => {
              const buildingDef = BUILDING_DEFINITIONS[building.type as BuildingType];
              const isConstructing = building.constructionProgress < 1;
              
              return (
                <div 
                  key={building.id} 
                  className="building-compact-item"
                  onClick={() => setSelectedBuilding(building)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="building-compact-icon">{buildingDef?.icon}</span>
                  <span className="building-compact-name">{buildingDef?.name || building.type}</span>
                  <span className="building-compact-level">Lv. {building.level}</span>
                  {isConstructing && (
                    <span className="building-compact-progress">🔨 {(building.constructionProgress * 100).toFixed(0)}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
                        {cost?.wood && <span className={`cost-item ${currentPlayer && cost.wood > (currentPlayer.wood ?? 0) ? 'insufficient' : ''}`}>{RESOURCE_DEFINITIONS[ResourceType.WOOD].icon} {cost.wood}</span>}
                        {cost?.stone && <span className={`cost-item ${currentPlayer && cost.stone > (currentPlayer.stone ?? 0) ? 'insufficient' : ''}`}>{RESOURCE_DEFINITIONS[ResourceType.STONE].icon} {cost.stone}</span>}
                        {cost?.iron && <span className={`cost-item ${currentPlayer && cost.iron > (currentPlayer.iron ?? 0) ? 'insufficient' : ''}`}>{RESOURCE_DEFINITIONS[ResourceType.IRON].icon} {cost.iron}</span>}
                        {cost?.gold && <span className={`cost-item ${currentPlayer && cost.gold > (currentPlayer.gold ?? 0) ? 'insufficient' : ''}`}>{RESOURCE_DEFINITIONS[ResourceType.GOLD].icon} {cost.gold}</span>}
                        {cost?.food && <span className={`cost-item ${currentPlayer && cost.food > (currentPlayer.food ?? 0) ? 'insufficient' : ''}`}>{RESOURCE_DEFINITIONS[ResourceType.FOOD].icon} {cost.food}</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Building Detail Panel */}
      {selectedBuilding && (
        <BuildingDetailPanel
          building={selectedBuilding}
          currentPlayer={currentPlayer}
          onClose={() => setSelectedBuilding(null)}
          onRecruitUnit={onRecruitUnit}
        />
      )}
    </>
  );
}
