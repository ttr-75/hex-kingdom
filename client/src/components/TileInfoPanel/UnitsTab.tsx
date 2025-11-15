import { HexCoord, UnitType } from '@hex-kingdom/shared';
import { UnitState, PlayerState } from '../../types/room-state';
import { UNIT_DEFINITIONS } from '@hex-kingdom/shared/src/game-data';

interface UnitsTabProps {
  selectedHex: HexCoord;
  units: Map<string, UnitState>;
  currentPlayer: PlayerState | null;
  onMoveUnit?: (unitId: string) => void;
  onCancelMovement?: (unitId: string) => void;
}

export default function UnitsTab({
  selectedHex,
  units,
  currentPlayer,
  onMoveUnit,
  onCancelMovement
}: UnitsTabProps) {
  const tileUnits = Array.from(units.values()).filter(
    unit => unit.q === selectedHex.q && unit.r === selectedHex.r
  );

  if (tileUnits.length === 0) {
    return (
      <div className="info-section">
        <h4>Einheiten auf diesem Feld</h4>
        <p className="info-message">Keine Einheiten auf diesem Feld</p>
      </div>
    );
  }

  return (
    <div className="info-section">
      <h4>Einheiten auf diesem Feld</h4>
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
    </div>
  );
}
