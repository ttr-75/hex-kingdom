import * as PIXI from 'pixi.js';
import { HexCoord, hexToPixel, pixelToHex } from '@hex-kingdom/shared';
import { HexTileState, BuildingState } from '../types/room-state';

const HEX_SIZE = 40;
const TERRAIN_COLORS: Record<string, number> = {
  grass: 0x5A9B4D,      // Saftiges Grün #5A9B4D
  forest: 0x2D5A1E,     // Dunkles Waldgrün #2D5A1E
  mountain: 0x6B5A4C,  // Braune Berge #6B5A4C
  water: 0x3A7CA5,     // Tiefblaues Wasser #3A7CA5
  desert: 0xE0C99D,    // Gelbe Wüste #E0C99D
  hills: 0x867C73     // Hellgrüne Hügel #867c73
};

const TERRAIN_SHADOWS: Record<string, number> = {
  grass: 0x4A8B3D,
  forest: 0x1D4A0E,
  mountain: 0x5B4A3C,
  water: 0x2A6C95,
  desert: 0xD0B98D,
  hills: 0x6A8B4A
};

const RESOURCE_COLORS: Record<string, number> = {
  wood: 0x8B4513,
  stone: 0x696969,
  iron: 0xC0C0C0,
  gold: 0xFFD700
};

export class HexRenderer {
  private app: PIXI.Application;
  private mapContainer: PIXI.Container;
  private buildingContainer: PIXI.Container;
  private uiContainer: PIXI.Container;
  
  private tiles: Map<string, PIXI.Graphics> = new Map();
  private buildings: Map<string, PIXI.Graphics> = new Map();
  
