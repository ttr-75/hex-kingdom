import { HexCoord, BuildingType } from '@hex-kingdom/shared';
import { HexTileState, BuildingState, PlayerState, UnitState } from '../../types/room-state';
import { useState } from 'react';
import './TileInfoPanel.css';
import TileInfoTab from './TileInfoTab';
import BuildingsTab from './BuildingsTab';
import UnitsTab from './UnitsTab';

interface TileInfoPanelProps {
  selectedHex: HexCoord | null;
  tile: HexTileState | undefined;
  buildings: BuildingState[];
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
  river: '〰️ Fluss',
  settlement: '🏘️ Siedlung'
};

export default function TileInfoPanel({
  selectedHex,
  tile,
  buildings,
  units,
  currentPlayer,
  onBuild,
  onRecruitUnit,
  onMoveUnit,
  onCancelMovement,
  onClose
}: TileInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'buildings' | 'units'>('info');
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  
  if (!selectedHex) {
    // Zähle eigene Tiles
    const ownedTilesCount = Array.from(units.values()).filter(
      unit => unit.owner === currentPlayer?.username
    ).length;

    // Zähle eigene Gebäude
    const ownedBuildings = buildings.filter(
      building => building.owner === currentPlayer?.username
    );
    const buildingsCount = ownedBuildings.length;

    // Zähle Gebäude nach Typ
    const buildingsByType: Record<string, number> = {};
    ownedBuildings.forEach(building => {
      buildingsByType[building.type] = (buildingsByType[building.type] || 0) + 1;
    });

    // Zähle eigene Einheiten
    const ownedUnits = Array.from(units.values()).filter(
      unit => unit.owner === currentPlayer?.username
    );
    const unitsCount = ownedUnits.length;

    return (
      <div className="tile-info-panel empty">
        <button className="tile-panel-close" onClick={onClose}>✕</button>
        <div className="panel-header">
          <h3>👑 {currentPlayer?.username || 'Dein Königreich'}</h3>
        </div>
        <div className="panel-content">
          {!currentPlayer ? (
            <p className="empty-message">⏳ Lade Königreichsdaten...</p>
          ) : (
            <>
              <div className="info-section">
                <h4>💰 Ressourcen</h4>
                <div className="kingdom-resources">
                  <div className="resource-item">
                    <span className="resource-icon">🪵</span>
                    <span className="resource-name">Holz</span>
                    <span className="resource-value">{Math.round(currentPlayer.wood)} / {Math.round(currentPlayer.storageWood)}</span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-icon">🪨</span>
                    <span className="resource-name">Stein</span>
                    <span className="resource-value">{Math.round(currentPlayer.stone)} / {Math.round(currentPlayer.storageStone)}</span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-icon">⚔️</span>
                    <span className="resource-name">Eisen</span>
                    <span className="resource-value">{Math.round(currentPlayer.iron)} / {Math.round(currentPlayer.storageIron)}</span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-icon">🪙</span>
                    <span className="resource-name">Gold</span>
                    <span className="resource-value">{Math.round(currentPlayer.gold)} / {Math.round(currentPlayer.storageGold)}</span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-icon">🌾</span>
                    <span className="resource-name">Nahrung</span>
                    <span className="resource-value">{Math.round(currentPlayer.food)} / {Math.round(currentPlayer.storageFood)}</span>
                  </div>
                  <div className="resource-item">
                    <span className="resource-icon">🐟</span>
                    <span className="resource-name">Fisch</span>
                    <span className="resource-value">{Math.round(currentPlayer.fish)} / {Math.round(currentPlayer.storageFish)}</span>
                  </div>
                </div>
              </div>

              <div className="info-section">
                <h4>🏰 Gebäude ({buildingsCount})</h4>
                {buildingsCount > 0 ? (
                  <div className="kingdom-stats">
                    {Object.entries(buildingsByType).map(([type, count]) => (
                      <p key={type}>
                        <strong>{type}:</strong> {count}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p>Noch keine Gebäude gebaut.</p>
                )}
              </div>

              <div className="info-section">
                <h4>🗡️ Einheiten ({unitsCount})</h4>
                {unitsCount > 0 ? (
                  <p>Du hast {unitsCount} Einheit{unitsCount !== 1 ? 'en' : ''} unter deinem Kommando.</p>
                ) : (
                  <p>Noch keine Einheiten rekrutiert.</p>
                )}
              </div>

              <div className="info-section">
                <h4>📊 Statistiken</h4>
                <div className="kingdom-stats">
                  <p><strong>Farbe:</strong> <span style={{ color: currentPlayer.color }}>⬤</span> {currentPlayer.color}</p>
                  <p><strong>Spieler ID:</strong> {currentPlayer.id}</p>
                </div>
              </div>

              <p className="kingdom-hint">💡 Klicke auf ein Tile, um Details anzuzeigen</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Title mit Biom-Typ und Koordinaten
  const biomeName = tile ? (BIOME_NAMES[tile.biome] || tile.biome) : 'Unbekannt';
  const titleText = `${biomeName} (${selectedHex.q}/${selectedHex.r})`;

  const isOwnedByPlayer = tile?.owner === currentPlayer?.username;
  const canBuild = isOwnedByPlayer;

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
            className={`tab-button ${activeTab === 'buildings' ? 'active' : ''}`}
            onClick={() => setActiveTab('buildings')}
          >
            🏰 Gebäude
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
          <TileInfoTab
            tile={tile}
            currentPlayer={currentPlayer}
          />
        )}

        {activeTab === 'buildings' && !currentPlayer && (
          <div className="info-section">
            <p className="info-message">⏳ Lade Spielerdaten...</p>
          </div>
        )}

        {activeTab === 'buildings' && currentPlayer && (
          <BuildingsTab
            buildings={buildings}
            currentPlayer={currentPlayer}
            canBuild={canBuild}
            onBuild={onBuild}
            onRecruitUnit={onRecruitUnit}
            showBuildMenu={showBuildMenu}
            setShowBuildMenu={(show) => {
              console.log('📋 TileInfoPanel: setShowBuildMenu called', { show, currentPlayer: !!currentPlayer });
              setShowBuildMenu(show);
            }}
          />
        )}

        {activeTab === 'units' && (
          <UnitsTab
            selectedHex={selectedHex}
            units={units}
            currentPlayer={currentPlayer}
            onMoveUnit={onMoveUnit}
            onCancelMovement={onCancelMovement}
          />
        )}
      </div>
    </div>
  );
}
