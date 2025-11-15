import { BuildingType, UnitType, ResourceType, RESOURCE_DEFINITIONS } from '@hex-kingdom/shared';
import { BuildingState, PlayerState } from '../../types/room-state';
import { BUILDING_DEFINITIONS, UNIT_DEFINITIONS } from '@hex-kingdom/shared/src/game-data';
import './BuildingDetailPanel.css';

interface BuildingDetailPanelProps {
  building: BuildingState;
  currentPlayer: PlayerState | null;
  onClose: () => void;
  onRecruitUnit?: (unitType: string, buildingId: string) => void;
}

export default function BuildingDetailPanel({
  building,
  currentPlayer,
  onClose,
  onRecruitUnit
}: BuildingDetailPanelProps) {
  const buildingDef = BUILDING_DEFINITIONS[building.type as BuildingType];
  const isConstructing = building.constructionProgress < 1;
  const isOwnedByPlayer = building.owner === currentPlayer?.username;

  // Unit Icons Mapping
  const UNIT_ICONS: Record<UnitType, string> = {
    [UnitType.WARRIOR]: '🗡️',
    [UnitType.ARCHER]: '🏹',
    [UnitType.CAVALRY]: '🐎',
    [UnitType.SCOUT]: '👁️'
  };

  // Berechne Produktions-Bonus basierend auf Level
  const getProductionForLevel = (baseProduction: Record<string, number> | undefined, level: number) => {
    if (!baseProduction) return {};
    const multiplier = Math.pow(buildingDef?.upgradeMultiplier || 1.5, level - 1);
    const result: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(baseProduction)) {
      result[resource] = amount * multiplier;
    }
    return result;
  };

  const currentProduction = getProductionForLevel(buildingDef?.baseProduction, building.level);

  // Prüfe ob Spieler sich eine Einheit leisten kann
  const canAffordUnit = (unitType: UnitType): boolean => {
    if (!currentPlayer) return false;
    const unitDef = UNIT_DEFINITIONS[unitType];
    if (!unitDef || !unitDef.cost) return false;
    const cost = unitDef.cost;
    return (
      (cost.wood ?? 0) <= (currentPlayer.wood ?? 0) &&
      (cost.stone ?? 0) <= (currentPlayer.stone ?? 0) &&
      (cost.iron ?? 0) <= (currentPlayer.iron ?? 0) &&
      (cost.gold ?? 0) <= (currentPlayer.gold ?? 0) &&
      (cost.food ?? 0) <= (currentPlayer.food ?? 0)
    );
  };

  return (
    <div className="building-detail-panel">
      <button className="building-detail-close" onClick={onClose}>✕</button>
      
      <div className="panel-header">
        <h3>
          <span className="building-icon">{buildingDef?.icon}</span>
          {buildingDef?.name || building.type}
        </h3>
      </div>

      <div className="panel-content">
        {/* Gebäude-Infos */}
        <div className="info-section">
          <h4>📋 Informationen</h4>
          <div className="building-detail-info">
            <p><strong>Besitzer:</strong> <span className={isOwnedByPlayer ? 'owned-by-player' : ''}>{building.owner}</span></p>
            <p><strong>Level:</strong> {building.level} / {buildingDef?.maxLevel}</p>
            <p><strong>Position:</strong> ({building.q}, {building.r})</p>
            {buildingDef?.description && (
              <p className="building-description">{buildingDef.description}</p>
            )}
          </div>
        </div>

        {/* Baustatus */}
        {isConstructing && (
          <div className="info-section">
            <h4>🔨 Baustatus</h4>
            <div className="construction-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${building.constructionProgress * 100}%` }}
                />
              </div>
              <p className="progress-text">{(building.constructionProgress * 100).toFixed(0)}% abgeschlossen</p>
            </div>
          </div>
        )}

        {/* Produktion */}
        {!isConstructing && buildingDef?.baseProduction && Object.keys(currentProduction).length > 0 && (
          <div className="info-section">
            <h4>📊 Produktion (pro Sekunde)</h4>
            <div className="production-list">
              {Object.entries(currentProduction).map(([resource, amount]) => {
                const resourceDef = RESOURCE_DEFINITIONS[resource as ResourceType];
                return (
                  <div key={resource} className="production-item">
                    <span className="production-icon">{resourceDef?.icon || '📦'}</span>
                    <span className="production-name">{resourceDef?.name || resource}</span>
                    <span className="production-value">+{amount.toFixed(2)}/s</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kaserne - Einheiten rekrutieren */}
        {!isConstructing && building.type === BuildingType.BARRACKS && isOwnedByPlayer && onRecruitUnit && (
          <div className="info-section">
            <h4>⚔️ Einheiten rekrutieren</h4>
            <div className="recruit-menu">
              {Object.values(UnitType).map((unitType) => {
                const unitDef = UNIT_DEFINITIONS[unitType];
                const cost = unitDef?.cost;
                const affordable = canAffordUnit(unitType);

                return (
                  <button
                    key={unitType}
                    className="recruit-button"
                    onClick={() => {
                      if (affordable) {
                        onRecruitUnit(unitType, building.id);
                      }
                    }}
                    disabled={!affordable}
                  >
                    <div className="recruit-button-content">
                      <span className="recruit-button-icon">{UNIT_ICONS[unitType]}</span>
                      <span className="recruit-button-name">{unitDef?.name || unitType}</span>
                      <span className="recruit-button-cost">
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
        )}

        {/* Lagerhaus - Kapazität */}
        {!isConstructing && building.type === BuildingType.WAREHOUSE && (
          <div className="info-section">
            <h4>📦 Lagerkapazität</h4>
            <p>Erhöht die Speicherkapazität für alle Ressourcen</p>
          </div>
        )}

        {/* Wohnhaus - Bevölkerung */}
        {!isConstructing && building.type === BuildingType.RESIDENCE && buildingDef?.housingCapacity && (
          <div className="info-section">
            <h4>👥 Wohnkapazität</h4>
            <p><strong>Kapazität:</strong> {buildingDef.housingCapacity * building.level} Einwohner</p>
          </div>
        )}
      </div>
    </div>
  );
}
