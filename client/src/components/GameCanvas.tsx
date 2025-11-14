import { useEffect, useRef, useState } from 'react';
import { HexRenderer } from '../renderer/HexRenderer';
import { useGameStore } from '../store/gameStore';
import { HexCoord, BuildingType } from '@hex-kingdom/shared';
import TileInfoPanel from './TileInfoPanel';
import './GameCanvas.css';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HexRenderer | null>(null);
  const lastTileCountRef = useRef<number>(0);
  const spawnPositionRef = useRef<{ q: number; r: number } | null>(null);
  const hasInitiallyFocusedRef = useRef<boolean>(false);
  
  const { room, tiles, buildings, players, sessionId } = useGameStore();
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [missingChunks, setMissingChunks] = useState<Array<{ chunkX: number; chunkY: number }>>([]);
  
  const currentPlayer = sessionId ? players.get(sessionId) : null;
  
  // Initialize renderer
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new HexRenderer(canvasRef.current);
      
      rendererRef.current.setOnTileClick((coord) => {
        console.log('Clicked hex:', coord);
        setSelectedHex(coord);
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
  
  // Listen for missing chunks from server
  useEffect(() => {
    if (!room) return;
    
    const handleMissingChunks = (message: { chunks: Array<{ chunkX: number; chunkY: number }> }) => {
      console.warn('🐉 Missing chunks detected:', message.chunks);
      setMissingChunks(message.chunks);
      
      // Update renderer to show dragons
      if (rendererRef.current) {
        rendererRef.current.setMissingChunks(message.chunks);
      }
    };
    
    const handleSetSpawnPosition = (message: { q: number; r: number }) => {
      console.log('📍 Spawn position received:', message);
      spawnPositionRef.current = message;
      
      console.log('🎥 Renderer exists:', !!rendererRef.current, 'Tiles count:', tiles.size);
      
      // Versuche sofort zu fokussieren (falls Tiles schon da sind)
      if (rendererRef.current && tiles.size > 0) {
        rendererRef.current.focusOn({ q: message.q, r: message.r });
        hasInitiallyFocusedRef.current = true;
        console.log('✅ Camera focused on spawn position immediately');
      } else {
        console.log('⏳ Waiting for tiles to load before focusing...');
      }
    };
    
    const handleVisibleTiles = (message: { tiles: Array<any> }) => {
      console.log('📥 Received visible tiles from server:', message.tiles.length);
      
      // Konvertiere zu Map für Renderer und Store
      const tilesMap = new Map();
      message.tiles.forEach((tileData: any) => {
        tilesMap.set(tileData.key, {
          q: tileData.q,
          r: tileData.r,
          terrain: tileData.terrain,
          owner: tileData.owner,
          resourceType: tileData.resourceType,
          resourceAmount: tileData.resourceAmount
        });
      });
      
      // Update Store mit den empfangenen Tiles
      const currentTiles = useGameStore.getState().tiles;
      const updatedTiles = new Map(currentTiles);
      tilesMap.forEach((tile, key) => updatedTiles.set(key, tile));
      useGameStore.getState().updateTiles(updatedTiles);
      
      // Update renderer direkt
      if (rendererRef.current) {
        rendererRef.current.updateMap(tilesMap);
        lastTileCountRef.current = tilesMap.size;
        
        // Fokussiere auf Spawn wenn noch nicht geschehen
        if (!hasInitiallyFocusedRef.current && spawnPositionRef.current) {
          console.log('🎯 Focusing on spawn after receiving tiles');
          rendererRef.current.focusOn(spawnPositionRef.current);
          hasInitiallyFocusedRef.current = true;
        }
      }
    };
    
    room.onMessage('missingChunks', handleMissingChunks);
    room.onMessage('setSpawnPosition', handleSetSpawnPosition);
    room.onMessage('visibleTiles', handleVisibleTiles);
    
    return () => {
      room.removeAllListeners();
    };
  }, [room, tiles]);
  
  // Update map when tiles change
  useEffect(() => {
    const tileCount = tiles.size;
    console.log(`🗺️ Tiles im Store: ${tileCount}`, tiles.size > 0 ? `First tile: ${Array.from(tiles.keys())[0]}` : 'No tiles');
    
    if (rendererRef.current && tileCount > 0) {
      // Throttle: Nur aktualisieren wenn sich signifikant etwas geändert hat
      const diff = Math.abs(tileCount - lastTileCountRef.current);
      if (diff > 0) {
        console.log(`👁️ Rendering ${tileCount} tiles (server-side fog-of-war active)`);
        
        rendererRef.current.updateMap(tiles);
        lastTileCountRef.current = tileCount;
        
        // Wenn Tiles jetzt geladen sind und wir noch nicht fokussiert haben: Fokussiere auf Spawn
        if (!hasInitiallyFocusedRef.current && spawnPositionRef.current) {
          console.log('🎯 Initial tiles loaded, focusing on spawn:', spawnPositionRef.current);
          rendererRef.current.focusOn(spawnPositionRef.current);
          hasInitiallyFocusedRef.current = true;
        }
      }
    }
  }, [tiles, sessionId, currentPlayer]);
  
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
  };
  
  const handleCloseInfoPanel = () => {
    setSelectedHex(null);
  };
  
  // Get selected tile and building data
  const selectedTile = selectedHex ? tiles.get(`${selectedHex.q},${selectedHex.r}`) : undefined;
  const selectedBuilding = selectedHex ? buildings.get(`${selectedHex.q},${selectedHex.r}`) : undefined;
  
  return (
    <div className="game-canvas-container">
      <div className="game-canvas-wrapper">
        <canvas ref={canvasRef} />
        
        {/* Missing Chunks Warning */}
        {missingChunks.length > 0 && (
          <div className="warning-banner">
            🐉 {missingChunks.length} Chunk(s) nicht in Datenbank gefunden - "Here be dragons!"
          </div>
        )}
        
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
      </div>
      
      {/* Tile Info Panel */}
      <TileInfoPanel
        selectedHex={selectedHex}
        tile={selectedTile}
        building={selectedBuilding}
        currentPlayer={currentPlayer}
        onBuild={handleBuild}
        onClose={handleCloseInfoPanel}
      />
    </div>
  );
}
