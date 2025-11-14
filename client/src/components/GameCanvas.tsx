import { useEffect, useRef, useState } from 'react';
import { HexRenderer } from '../renderer/HexRenderer';
import { useGameStore } from '../store/gameStore';
import { HexCoord, BuildingType } from '@hex-kingdom/shared';
import TileInfoPanel from './TileInfoPanel';
import ResourcesPanel from './ResourcesPanel';
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
    
    const handleError = (message: { message: string }) => {
      console.error('❌ Server error:', message.message);
      alert(`Fehler: ${message.message}`);
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
    room.onMessage('error', handleError);
    
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
    console.log(`🏗️ Buildings in store: ${buildings.size}`);
    buildings.forEach((building, key) => {
      console.log(`  - ${key}: ${building.type} at (${building.q}, ${building.r}), progress: ${(building.constructionProgress * 100).toFixed(1)}%`);
    });
    
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
  
  // Get selected tile and building data - aktualisiert sich automatisch wenn buildings sich ändern
  const selectedTile = selectedHex ? tiles.get(`${selectedHex.q},${selectedHex.r}`) : undefined;
  
  // Find building on the selected tile by coordinates (buildings are keyed by ID, not coordinates)
  const selectedBuilding = selectedHex 
    ? Array.from(buildings.values()).find(b => b.q === selectedHex.q && b.r === selectedHex.r)
    : undefined;
  
  // Log building updates für debugging
  useEffect(() => {
    if (selectedBuilding) {
      console.log('🔄 Selected building updated:', {
        id: selectedBuilding.id,
        progress: selectedBuilding.constructionProgress,
        startTime: selectedBuilding.constructionStartTime,
        endTime: selectedBuilding.constructionEndTime
      });
    }
  }, [selectedBuilding]);
  
  return (
    <div className="game-canvas-container">
      {/* Resources Panel - Always visible at top */}
      <ResourcesPanel player={currentPlayer} />
      
      <div className="game-canvas-wrapper">
        <canvas ref={canvasRef} />
        
        {/* Missing Chunks Warning */}
        {missingChunks.length > 0 && (
          <div className="warning-banner">
            🐉 {missingChunks.length} Chunk(s) nicht in Datenbank gefunden - "Here be dragons!"
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
