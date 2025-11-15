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
  river: '〰️ Fluss'
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

        {activeTab === 'buildings' && (
          <BuildingsTab
            buildings={buildings}
            currentPlayer={currentPlayer}
            canBuild={canBuild}
            onBuild={onBuild}
            onRecruitUnit={onRecruitUnit}
            showBuildMenu={showBuildMenu}
            setShowBuildMenu={setShowBuildMenu}
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