  private camera = { x: 0, y: 0, zoom: 1 };
  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };
  
  private isReady = false;
  private isDestroyed = false;
  
  private onTileClick?: (coord: HexCoord) => void;
  private onViewportChange?: (visibleChunks: Array<{ chunkX: number; chunkY: number }>) => void;
  
  private lastViewportUpdate = 0;
  private viewportUpdateInterval = 2000; // Update alle 2 Sekunden (erhöht von 1s)
  private lastViewportChunks: string = ''; // Speichere letzte Chunk-Liste
  private cullingRange = 6; // Entferne Chunks die mehr als 6 Chunks vom Viewport entfernt sind
  
  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application();
    
    this.app.init({
      canvas: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      background: 0x0a0a15,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: 'webgpu',
      failIfMajorPerformanceCaveat: false
    }).then(() => {
      if (this.isDestroyed) {
        try { this.app.destroy(); } catch {}
        return;
      }
      this.initContainers();
    });
  }
  
  private initContainers() {
    if (!this.app.stage) return;
    
    this.mapContainer = new PIXI.Container();
    this.buildingContainer = new PIXI.Container();
    this.uiContainer = new PIXI.Container();
    
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.buildingContainer);
    this.app.stage.addChild(this.uiContainer);
    
    // Zentriere Kamera
    this.camera.x = window.innerWidth / 2;
    this.camera.y = window.innerHeight / 2;
    
    this.setupInteraction();
    this.isReady = true;
    this.updateTransform();
    
    // Window resize handling
    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    });
  }
  
  private setupInteraction() {
    const canvas = this.app.canvas as HTMLCanvasElement;
    
    // Mouse drag
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMousePos.x;
        const dy = e.clientY - this.lastMousePos.y;
        
        this.camera.x += dx;
        this.camera.y += dy;
        
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.updateTransform();
      }
    });
    
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });
    
    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.3, Math.min(2, this.camera.zoom * zoomFactor));
      
      this.camera.zoom = newZoom;
      this.updateTransform();
    });
    
    // Click detection
    canvas.addEventListener('click', (e) => {
      if (this.onTileClick) {
        const worldPos = this.screenToWorld(e.clientX, e.clientY);
        const hexCoord = pixelToHex(worldPos, HEX_SIZE);
        this.onTileClick(hexCoord);
      }
    });
  }
  
  private updateTransform() {
    if (!this.isReady) return;
    this.mapContainer.position.set(this.camera.x, this.camera.y);
    this.mapContainer.scale.set(this.camera.zoom);
    
    this.buildingContainer.position.set(this.camera.x, this.camera.y);
    this.buildingContainer.scale.set(this.camera.zoom);
    
    // Check viewport change bei jedem Transform-Update
    this.checkViewportUpdate();
  }
  
  private checkViewportUpdate() {
    const now = Date.now();
    if (now - this.lastViewportUpdate < this.viewportUpdateInterval) return;
    
    this.lastViewportUpdate = now;
    
    if (this.onViewportChange) {
      const visibleChunks = this.getVisibleChunks();
      const chunkString = visibleChunks.map(c => `${c.chunkX},${c.chunkY}`).sort().join('|');
      
      // Nur senden wenn sich die Chunks tatsächlich geändert haben
      if (chunkString !== this.lastViewportChunks) {
        this.lastViewportChunks = chunkString;
        console.log(`📍 Viewport changed! Requesting ${visibleChunks.length} chunks`);
        this.onViewportChange(visibleChunks);
      }
    }
  }
  
  private getVisibleChunks(): Array<{ chunkX: number; chunkY: number }> {
    const CHUNK_SIZE = 32;
    const padding = 2; // Reduziert auf 2 Chunks Padding
    
    // Berechne sichtbaren Bereich in Welt-Koordinaten
    const left = -this.camera.x / this.camera.zoom;
    const top = -this.camera.y / this.camera.zoom;
    const right = (window.innerWidth - this.camera.x) / this.camera.zoom;
    const bottom = (window.innerHeight - this.camera.y) / this.camera.zoom;
    
    // Hex-zu-Pixel Verhältnis
    const hexWidth = HEX_SIZE * 1.5;
    const hexHeight = HEX_SIZE * Math.sqrt(3);
    
    // Konvertiere zu ungefähren Hex-Koordinaten und dann zu Chunks
    const minQ = Math.floor(left / hexWidth);
    const maxQ = Math.ceil(right / hexWidth);
    const minR = Math.floor(top / hexHeight);
    const maxR = Math.ceil(bottom / hexHeight);
    
    // Chunk-Koordinaten mit korrekter negativer Division
    const getChunkCoord = (coord: number) => coord >= 0 ? Math.floor(coord / CHUNK_SIZE) : Math.floor((coord + 1) / CHUNK_SIZE) - 1;
    
    const minChunkX = getChunkCoord(minQ) - padding;
    const maxChunkX = getChunkCoord(maxQ) + padding;
    const minChunkY = getChunkCoord(minR) - padding;
    const maxChunkY = getChunkCoord(maxR) + padding;
    
    const chunks: Array<{ chunkX: number; chunkY: number }> = [];
    for (let cx = minChunkX; cx <= maxChunkX; cx++) {
      for (let cy = minChunkY; cy <= maxChunkY; cy++) {
        chunks.push({ chunkX: cx, chunkY: cy });
      }
    }
    
    return chunks;
  }
  
  setOnViewportChange(callback: (visibleChunks: Array<{ chunkX: number; chunkY: number }>) => void) {
    this.onViewportChange = callback;
  }
  
  private screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - this.camera.x) / this.camera.zoom,
      y: (screenY - this.camera.y) / this.camera.zoom
    };
  }
  
  // Render hex tile
  private drawHexagon(graphics: PIXI.Graphics, x: number, y: number, color: number, shadowColor: number, alpha = 1) {
    graphics.clear();
    
    const angles = [0, 60, 120, 180, 240, 300];
    const points = angles.map(angle => {
      const rad = (angle * Math.PI) / 180;
      return {
        x: x + HEX_SIZE * Math.cos(rad),
        y: y + HEX_SIZE * Math.sin(rad)
      };
    });
    
    graphics.poly(points);
    graphics.fill(color);
    graphics.stroke({ width: 2, color: 0x000000, alpha: 0.4 });
  }
  
  // Update map with tile data - nur neue Tiles hinzufügen
  updateMap(tiles: Map<string, HexTileState>) {
    if (!this.isReady || !this.mapContainer) return;
    
    let newTileCount = 0;
    
    // Füge nur neue Tiles hinzu
    tiles.forEach((tile, key) => {
      if (this.tiles.has(key)) return; // Tile existiert bereits
      
      newTileCount++;
      
      const graphics = new PIXI.Graphics();
      this.mapContainer.addChild(graphics);
      this.tiles.set(key, graphics);
      
      const pixel = hexToPixel({ q: tile.q, r: tile.r }, HEX_SIZE);
      const color = TERRAIN_COLORS[tile.terrain] || TERRAIN_COLORS.grass;
      const shadowColor = TERRAIN_SHADOWS[tile.terrain] || TERRAIN_SHADOWS.grass;
      
      this.drawHexagon(graphics, pixel.x, pixel.y, color, shadowColor);
      
      // Owner highlight
      if (tile.owner) {
        const outline = new PIXI.Graphics();
        outline.circle(pixel.x, pixel.y, HEX_SIZE * 0.8);
        outline.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.5 });
        this.mapContainer.addChild(outline);
      }
      
      // Resource node indicator
      if (tile.resourceType) {
        const resourceColor = RESOURCE_COLORS[tile.resourceType] || 0xFFFFFF;
        const dot = new PIXI.Graphics();
        dot.circle(pixel.x, pixel.y, 8);
        dot.fill(resourceColor);
        this.mapContainer.addChild(dot);
      }
    });
    
    if (newTileCount > 0) {
      console.log(`✨ Added ${newTileCount} new tiles (total: ${this.tiles.size})`);
    }
    
    // Culling: Entferne weit entfernte Chunks
    this.cullDistantChunks();
  }
  
  private cullDistantChunks() {
    const CHUNK_SIZE = 32;
    const visibleChunks = this.getVisibleChunks();
    
    // Erstelle Set der sichtbaren Chunks (mit cullingRange Puffer)
    const keepChunks = new Set<string>();
    visibleChunks.forEach(chunk => {
      for (let dx = -this.cullingRange; dx <= this.cullingRange; dx++) {
        for (let dy = -this.cullingRange; dy <= this.cullingRange; dy++) {
          keepChunks.add(`${chunk.chunkX + dx},${chunk.chunkY + dy}`);
        }
      }
    });
    
    // Entferne Tiles außerhalb der Keep-Zone
    let removedCount = 0;
    const tilesToRemove: string[] = [];
    
    this.tiles.forEach((graphics, key) => {
      const parts = key.split(',');
      const q = parseInt(parts[0]);
      const r = parseInt(parts[1]);
      
      const chunkX = q >= 0 ? Math.floor(q / CHUNK_SIZE) : Math.floor((q + 1) / CHUNK_SIZE) - 1;
      const chunkY = r >= 0 ? Math.floor(r / CHUNK_SIZE) : Math.floor((r + 1) / CHUNK_SIZE) - 1;
      const chunkKey = `${chunkX},${chunkY}`;
      
      if (!keepChunks.has(chunkKey)) {
        tilesToRemove.push(key);
      }
    });
    
    // Entferne die Tiles
    tilesToRemove.forEach(key => {
      const graphics = this.tiles.get(key);
      if (graphics) {
        graphics.destroy();
        this.tiles.delete(key);
        removedCount++;
      }
    });
    
    if (removedCount > 0) {
      console.log(`🗑️ Removed ${removedCount} distant tiles (remaining: ${this.tiles.size})`);
    }
  }
  
  // Update buildings
  updateBuildings(buildings: Map<string, BuildingState>) {
    if (!this.isReady || !this.buildingContainer) return;
    // Clear old buildings
    this.buildings.forEach(g => g.destroy());
    this.buildings.clear();
    
    buildings.forEach((building, key) => {
      const graphics = new PIXI.Graphics();
      const pixel = hexToPixel({ q: building.q, r: building.r }, HEX_SIZE);
      
      // Building representation (simple square for now)
      graphics.rect(pixel.x - 15, pixel.y - 15, 30, 30);
      graphics.fill(0x8B4513);
      
      // Level indicator
      const text = new PIXI.Text({
        text: `Lv${building.level}`,
        style: {
          fontSize: 10,
          fill: 0xFFFFFF
        }
      });
      text.anchor.set(0.5);
      text.position.set(pixel.x, pixel.y + 25);
      this.buildingContainer.addChild(text);
      
      // Construction progress
      if (building.constructionProgress < 1) {
        const progressBar = new PIXI.Graphics();
        progressBar.rect(
          pixel.x - 15,
          pixel.y + 20,
          30 * building.constructionProgress,
          4
        );
        progressBar.fill(0x00FF00);
        this.buildingContainer.addChild(progressBar);
      }
      
      this.buildingContainer.addChild(graphics);
      this.buildings.set(key, graphics);
    });
  }
  
  // Set click handler
  setOnTileClick(handler: (coord: HexCoord) => void) {
    this.onTileClick = handler;
  }
  
  // Focus on specific hex
  focusOn(coord: HexCoord) {
    if (!this.isReady) return;
    const pixel = hexToPixel(coord, HEX_SIZE);
    this.camera.x = window.innerWidth / 2 - pixel.x * this.camera.zoom;
    this.camera.y = window.innerHeight / 2 - pixel.y * this.camera.zoom;
    this.updateTransform();
  }
  
  destroy() {
    this.isDestroyed = true;
    if (!this.isReady) {
      // If init not finished yet, do not destroy now. The init promise
      // handler will check isDestroyed and destroy safely after init.
      return;
    }
    try { (this.app as any).ticker?.stop?.(); } catch {}
    try { this.app.destroy(); } catch {}
    try {
      this.tiles.forEach(g => { try { g.destroy(); } catch {} });
      this.buildings.forEach(g => { try { g.destroy(); } catch {} });
      this.tiles.clear();
      this.buildings.clear();
    } catch {}
  }
}
