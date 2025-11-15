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
  const movingUnitIdRef = useRef<string | null>(null);
  const exploredTilesRef = useRef<Map<string, any>>(new Map());
  const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);
  const [movementTime, setMovementTime] = useState<number | null>(null);
  
  const { room, tiles, buildings, units, players, sessionId, updateTiles } = useGameStore();
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [missingChunks, setMissingChunks] = useState<Array<{ chunkX: number; chunkY: number }>>([]);
  
  // Players Map verwendet jetzt username als Key, aber player.id enthält die sessionId
  const currentPlayer = sessionId 
    ? Array.from(players.values()).find(p => p.id === sessionId) ?? null 
    : null;
  
  // Debug logging for currentPlayer
  useEffect(() => {
    console.log('👤 GameCanvas: currentPlayer state', { 
      sessionId, 
      hasPlayer: !!currentPlayer,
      playerCount: players.size,
      playerKeys: Array.from(players.keys()),
      currentPlayer: currentPlayer ? {
        username: currentPlayer.username,
        wood: currentPlayer.wood,
        stone: currentPlayer.stone
      } : null
    });
  }, [sessionId, currentPlayer, players]);
  
  // Initialize renderer
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new HexRenderer(canvasRef.current);
      
      rendererRef.current.setOnTileClick((coord) => {
        console.log('Clicked hex:', coord);
        
        // If in movement mode, handle movement
        const movingUnitId = movingUnitIdRef.current;
        if (movingUnitId && room) {
          console.log(`📍 Moving unit ${movingUnitId} to (${coord.q},${coord.r})`);
          
          room.send('moveUnit', {
            unitId: movingUnitId,
            destination: coord
          });
          
          // Clear movement mode
          movingUnitIdRef.current = null;
          setHoveredHex(null);
          setMovementTime(null);
        } else {
          setSelectedHex(coord);
        }
      });
      
      rendererRef.current.setOnTileHover((coord) => {
        if (movingUnitIdRef.current) {
          setHoveredHex(coord);
          // TODO: Calculate movement time
          setMovementTime(Math.random() * 5 + 1); // Placeholder
        }
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
          biome: tileData.biome,
          fertility: tileData.fertility ?? 0.5,
          owner: tileData.owner,
          resources: tileData.resources || [],
          population: tileData.population !== undefined ? tileData.population : 0
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

    const handleExploredTiles = (message: { tiles: Array<any> }) => {
      console.log('🗺️ Received explored tiles from server:', message.tiles.length);
      
      // Konvertiere zu Map für Store
      const exploredMap = new Map();
      message.tiles.forEach((tileData: any) => {
        exploredMap.set(tileData.key, {
          q: tileData.q,
          r: tileData.r,
          biome: tileData.biome,
          fertility: tileData.fertility ?? 0.5,
          owner: tileData.owner,
          resources: tileData.resources || [],
          population: tileData.population !== undefined ? tileData.population : 0
        });
      });
      
      // Update Store für explored tiles
      const currentExplored = useGameStore.getState().exploredTiles;
      const updatedExplored = new Map(currentExplored);
      exploredMap.forEach((tile, key) => updatedExplored.set(key, tile));
      useGameStore.getState().updateExploredTiles(updatedExplored);
      exploredTilesRef.current = updatedExplored;
      
      // WICHTIG: Auch zur tiles Map hinzufügen, damit sie angezeigt werden!
      const currentTiles = useGameStore.getState().tiles;
      const updatedTiles = new Map(currentTiles);
      exploredMap.forEach((tile, key) => {
        // Nur hinzufügen, wenn nicht schon vorhanden (visible tiles haben Vorrang)
        if (!updatedTiles.has(key)) {
          updatedTiles.set(key, tile);
        }
      });
      useGameStore.getState().updateTiles(updatedTiles);
      
      // Update renderer
      if (rendererRef.current && exploredMap.size > 0) {
        rendererRef.current.updateMap(updatedTiles);
      }
      
      console.log(`📊 Total explored tiles: ${updatedExplored.size}, Total visible tiles: ${updatedTiles.size}`);
    };
    
    const handleNewlyExplored = (message: { tiles: Array<any> }) => {
      console.log('🔭 Newly explored tiles:', message.tiles.length, message.tiles);
      
      if (message.tiles && message.tiles.length > 0) {
        // Add newly explored tiles to visible tiles
        const updatedTiles = new Map(tiles);
        const updatedExplored = new Map(exploredTilesRef.current);
        
        message.tiles.forEach((tileData: any) => {
          if (tileData && tileData.key) {
            updatedTiles.set(tileData.key, {
              q: tileData.q,
              r: tileData.r,
              biome: tileData.biome,
              fertility: tileData.fertility,
              owner: tileData.owner,
              resources: tileData.resources
            });
            updatedExplored.set(tileData.key, tileData);
          }
        });
        
        exploredTilesRef.current = updatedExplored;
        updateTiles(updatedTiles);
        
        console.log(`🔭 Added ${message.tiles.length} newly explored tiles. Total visible: ${updatedTiles.size}, Total explored: ${updatedExplored.size}`);
      }
    };
    
    const handleVisibilityUpdate = (message: { visibleTiles: Array<any>, exploredTiles: Array<any> }) => {
      console.log('👁️ Visibility update:', message.visibleTiles.length, 'visible,', message.exploredTiles.length, 'explored');
      
      // Rebuild tiles map from scratch with new visibility data
      const newTiles = new Map();
      const newExplored = new Map();
      
      // Add visible tiles (full data)
      message.visibleTiles.forEach((tileData: any) => {
        if (tileData && tileData.key) {
          newTiles.set(tileData.key, {
            q: tileData.q,
            r: tileData.r,
            biome: tileData.biome,
            fertility: tileData.fertility ?? 0.5,
            owner: tileData.owner,
            resources: tileData.resources || []
          });
          newExplored.set(tileData.key, tileData);
        }
      });
      
      // Add explored-only tiles (limited data - will render gray)
      message.exploredTiles.forEach((tileData: any) => {
        if (tileData && tileData.key) {
          newTiles.set(tileData.key, {
            q: tileData.q,
            r: tileData.r,
            biome: tileData.biome,
            fertility: tileData.fertility ?? 0.5,
            owner: tileData.owner,
            resources: tileData.resources || []
          });
          newExplored.set(tileData.key, tileData);
        }
      });
      
      exploredTilesRef.current = newExplored;
      updateTiles(newTiles);
      
      // Force renderer update with redraw to update visible vs explored state
      if (rendererRef.current) {
        rendererRef.current.updateMap(newTiles, true); // forceRedraw = true
      }
      
      console.log(`👁️ Visibility updated: ${newTiles.size} total tiles, ${newExplored.size} explored`);
    };
    
    room.onMessage('missingChunks', handleMissingChunks);
    room.onMessage('setSpawnPosition', handleSetSpawnPosition);
    room.onMessage('visibleTiles', handleVisibleTiles);
    room.onMessage('exploredTiles', handleExploredTiles);
    room.onMessage('newlyExplored', handleNewlyExplored);
    room.onMessage('visibilityUpdate', handleVisibilityUpdate);
    room.onMessage('error', handleError);
    
    // Handle unit movement with path
    room.onMessage('unitMovementStarted', (message: { unitId: string; path: Array<{ q: number; r: number; duration: number }>; startTime: number }) => {
      console.log(`🚶 Unit movement started:`, message);
      if (rendererRef.current) {
        rendererRef.current.startUnitMovementAnimation(message.unitId, message.path, message.startTime);
      }
    });
    
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
  
  // Update units when they change
  useEffect(() => {
    console.log(`🗡️ Units in store: ${units.size}`);
    units.forEach((unit, key) => {
      console.log(`  - ${key}: ${unit.type} at (${unit.q}, ${unit.r}), health: ${unit.health}`);
    });
    
    if (rendererRef.current) {
      rendererRef.current.updateUnits(units);
    }
  }, [units]);
  
  const handleBuild = (buildingType: BuildingType) => {
    if (!selectedHex || !room) return;
    
    room.send('build', {
      position: selectedHex,
      buildingType
    });
  };
  
  const handleRecruitUnit = (unitType: string, buildingId: string) => {
    if (!room) return;
    
    room.send('recruitUnit', {
      buildingId,
      unitType
    });
  };
  
  const handleMoveUnit = (unitId: string) => {
    movingUnitIdRef.current = unitId;
    // Remove overlay, use hover tooltip instead
    console.log(`🚶 Movement mode activated for unit ${unitId} - hover over tiles to see travel time`);
  };
  
  const handleCancelMovement = (unitId: string) => {
    if (!room) return;
    
    room.send('cancelMovement', { unitId });
    console.log(`⏹️ Cancelling movement for unit ${unitId}`);
  };
  
  const handleCloseInfoPanel = () => {
    setSelectedHex(null);
  };
  
  // Get selected tile and building data - aktualisiert sich automatisch wenn buildings sich ändern
  const selectedTile = selectedHex ? tiles.get(`${selectedHex.q},${selectedHex.r}`) : undefined;
  
  // Find all buildings on the selected tile by coordinates (buildings are keyed by ID, not coordinates)
  const selectedBuildings = selectedHex 
    ? Array.from(buildings.values()).filter(b => b.q === selectedHex.q && b.r === selectedHex.r)
    : [];
  
  // Log building updates für debugging
  useEffect(() => {
    if (selectedBuildings.length > 0) {
      console.log('🔄 Selected buildings updated:', selectedBuildings.map(b => ({
        id: b.id,
        type: b.type,
        progress: b.constructionProgress
      })));
    }
  }, [selectedBuildings]);
  
  return (
    <div className="game-canvas-container">
      {/* Resources Panel - Always visible at top */}
      <ResourcesPanel player={currentPlayer} />
      
      <div className="game-canvas-wrapper">
        <canvas ref={canvasRef} />
        
        {/* Movement Tooltip */}
        {movingUnitIdRef.current && hoveredHex && movementTime && (
          <div 
            className="movement-tooltip"
            style={{
              position: 'fixed',
              left: '50%',
              top: '20%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '8px',
              border: '2px solid #00ff00',
              fontSize: '16px',
              fontWeight: 'bold',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0, 255, 0, 0.3)'
            }}
          >
            🚶 Reisezeit: {movementTime.toFixed(1)} Minuten
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
              Klicke um Bewegung zu starten
            </div>
          </div>
        )}
        
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
        buildings={selectedBuildings}
        units={units}
        currentPlayer={currentPlayer}
        onBuild={handleBuild}
        onRecruitUnit={handleRecruitUnit}
        onMoveUnit={handleMoveUnit}
        onCancelMovement={handleCancelMovement}
        onClose={handleCloseInfoPanel}
      />
    </div>
  );
}
