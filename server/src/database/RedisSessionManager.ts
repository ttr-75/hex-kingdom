import { createClient, RedisClientType } from 'redis';

/**
 * RedisSessionManager - Für hochfrequente, temporäre Spieldaten
 * 
 * Speichert Session-Daten die sich jede Sekunde ändern:
 * - Live Ressourcen-Produktion
 * - Construction Progress (ticking)
 * - Research Progress (ticking)
 * - Unit Positions (Bewegung)
 * 
 * Bei onLeave() → Sync zu MongoDB für Persistenz
 */

export interface PlayerSessionData {
  username: string;
  sessionId: string;
  roomId: string;
  
  // Live Resources (updated every tick)
  wood: number;
  stone: number;
  iron: number;
  gold: number;
  food: number;
  fish: number;
  
  // Storage Capacity
  storageWood: number;
  storageStone: number;
  storageIron: number;
  storageGold: number;
  storageFood: number;
  storageFish: number;
  
  // Research (ticking progress)
  currentResearch: string | null;
  researchProgress: number; // 0-1
  researchEndTime: number;
  
  // Metadata
  lastUpdate: number; // Timestamp
  connectedAt: number;
}

export interface BuildingSessionData {
  buildingId: string;
  constructionProgress: number; // 0-1, updated every tick
  constructionStartTime: number;
  constructionEndTime: number;
  lastUpdate: number;
}

export class RedisSessionManager {
  private client: RedisClientType;
  private connected = false;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.client = createClient({
      url: redisUrl
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('🔗 Redis connecting...');
    });

    this.client.on('ready', () => {
      console.log('✅ Redis ready');
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    
    try {
      await this.client.connect();
      this.connected = true;
      console.log('✅ RedisSessionManager connected');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
    console.log('👋 RedisSessionManager disconnected');
  }

  // ===========================
  // PLAYER SESSION DATA
  // ===========================

  private getPlayerKey(username: string): string {
    return `session:player:${username}`;
  }

  /**
   * Speichere oder update Player-Session
   * TTL: 1 Stunde (automatisch gelöscht wenn Spieler disconnected)
   */
  async setPlayerSession(data: PlayerSessionData): Promise<void> {
    const key = this.getPlayerKey(data.username);
    await this.client.setEx(
      key,
      3600, // 1 hour TTL
      JSON.stringify({
        ...data,
        lastUpdate: Date.now()
      })
    );
  }

  /**
   * Lade Player-Session
   */
  async getPlayerSession(username: string): Promise<PlayerSessionData | null> {
    const key = this.getPlayerKey(username);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update nur Ressourcen (für Production-Tick)
   */
  async updatePlayerResources(
    username: string,
    resources: {
      wood: number;
      stone: number;
      iron: number;
      gold: number;
      food: number;
    }
  ): Promise<void> {
    const session = await this.getPlayerSession(username);
    if (!session) return;

    session.wood = resources.wood;
    session.stone = resources.stone;
    session.iron = resources.iron;
    session.gold = resources.gold;
    session.food = resources.food;
    session.lastUpdate = Date.now();

    await this.setPlayerSession(session);
  }

  /**
   * Update Research Progress
   */
  async updateResearchProgress(
    username: string,
    progress: number,
    endTime: number
  ): Promise<void> {
    const session = await this.getPlayerSession(username);
    if (!session) return;

    session.researchProgress = progress;
    session.researchEndTime = endTime;
    session.lastUpdate = Date.now();

    await this.setPlayerSession(session);
  }

  /**
   * Lösche Player-Session (bei Logout)
   */
  async deletePlayerSession(username: string): Promise<void> {
    const key = this.getPlayerKey(username);
    await this.client.del(key);
  }

  /**
   * Extend TTL (keep-alive bei Aktivität)
   */
  async keepPlayerSessionAlive(username: string): Promise<void> {
    const key = this.getPlayerKey(username);
    await this.client.expire(key, 3600); // Reset to 1 hour
  }

  // ===========================
  // BUILDING SESSION DATA
  // ===========================

  private getBuildingKey(buildingId: string): string {
    return `session:building:${buildingId}`;
  }

  /**
   * Speichere Building Construction Progress
   */
  async setBuildingSession(data: BuildingSessionData): Promise<void> {
    const key = this.getBuildingKey(data.buildingId);
    await this.client.setEx(
      key,
      7200, // 2 hours TTL (buildings take time)
      JSON.stringify({
        ...data,
        lastUpdate: Date.now()
      })
    );
  }

  /**
   * Lade Building Session
   */
  async getBuildingSession(buildingId: string): Promise<BuildingSessionData | null> {
    const key = this.getBuildingKey(buildingId);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update Construction Progress
   */
  async updateBuildingProgress(
    buildingId: string,
    progress: number
  ): Promise<void> {
    const session = await this.getBuildingSession(buildingId);
    if (!session) return;

    session.constructionProgress = progress;
    session.lastUpdate = Date.now();

    await this.setBuildingSession(session);
  }

  /**
   * Lösche Building-Session (bei Completion)
   */
  async deleteBuildingSession(buildingId: string): Promise<void> {
    const key = this.getBuildingKey(buildingId);
    await this.client.del(key);
  }

  // ===========================
  // BULK OPERATIONS
  // ===========================

  /**
   * Lade alle aktiven Player-Sessions
   */
  async getAllPlayerSessions(): Promise<PlayerSessionData[]> {
    const keys = await this.client.keys('session:player:*');
    const sessions: PlayerSessionData[] = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        sessions.push(JSON.parse(data));
      }
    }

    return sessions;
  }

  /**
   * Lade alle aktiven Building-Sessions
   */
  async getAllBuildingSessions(): Promise<BuildingSessionData[]> {
    const keys = await this.client.keys('session:building:*');
    const sessions: BuildingSessionData[] = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        sessions.push(JSON.parse(data));
      }
    }

    return sessions;
  }

  /**
   * Cleanup - Lösche abgelaufene Sessions manuell
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    let deletedCount = 0;

    // Cleanup Player Sessions
    const playerKeys = await this.client.keys('session:player:*');
    for (const key of playerKeys) {
      const data = await this.client.get(key);
      if (data) {
        const session = JSON.parse(data) as PlayerSessionData;
        if (session.lastUpdate < oneHourAgo) {
          await this.client.del(key);
          deletedCount++;
        }
      }
    }

    // Cleanup Building Sessions
    const buildingKeys = await this.client.keys('session:building:*');
    for (const key of buildingKeys) {
      const data = await this.client.get(key);
      if (data) {
        const session = JSON.parse(data) as BuildingSessionData;
        if (session.lastUpdate < oneHourAgo) {
          await this.client.del(key);
          deletedCount++;
        }
      }
    }

    console.log(`🧹 Redis Cleanup: ${deletedCount} stale sessions deleted`);
    return deletedCount;
  }

  // ===========================
  // STATS & MONITORING
  // ===========================

  /**
   * Statistiken über aktive Sessions
   */
  async getStats(): Promise<{
    activePlayers: number;
    activeBuildings: number;
    totalKeys: number;
  }> {
    const playerKeys = await this.client.keys('session:player:*');
    const buildingKeys = await this.client.keys('session:building:*');
    const allKeys = await this.client.keys('*');

    return {
      activePlayers: playerKeys.length,
      activeBuildings: buildingKeys.length,
      totalKeys: allKeys.length
    };
  }
}
