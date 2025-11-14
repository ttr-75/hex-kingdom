import { MongoClient } from 'mongodb';

/**
 * Script zum kompletten Zurücksetzen der Datenbank
 * Löscht ALLE Collections und generiert die Welt neu
 */
async function resetDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('hex-kingdom');
    
    console.log('\n⚠️  WARNUNG: KOMPLETTE DATENBANK WIRD GELÖSCHT!');
    console.log('⚠️  Alle Collections werden entfernt:\n');
    console.log('  - worldChunks');
    console.log('  - buildings');
    console.log('  - tileDynamicData');
    console.log('');
    
    // 5 Sekunden Wartezeit
    console.log('⏳ Starte in 5 Sekunden...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Alle Collections löschen
    const collections = await db.listCollections().toArray();
    
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        
        await collection.drop();
        console.log(`✅ Gelöscht: ${collectionName} (${count} Dokumente)`);
      } catch (err) {
        console.error(`❌ Fehler bei ${collectionName}:`, err);
      }
    }
    
    console.log('\n✅ Datenbank komplett gelöscht!');
    console.log('💡 Führe jetzt "npm run generate-world" aus um die Welt neu zu generieren.\n');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  } finally {
    await client.close();
  }
}

resetDatabase();
