import { Client, Room } from 'colyseus.js';
import { GameRoomState } from '../types/room-state';

class NetworkManager {
  private client: Client;
  private room?: Room<GameRoomState>;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env?.PROD 
      ? window.location.host 
      : 'localhost:2567';
    
    this.client = new Client(`${protocol}//${host}`);
  }

  async joinOrCreate(roomName: string, options: any = {}): Promise<Room<GameRoomState>> {
    try {
      this.room = await this.client.joinOrCreate<GameRoomState>(roomName, options);
      console.log('✅ Verbunden mit Raum:', this.room.id);
      return this.room;
    } catch (error) {
      console.error('❌ Verbindungsfehler:', error);
      throw error;
    }
  }

  async getAvailableRooms() {
    try {
      return await this.client.getAvailableRooms('game');
    } catch (error) {
      console.error('❌ Fehler beim Laden der Räume:', error);
      return [];
    }
  }

  getRoom() {
    return this.room;
  }

  disconnect() {
    if (this.room) {
      this.room.leave();
      this.room = undefined;
    }
  }
}

export const networkManager = new NetworkManager();
