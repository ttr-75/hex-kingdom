import { HexTileState, PlayerState } from '../../types/room-state';

interface TileInfoTabProps {
  tile: HexTileState | undefined;
  currentPlayer: PlayerState | null;
}

const RESOURCE_NAMES: Record<string, string> = {
  wood: '🪵 Holz',
  stone: '🪨 Stein',
  iron: '⚔️ Eisen',
  gold: '💰 Gold',
  food: '🌾 Nahrung',
  fish: '🐟 Fisch'
};

export default function TileInfoTab({ tile, currentPlayer }: TileInfoTabProps) {
  const isOwnedByPlayer = tile?.owner === currentPlayer?.username;

  return (
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

      {/* Keine Bau-Option Hinweise */}
      {tile && !tile.owner && (
        <div className="info-section">
          <h4>Aktionen</h4>
          <p className="info-message">
            💡 Beanspruche dieses Tile, um darauf zu bauen
          </p>
        </div>
      )}
      {tile && tile.owner && !isOwnedByPlayer && (
        <div className="info-section">
          <h4>Aktionen</h4>
          <p className="info-message">
            ⚠️ Dieses Tile gehört einem anderen Spieler
          </p>
        </div>
      )}
    </>
  );
}
