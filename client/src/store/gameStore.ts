import { create } from 'zustand';
import { Room } from 'colyseus.js';
import { GameRoomState, PlayerState, BuildingState, HexTileState } from '../types/room-state';

interface GameStore {
  room: Room<GameRoomState> | null;
  sessionId: string | null;
  players: Map<string, PlayerState>;
  buildings: Map<string, BuildingState>;
  units: Map<string, any>; // UnitState
  tiles: Map<string, HexTileState>;
  exploredTiles: Map<string, HexTileState>; // Fog of War: bereits gesehene Tiles
  
  // Actions
  setRoom: (room: Room<GameRoomState>) => void;
  updatePlayers: (players: Map<string, PlayerState>) => void;
  updateBuildings: (buildings: Map<string, BuildingState>) => void;
  updateUnits: (units: Map<string, any>) => void;
  updateTiles: (tiles: Map<string, HexTileState>) => void;
  updateExploredTiles: (tiles: Map<string, HexTileState>) => void;
  disconnect: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  room: null,
  sessionId: null,
  players: new Map(),
  buildings: new Map(),
  units: new Map(),
  tiles: new Map(),
  exploredTiles: new Map(),
  
  setRoom: (room) => {
    set({ room, sessionId: room.sessionId });
    
    console.log('🔗 Room connected, setting up listeners...');
    
    // Initial State - wird einmal beim Verbinden getriggert
    room.onStateChange.once((state) => {
      console.log('📊 Initial state received:', {
        players: state.players.size,
        buildings: state.buildings.size,
        tiles: state.tiles.size
      });
      console.log('⚠️ Tiles werden NICHT aus State geladen (Fog-of-War aktiv)');
      
      // Konvertiere Buildings zu Plain Objects
      const buildingsMap = new Map();
      state.buildings.forEach((building: any, key: string) => {
        buildingsMap.set(key, {
          id: building.id,
          type: building.type,
          q: building.q,
          r: building.r,
          owner: building.owner,
          level: building.level,
          constructionProgress: building.constructionProgress,
          constructionStartTime: building.constructionStartTime || 0,
          constructionEndTime: building.constructionEndTime || 0
        });
      });
      
      set({
        players: new Map(state.players),
        buildings: buildingsMap
        // tiles werden per visibleTiles Message gesendet
      });
    });
    
    // Batch Tile-Updates für Performance - DEAKTIVIERT (Fog-of-War per Message)
    /*
    let tileUpdateTimer: NodeJS.Timeout | null = null;
    let pendingTileAdds: Map<string, any> = new Map();
    let pendingTileRemoves: Set<string> = new Set();
    
    const flushTileUpdates = () => {
      if (pendingTileAdds.size > 0 || pendingTileRemoves.size > 0) {
        const currentTiles = get().tiles;
        const newTiles = new Map(currentTiles);
        
        // Apply removes
        pendingTileRemoves.forEach(key => newTiles.delete(key));
        
        // Apply adds
        pendingTileAdds.forEach((tile, key) => newTiles.set(key, tile));
        
        set({ tiles: newTiles });
        
        console.log(`🔄 Batch update: +${pendingTileAdds.size} tiles, -${pendingTileRemoves.size} tiles (total: ${newTiles.size})`);
        
        pendingTileAdds.clear();
        pendingTileRemoves.clear();
      }
      tileUpdateTimer = null;
    };
    
    // Listen auf Tile-Änderungen (gebatched)
    room.state.tiles.onAdd((tile, key) => {
      pendingTileAdds.set(key, tile);
      pendingTileRemoves.delete(key); // Falls ein Remove gepended war
      
      if (!tileUpdateTimer) {
        tileUpdateTimer = setTimeout(flushTileUpdates, 100); // Batch für 100ms
      }
    });
    
    room.state.tiles.onRemove((tile, key) => {
      pendingTileRemoves.add(key);
      pendingTileAdds.delete(key); // Falls ein Add gepended war
      
      if (!tileUpdateTimer) {
        tileUpdateTimer = setTimeout(flushTileUpdates, 100);
      }
    });
    */
    
    // Listen auf Player-Änderungen
    (room.state.players as any).onAdd((player: any, key: string) => {
      console.log('👤 Player added:', key);
      const currentPlayers = get().players;
      const newPlayers = new Map(currentPlayers);
      newPlayers.set(key, { ...player });
      set({ players: newPlayers });
      
      // Listen auf Änderungen in diesem spezifischen Player
      player.onChange(() => {
        console.log('🔄 Player changed:', key, 'Resources:', { wood: player.wood, stone: player.stone });
        const currentPlayers = get().players;
        const newPlayers = new Map(currentPlayers);
        newPlayers.set(key, { ...player });
        set({ players: newPlayers });
      });
    });
    
    (room.state.players as any).onChange((player: any, key: string) => {
      console.log('👤 Player onChange:', key);
      const currentPlayers = get().players;
      const newPlayers = new Map(currentPlayers);
      newPlayers.set(key, { ...player });
      set({ players: newPlayers });
    });
    
    (room.state.players as any).onRemove((_player: any, key: string) => {
      console.log('👤 Player removed:', key);
      const currentPlayers = get().players;
      const newPlayers = new Map(currentPlayers);
      newPlayers.delete(key);
      set({ players: newPlayers });
    });
    
    // Listen auf Building-Änderungen
    (room.state.buildings as any).onAdd((building: any, key: string) => {
      console.log('🏗️ Building added:', key, {
        progress: building.constructionProgress,
        startTime: (building as any).constructionStartTime,
        endTime: (building as any).constructionEndTime
      });
      const currentBuildings = get().buildings;
      const newBuildings = new Map(currentBuildings);
      newBuildings.set(key, {
        id: building.id,
        type: building.type,
        q: building.q,
        r: building.r,
        owner: building.owner,
        level: building.level,
        constructionProgress: building.constructionProgress,
        constructionStartTime: (building as any).constructionStartTime || 0,
        constructionEndTime: (building as any).constructionEndTime || 0
      });
      set({ buildings: newBuildings });
      
      // Listen auf Änderungen in diesem spezifischen Building
      building.onChange(() => {
        console.log('🔄 Building changed:', key, {
          progress: building.constructionProgress,
          startTime: (building as any).constructionStartTime,
          endTime: (building as any).constructionEndTime
        });
        const currentBuildings = get().buildings;
        const newBuildings = new Map(currentBuildings);
        newBuildings.set(key, {
          id: building.id,
          type: building.type,
          q: building.q,
          r: building.r,
          owner: building.owner,
          level: building.level,
          constructionProgress: building.constructionProgress,
          constructionStartTime: (building as any).constructionStartTime || 0,
          constructionEndTime: (building as any).constructionEndTime || 0
        });
        set({ buildings: newBuildings });
      });
    });
    
    (room.state.buildings as any).onChange((building: any, key: string) => {
      console.log('🏗️ Building onChange:', key);
      const currentBuildings = get().buildings;
      const newBuildings = new Map(currentBuildings);
      newBuildings.set(key, {
        id: building.id,
        type: building.type,
        q: building.q,
        r: building.r,
        owner: building.owner,
        level: building.level,
        constructionProgress: building.constructionProgress,
        constructionStartTime: (building as any).constructionStartTime || 0,
        constructionEndTime: (building as any).constructionEndTime || 0
      });
      set({ buildings: newBuildings });
    });
    
    (room.state.buildings as any).onRemove((_building: any, key: string) => {
      console.log('🏗️ Building removed:', key);
      const currentBuildings = get().buildings;
      const newBuildings = new Map(currentBuildings);
      newBuildings.delete(key);
      set({ buildings: newBuildings });
    });

    // Listen auf Unit-Änderungen
    (room.state.units as any).onAdd((unit: any, key: string) => {
      console.log('🎖️ Unit added:', key);
      const currentUnits = get().units;
      const newUnits = new Map(currentUnits);
      newUnits.set(key, {
        id: unit.id,
        type: unit.type,
        q: unit.q,
        r: unit.r,
        owner: unit.owner,
        health: unit.health,
        isMoving: (unit as any).isMoving || false
      });
      set({ units: newUnits });

      // Listen auf Änderungen in dieser spezifischen Unit
      unit.onChange(() => {
        console.log('🔄 Unit changed:', key, 'isMoving:', (unit as any).isMoving);
        const currentUnits = get().units;
        const newUnits = new Map(currentUnits);
        newUnits.set(key, {
          id: unit.id,
          type: unit.type,
          q: unit.q,
          r: unit.r,
          owner: unit.owner,
          health: unit.health,
          isMoving: (unit as any).isMoving || false
        });
        set({ units: newUnits });
      });
    });

    (room.state.units as any).onChange((unit: any, key: string) => {
      console.log('🎖️ Unit onChange:', key, 'isMoving:', (unit as any).isMoving);
      const currentUnits = get().units;
      const newUnits = new Map(currentUnits);
      newUnits.set(key, {
        id: unit.id,
        type: unit.type,
        q: unit.q,
        r: unit.r,
        owner: unit.owner,
        health: unit.health,
        isMoving: (unit as any).isMoving || false
      });
      set({ units: newUnits });
    });

    (room.state.units as any).onRemove((_unit: any, key: string) => {
      console.log('🎖️ Unit removed:', key);
      const currentUnits = get().units;
      const newUnits = new Map(currentUnits);
      newUnits.delete(key);
      set({ units: newUnits });
    });
  },
  
  updatePlayers: (players) => set({ players }),
  updateBuildings: (buildings) => set({ buildings }),
  updateUnits: (units) => set({ units }),
  updateTiles: (tiles) => set({ tiles }),
  updateExploredTiles: (tiles) => set({ exploredTiles: tiles }),
  
  disconnect: () => {
    const { room } = get();
    if (room) {
      room.leave();
    }
    set({
      room: null,
      sessionId: null,
      players: new Map(),
      buildings: new Map(),
      units: new Map(),
      tiles: new Map(),
      exploredTiles: new Map()
    });
  }
}));
