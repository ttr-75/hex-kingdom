import { MongoClient, Collection, Db } from 'mongodb';

export interface PlayerDocument {
  username: string;           // Primary Key
  color: string;             // Spielerfarbe
  wood: number;
  stone: number;
  iron: number;
  gold: number;
  food: number;
  fish: number;
  storageCapacity: number;
  researching: string | null;
  researchProgress: number;
  technologies: string[];
  createdAt: Date;
  lastLogin: Date;
}

export class PlayerManager {
  private client: MongoClient;
  private db!: Db;
  private players!: Collection<PlayerDocument>;

  constructor() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.client = new MongoClient(mongoUri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db('hex-kingdom');
    this.players = this.db.collection('players');
    
    // Index auf username für schnelle Suche
    await this.players.createIndex({ username: 1 }, { unique: true });
    
    console.log('✅ PlayerManager connected to MongoDB');
  }

  /**
   * Erstelle neuen Spieler oder update lastLogin wenn er existiert
   */
  async createOrUpdatePlayer(data: Partial<PlayerDocument> & { username: string }): Promise<PlayerDocument> {
    const now = new Date();
    
    // Entferne createdAt aus data wenn vorhanden (darf nicht in $set)
    const { createdAt, ...dataWithoutCreatedAt } = data as PlayerDocument;
    
    const result = await this.players.findOneAndUpdate(
      { username: data.username },
      {
        $set: {
          ...dataWithoutCreatedAt,
          lastLogin: now
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { 
        upsert: true, 
        returnDocument: 'after' 
      }
    );
    
    return result!;
  }

  /**
   * Lade Spieler aus DB
   */
  async getPlayer(username: string): Promise<PlayerDocument | null> {
    return await this.players.findOne({ username });
  }

  /**
   * Speichere Spieler-Ressourcen
   */
  async savePlayerResources(
    username: string,
    resources: {
      wood: number;
      stone: number;
      iron: number;
      gold: number;
      food: number;
      fish: number;
      storageCapacity: number;
    }
  ): Promise<void> {
    await this.players.updateOne(
      { username },
      { 
        $set: { 
          ...resources,
          lastLogin: new Date() 
        } 
      }
    );
  }

  /**
   * Speichere Forschungsfortschritt
   */
  async savePlayerResearch(
    username: string,
    researching: string | null,
    researchProgress: number,
    technologies: string[]
  ): Promise<void> {
    await this.players.updateOne(
      { username },
      { 
        $set: { 
          researching,
          researchProgress,
          technologies,
          lastLogin: new Date()
        } 
      }
    );
  }

  /**
   * Komplettes Update des Spielers
   */
  async updatePlayer(username: string, data: Partial<PlayerDocument>): Promise<void> {
    await this.players.updateOne(
      { username },
      { 
        $set: { 
          ...data,
          lastLogin: new Date() 
        } 
      }
    );
  }

  /**
   * Lösche Spieler (für Testing/Admin)
   */
  async deletePlayer(username: string): Promise<void> {
    await this.players.deleteOne({ username });
  }

  /**
   * Hole alle Spieler (für Admin/Stats)
   */
  async getAllPlayers(): Promise<PlayerDocument[]> {
    return await this.players.find({}).toArray();
  }
}
