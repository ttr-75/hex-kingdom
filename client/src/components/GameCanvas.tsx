import { useEffect, useRef, useState } from 'react';
import { HexRenderer } from '../renderer/HexRenderer';
import { useGameStore } from '../store/gameStore';
import { HexCoord, BuildingType } from '@hex-kingdom/shared';
import './GameCanvas.css';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HexRenderer | null>(null);
  const lastTileCountRef = useRef<number>(0);
  
  const { room, tiles, buildings, players, sessionId } = useGameStore();
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [showBuildMenu, setShowBuildMenu] = useState(false);
  
  const currentPlayer = sessionId ? players.get(sessionId) : null;
  
  // Initialize renderer
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new HexRenderer(canvasRef.current);
      
      rendererRef.current.setOnTileClick((coord) => {
        console.log('Clicked hex:', coord);
        setSelectedHex(coord);
        setShowBuildMenu(true);
      });
      
      // Viewport-based chunk loading
      rendererRef.current.setOnViewportChange((visibleChunks) => {
        if (room) {
          room.send('requestChunks', { chunkCoords: visibleChunks });
        }
      });
    }
    
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [room]);
  
  // Update map when tiles change - nur wenn sich die Anzahl ändert
  useEffect(() => {
    if (rendererRef.current && tiles.size > 0 && tiles.size !== lastTileCountRef.current) {
      rendererRef.current.updateMap(tiles);
      lastTileCountRef.current = tiles.size;
    }
  }, [tiles]);
  
  // Update buildings when they change
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateBuildings(buildings);
    }
  }, [buildings]);
  
  const handleBuild = (buildingType: BuildingType) => {
    if (!selectedHex || !room) return;
    
    room.send('build', {
      position: selectedHex,
      buildingType
    });
    
    setShowBuildMenu(false);
  };
  
  return (
    <div className="game-canvas-container">
      <canvas ref={canvasRef} />
      
      {/* Resource HUD */}
      {currentPlayer && (
        <div className="resource-hud">
          <div className="resource-item">
            🪵 Holz: {Math.floor(currentPlayer.wood)} / {currentPlayer.storageWood}
          </div>
          <div className="resource-item">
            🪨 Stein: {Math.floor(currentPlayer.stone)} / {currentPlayer.storageStone}
          </div>
          <div className="resource-item">
            ⚔️ Eisen: {Math.floor(currentPlayer.iron)} / {currentPlayer.storageIron}
          </div>
          <div className="resource-item">
            💰 Gold: {Math.floor(currentPlayer.gold)} / {currentPlayer.storageGold}
          </div>
          <div className="resource-item">
            🌾 Nahrung: {Math.floor(currentPlayer.food)} / {currentPlayer.storageFood}
          </div>
        </div>
      )}
      
      {/* Build Menu */}
      {showBuildMenu && selectedHex && (
        <div className="build-menu">
          <h3>Gebäude bauen</h3>
          <p>Position: ({selectedHex.q}, {selectedHex.r})</p>
          
          <div className="build-options">
            <button onClick={() => handleBuild(BuildingType.LUMBERMILL)}>
              🪵 Sägewerk (30🪵 25🪨)
            </button>
            <button onClick={() => handleBuild(BuildingType.MINE)}>
              ⛏️ Bergwerk (50🪵 30🪨)
            </button>
            <button onClick={() => handleBuild(BuildingType.FARM)}>
              🌾 Farm (40🪵 20🪨)
            </button>
            <button onClick={() => handleBuild(BuildingType.WAREHOUSE)}>
              📦 Lagerhaus (60🪵 40🪨)
            </button>
            <button onClick={() => handleBuild(BuildingType.MARKETPLACE)}>
              🏪 Marktplatz (80🪵 60🪨 50💰)
            </button>
            <button onClick={() => handleBuild(BuildingType.BARRACKS)}>
              ⚔️ Kaserne (100🪵 80🪨 40⚔️)
            </button>
            <button onClick={() => handleBuild(BuildingType.RESEARCH_LAB)}>
              🔬 Forschungslabor (120🪵 100🪨 80💰)
            </button>
          </div>
          
          <button onClick={() => setShowBuildMenu(false)} className="close-btn">
            Schließen
          </button>
        </div>
      )}
    </div>
  );
}
