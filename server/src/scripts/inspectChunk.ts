import { MongoClient } from 'mongodb';

async function inspectChunk() {
  const mongoUrl = 'mongodb://localhost:27017';
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('✅ MongoDB connected');
    
    const db = client.db('hex-kingdom');
    const chunk = await db.collection('chunks').findOne({});
    
    if (chunk) {
      console.log('\n📦 Sample Chunk:', chunk._id);
      console.log('   Chunk Coordinates:', chunk.chunkX, chunk.chunkY);
      console.log('   Total Tiles in Chunk:', chunk.tiles.length);
      
      // Prüfe erstes Tile
      const firstTile = chunk.tiles[0];
      console.log('\n🎯 First Tile Sample:');
      console.log('   Coordinates:', firstTile.q, firstTile.r);
      console.log('   Biome:', firstTile.biome);
      console.log('   Fertility:', firstTile.fertility);
      console.log('   Resources:', firstTile.resources);
      console.log('   Population:', firstTile.population);
      
      // Zähle Tiles mit Resources
      const tilesWithResources = chunk.tiles.filter((t: any) => t.resources && t.resources.length > 0);
      console.log('\n📊 Statistics for this chunk:');
      console.log('   Tiles with resources:', tilesWithResources.length, '/', chunk.tiles.length);
      
      // Zähle Tiles mit Population
      const tilesWithPopulation = chunk.tiles.filter((t: any) => t.population && t.population > 0);
      console.log('   Tiles with population:', tilesWithPopulation.length, '/', chunk.tiles.length);
      
      // Zeige ein paar Tiles mit Resources
      console.log('\n🔍 Sample tiles with resources:');
      tilesWithResources.slice(0, 3).forEach((tile: any) => {
        console.log(`   Tile (${tile.q},${tile.r}):`, tile.resources);
      });
    }
    
  } finally {
    await client.close();
  }
}

inspectChunk().catch(console.error);
