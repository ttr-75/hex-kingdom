import { HexCoord, CubeCoord } from './types';

/**
 * Hex-Grid Utility-Funktionen (Axiales Koordinaten-System)
 * Basiert auf: https://www.redblobgames.com/grids/hexagons/
 */

// Konvertierung zwischen axialen und Cube-Koordinaten
export function axialToCube(hex: HexCoord): CubeCoord {
  return {
    x: hex.q,
    z: hex.r,
    y: -hex.q - hex.r
  };
}

export function cubeToAxial(cube: CubeCoord): HexCoord {
  return {
    q: cube.x,
    r: cube.z
  };
}

// Distanz zwischen zwei Hex-Feldern
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  return Math.max(
    Math.abs(ac.x - bc.x),
    Math.abs(ac.y - bc.y),
    Math.abs(ac.z - bc.z)
  );
}

// Nachbar-Hexfelder (6 Richtungen)
const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

export function hexNeighbor(hex: HexCoord, direction: number): HexCoord {
  const dir = HEX_DIRECTIONS[direction];
  return { q: hex.q + dir.q, r: hex.r + dir.r };
}

export function hexNeighbors(hex: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map(dir => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r
  }));
}

// Hex → Pixel (Flat-Top-Orientierung)
export interface Point {
  x: number;
  y: number;
}

export function hexToPixel(hex: HexCoord, size: number): Point {
  const x = size * (3/2 * hex.q);
  const y = size * (Math.sqrt(3)/2 * hex.q + Math.sqrt(3) * hex.r);
  return { x, y };
}

// Pixel → Hex (mit Rundung)
export function pixelToHex(point: Point, size: number): HexCoord {
  const q = (2/3 * point.x) / size;
  const r = (-1/3 * point.x + Math.sqrt(3)/3 * point.y) / size;
  return hexRound({ q, r });
}

// Rundung von fraktionalen Hex-Koordinaten
export function hexRound(hex: HexCoord): HexCoord {
  const cube = axialToCube(hex);
  let rx = Math.round(cube.x);
  let ry = Math.round(cube.y);
  let rz = Math.round(cube.z);

  const xDiff = Math.abs(rx - cube.x);
  const yDiff = Math.abs(ry - cube.y);
  const zDiff = Math.abs(rz - cube.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return cubeToAxial({ x: rx, y: ry, z: rz });
}

// Linie zwischen zwei Hex-Feldern (für Pathfinding/Movement)
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const n = hexDistance(a, b);
  const results: HexCoord[] = [];
  
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    results.push(hexLerp(a, b, t));
  }
  
  return results;
}

function hexLerp(a: HexCoord, b: HexCoord, t: number): HexCoord {
  return hexRound({
    q: a.q * (1 - t) + b.q * t,
    r: a.r * (1 - t) + b.r * t
  });
}

// Hex-Ring (alle Hexfelder in einem bestimmten Radius)
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [center];
  
  const results: HexCoord[] = [];
  let hex = { q: center.q + radius, r: center.r - radius };
  
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push({ ...hex });
      hex = hexNeighbor(hex, i);
    }
  }
  
  return results;
}

// Spiral (alle Hexfelder bis zu einem Radius)
export function hexSpiral(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = [center];
  for (let r = 1; r <= radius; r++) {
    results.push(...hexRing(center, r));
  }
  return results;
}

// Gleichheit prüfen
export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

// Hex zu String (für Map-Keys)
export function hexToKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

export function keyToHex(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}
