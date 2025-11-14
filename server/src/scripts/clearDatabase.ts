import { MongoClient } from 'mongodb';

/**
 * Script zum Löschen aller Spiel-Daten (nicht die World-Chunks)
 * Verwende dies um auf das neue username-basierte System umzustellen
 */
async function clearGameData() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('hex-kingdom');
    
    // Liste der Collections die gelöscht werden sollen
    const collectionsToDelete = [
      'buildings',      // Gebäude-Daten
      'tileDynamicData' // Tile-Owner und Building-Zuordnungen
    ];
    
    console.log('\n⚠️  WARNUNG: Folgende Collections werden gelöscht:');
    collectionsToDelete.forEach(col => console.log(`  - ${col}`));
    console.log('\n⚠️  World-Chunks bleiben erhalten!\n');
    
    // 5 Sekunden Wartezeit
    console.log('⏳ Starte in 5 Sekunden...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    for (const collectionName of collectionsToDelete) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        
        if (count > 0) {
          await collection.deleteMany({});
          console.log(`✅ Gelöscht: ${collectionName} (${count} Dokumente)`);
        } else {
          console.log(`ℹ️  Übersprungen: ${collectionName} (leer)`);
        }
      } catch (err) {
        console.error(`❌ Fehler bei ${collectionName}:`, err);
      }
    }
    
    console.log('\n✅ Datenbank bereinigt! Du kannst jetzt neu starten.');
    console.log('💡 Beim nächsten Login werden neue Daten mit username-System erstellt.\n');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  } finally {
    await client.close();
  }
}

clearGameData();
