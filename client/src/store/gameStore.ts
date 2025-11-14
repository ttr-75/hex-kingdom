import { create } from 'zustand';
import { Room } from 'colyseus.js';
import { GameRoomState, PlayerState, BuildingState, HexTileState } from '../types/room-state';

interface GameStore {
  room: Room<GameRoomState> | null;
  sessionId: string | null;
  players: Map<string, PlayerState>;
  buildings: Map<string, BuildingState>;
  tiles: Map<string, HexTileState>;
  
  // Actions
  setRoom: (room: Room<GameRoomState>) => void;
  updatePlayers: (players: Map<string, PlayerState>) => void;
  updateBuildings: (buildings: Map<string, BuildingState>) => void;
  updateTiles: (tiles: Map<string, HexTileState>) => void;
  disconnect: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  room: null,
  sessionId: null,
  players: new Map(),
  buildings: new Map(),
  tiles: new Map(),
  
  setRoom: (room) => {
    set({ room, sessionId: room.sessionId });
    
    console.log('🔗 Room connected, setting up listeners...');
    
    // Initial State - wird einmal beim Verbinden getriggert
    room.onStateChange.once((state) => {
      console.log('📊 Initial state received:', {
        players: state.players.size,
        buildings: state.buildings.size
      });
      console.log('⚠️ Tiles werden NICHT aus State geladen (Fog-of-War aktiv)');
      set({
        players: new Map(state.players),
        buildings: new Map(state.buildings)
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
    room.state.players.onAdd((player, key) => {
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
    
    room.state.players.onChange((player, key) => {
      console.log('👤 Player onChange:', key);
      const currentPlayers = get().players;
      const newPlayers = new Map(currentPlayers);
      newPlayers.set(key, { ...player });
      set({ players: newPlayers });
    });
    
    room.state.players.onRemove((player, key) => {
      console.log('👤 Player removed:', key);
      const currentPlayers = get().players;
      const newPlayers = new Map(currentPlayers);
      newPlayers.delete(key);
      set({ players: newPlayers });
    });
    
    // Listen auf Building-Änderungen
    room.state.buildings.onAdd((building, key) => {
      console.log('🏗️ Building added:', key);
      const currentBuildings = get().buildings;
      const newBuildings = new Map(currentBuildings);
      newBuildings.set(key, { ...building });
      set({ buildings: newBuildings });
      
      // Listen auf Änderungen in diesem spezifischen Building
      building.onChange(() => {
        console.log('🔄 Building changed:', key, 'Progress:', building.constructionProgress);
        const currentBuildings = get().buildings;
        const newBuildings = new Map(currentBuildings);
        newBuildings.set(key, { ...building });
        set({ buildings: newBuildings });
      });
    });
    
    room.state.buildings.onChange((building, key) => {
      console.log('🏗️ Building onChange:', key);
      const currentBuildings = get().buildings;
      const newBuildings = new Map(currentBuildings);
      newBuildings.set(key, { ...building });
      set({ buildings: newBuildings });
    });
    
    room.state.buildings.onRemove((building, key) => {
      console.log('🏗️ Building removed:', key);
      const currentBuildings = get().buildings;
      const newBuildings = new Map(currentBuildings);
      newBuildings.delete(key);
      set({ buildings: newBuildings });
    });
  },
  
  updatePlayers: (players) => set({ players }),
  updateBuildings: (buildings) => set({ buildings }),
  updateTiles: (tiles) => set({ tiles }),
  
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
      tiles: new Map()
    });
  }
}));
