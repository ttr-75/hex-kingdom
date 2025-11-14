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
    
    // Listen to state changes
    room.onStateChange((state) => {
      set({
        players: new Map(state.players),
        buildings: new Map(state.buildings),
        tiles: new Map(state.tiles)
      });
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
