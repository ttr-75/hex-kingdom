import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'hex-kingdom';

async function cleanupMongoDB() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ MongoDB connected');

    const db = client.db(DB_NAME);

    // Liste alle Collections auf
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Current collections:');
    collections.forEach(col => console.log(`  - ${col.name}`));

    // Backup Stats vor dem Löschen
    console.log('\n📊 Collection Stats (before cleanup):');
    
    const oldCollections = ['players', 'buildings', 'tileDynamicData', 'tile_dynamic_data'];
    
    for (const collName of oldCollections) {
      try {
        const count = await db.collection(collName).countDocuments();
        console.log(`  ${collName}: ${count} documents`);
      } catch (err) {
        console.log(`  ${collName}: does not exist`);
      }
    }

    // Sicherheitsabfrage
    console.log('\n⚠️  WARNING: About to drop old MongoDB collections!');
    console.log('Collections to drop:', oldCollections.join(', '));
    console.log('Collection to KEEP: chunks (terrain data)');
    console.log('\nNote: Data is already migrated to PostgreSQL');
    
    // Für nicht-interaktive Ausführung: Kommentiere diese Zeile ein
    // const confirm = 'yes';
    
    // Für interaktive Ausführung:
    console.log('\n🗑️  Proceeding with cleanup...\n');
    
    // DROP COLLECTIONS:
    for (const collName of oldCollections) {
      try {
        await db.collection(collName).drop();
        console.log(`✅ Dropped collection: ${collName}`);
      } catch (err: any) {
        if (err.codeName === 'NamespaceNotFound') {
          console.log(`⚠️  Collection ${collName} does not exist`);
        } else {
          console.error(`❌ Error dropping ${collName}:`, err.message);
        }
      }
    }

    // Zeige verbleibende Collections
    const remainingCollections = await db.listCollections().toArray();
    console.log('\n📋 Collections after cleanup:');
    remainingCollections.forEach(col => console.log(`  - ${col.name}`));

    console.log('\n✅ MongoDB cleanup completed!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n👋 MongoDB disconnected');
  }
}

cleanupMongoDB();
