import { MongoClient } from 'mongodb';

async function findTileWithPopulation() {
  const mongoUrl = 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('✅ MongoDB connected\n');
    
    const db = client.db('hex-kingdom');
    const chunk = await db.collection('chunks').findOne({});
    
    if (chunk) {
      // Finde Tiles mit Population
      const tilesWithPopulation = chunk.tiles.filter((t: any) => t.population && t.population > 0);
      
      if (tilesWithPopulation.length > 0) {
        const tile = tilesWithPopulation[0];
        console.log('🎯 Gefundenes Tile mit Population:');
        console.log(`   Coordinates: (${tile.q}, ${tile.r})`);
        console.log(`   Biome: ${tile.biome}`);
        console.log(`   Population: ${tile.population}`);
        console.log(`   Resources: ${JSON.stringify(tile.resources)}`);
        console.log(`   Fertility: ${tile.fertility}`);
      } else {
        console.log('❌ Kein Tile mit Population in diesem Chunk gefunden');
      }
    }
    
  } finally {
    await client.close();
  }
}

findTileWithPopulation().catch(console.error);
