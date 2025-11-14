import { MongoClient, Db, Collection } from 'mongodb';

export interface BuildingDocument {
  id: string;
  type: string;
  q: number;
  r: number;
  owner: string;
  level: number;
  constructionStartTime: number;
  constructionEndTime: number;
  createdAt: Date;
  completedAt?: Date;
}

export class BuildingManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<BuildingDocument> | null = null;

  async connect(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.client = new MongoClient(mongoUri);
    await this.client.connect();
    this.db = this.client.db('hex-kingdom');
    this.collection = this.db.collection<BuildingDocument>('buildings');
    
    // Erstelle Indizes für Performance
    await this.collection.createIndex({ owner: 1 });
    await this.collection.createIndex({ q: 1, r: 1 });
    await this.collection.createIndex({ constructionEndTime: 1 });
    
    console.log('✅ BuildingManager connected to MongoDB');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
  }

  /**
   * Speichere ein neues Gebäude in der Datenbank
   */
  async createBuilding(building: Omit<BuildingDocument, 'createdAt'>): Promise<void> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    await this.collection.insertOne({
      ...building,
      createdAt: new Date()
    });
  }

  /**
   * Markiere ein Gebäude als fertiggestellt
   */
  async completeBuilding(buildingId: string): Promise<void> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    await this.collection.updateOne(
      { id: buildingId },
      { 
        $set: { 
          completedAt: new Date()
        } 
      }
    );
  }

  /**
   * Lade alle Gebäude eines Spielers
   */
  async getPlayerBuildings(playerId: string): Promise<BuildingDocument[]> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    return await this.collection.find({ owner: playerId }).toArray();
  }

  /**
   * Lade alle aktiven (im Bau befindlichen) Gebäude
   */
  async getActiveBuildingsForPlayer(playerId: string): Promise<BuildingDocument[]> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    const now = Date.now();
    return await this.collection.find({
      owner: playerId,
      constructionEndTime: { $gt: now },
      completedAt: { $exists: false }
    }).toArray();
  }

  /**
   * Lade alle fertigen Gebäude eines Spielers
   */
  async getCompletedBuildingsForPlayer(playerId: string): Promise<BuildingDocument[]> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    return await this.collection.find({
      owner: playerId,
      completedAt: { $exists: true }
    }).toArray();
  }

  /**
   * Prüfe, ob auf einem Tile bereits ein Gebäude existiert
   */
  async getBuildingAtPosition(q: number, r: number): Promise<BuildingDocument | null> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    return await this.collection.findOne({ q, r });
  }

  /**
   * Upgrade ein Gebäude auf das nächste Level
   */
  async upgradeBuilding(buildingId: string, newLevel: number, upgradeEndTime: number): Promise<void> {
    if (!this.collection) throw new Error('BuildingManager not connected');
    
    await this.collection.updateOne(
      { id: buildingId },
      { 
        $set: { 
          level: newLevel,
          constructionStartTime: Date.now(),
          constructionEndTime: upgradeEndTime,
          completedAt: undefined // Reset completion status
        } 
      }
    );
  }
}
