import { HexCoord } from './types';
import { hexDistance } from './hex-utils';

interface PathNode {
  coord: HexCoord;
  gCost: number; // Cost from start
  hCost: number; // Heuristic cost to end
  fCost: number; // Total cost
  parent: PathNode | null;
}

/**
 * A* Pathfinding für Hex-Grid
 * Findet den kürzesten Pfad zwischen zwei Koordinaten
 */
export function findPath(
  start: HexCoord,
  goal: HexCoord,
  isPassable: (coord: HexCoord) => boolean
): HexCoord[] | null {
  const openSet: PathNode[] = [];
  const openSetMap = new Map<string, PathNode>(); // OPTIMIZED: Fast lookup
  const closedSet = new Set<string>();
  
  const startNode: PathNode = {
    coord: start,
    gCost: 0,
    hCost: hexDistance(start, goal),
    fCost: hexDistance(start, goal),
    parent: null
  };
  
  const startKey = `${start.q},${start.r}`;
  openSet.push(startNode);
  openSetMap.set(startKey, startNode);
  
  while (openSet.length > 0) {
    // Find node with lowest fCost
    openSet.sort((a, b) => a.fCost - b.fCost);
    const current = openSet.shift()!;
    
    const key = `${current.coord.q},${current.coord.r}`;
    openSetMap.delete(key); // OPTIMIZED: Remove from map
    
    // Goal reached
    if (current.coord.q === goal.q && current.coord.r === goal.r) {
      return reconstructPath(current);
    }
    
    closedSet.add(key);
    
    // Check neighbors
    const neighbors = getHexNeighbors(current.coord);
    
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.q},${neighbor.r}`;
      
      if (closedSet.has(neighborKey)) continue;
      if (!isPassable(neighbor)) continue;
      
      const gCost = current.gCost + 1;
      const hCost = hexDistance(neighbor, goal);
      const fCost = gCost + hCost;
      
      // OPTIMIZED: O(1) lookup instead of O(n) find
      const existingNode = openSetMap.get(neighborKey);
      
      if (existingNode) {
        // Update if this path is better
        if (gCost < existingNode.gCost) {
          existingNode.gCost = gCost;
          existingNode.fCost = fCost;
          existingNode.parent = current;
        }
      } else {
        const newNode: PathNode = {
          coord: neighbor,
          gCost,
          hCost,
          fCost,
          parent: current
        };
        openSet.push(newNode);
        openSetMap.set(neighborKey, newNode);
      }
    }
  }
  
  // No path found
  return null;
}

function reconstructPath(node: PathNode): HexCoord[] {
  const path: HexCoord[] = [];
  let current: PathNode | null = node;
  
  while (current !== null) {
    path.unshift(current.coord);
    current = current.parent;
  }
  
  return path;
}

/**
 * Alle 6 Nachbarn eines Hex-Tiles
 */
export function getHexNeighbors(coord: HexCoord): HexCoord[] {
  return [
    { q: coord.q + 1, r: coord.r },
    { q: coord.q - 1, r: coord.r },
    { q: coord.q, r: coord.r + 1 },
    { q: coord.q, r: coord.r - 1 },
    { q: coord.q + 1, r: coord.r - 1 },
    { q: coord.q - 1, r: coord.r + 1 }
  ];
}
