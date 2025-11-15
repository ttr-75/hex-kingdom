const CHUNK_SIZE = 16;
const coords = [[-16, 19], [-17, 20], [-17, 19]];

coords.forEach(([q, r]) => {
  const chunkX = Math.floor(q / CHUNK_SIZE);
  const chunkY = Math.floor(r / CHUNK_SIZE);
  console.log(`Tile (${q}, ${r}) -> Chunk (${chunkX}, ${chunkY})`);
});
