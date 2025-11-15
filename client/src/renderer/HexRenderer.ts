import * as PIXI from 'pixi.js';
import { HexCoord, hexToPixel, pixelToHex, UnitType } from '@hex-kingdom/shared';
import { HexTileState, BuildingState } from '../types/room-state';

const HEX_SIZE = 40;

// Biome-Farben (basierend auf den definierten Biomen)
const BIOME_COLORS: Record<string, number> = {
  deciduous_forest: 0x4a7c3f,   // Laubwald - grün
  coniferous_forest: 0x2d5a2d,  // Nadelwald - dunkelgrün
  grassland: 0x7cb342,          // Grasland - hellgrün
  hills: 0x8d6e63,              // Hügel - braun
  mountains: 0x616161,          // Gebirge - grau
  swamp: 0x5d4e37,              // Sumpf - dunkelbraun
  steppe: 0xc5a777,             // Steppe - beige
  desert: 0xe4a672,             // Wüste - sand
  ocean: 0x1565c0,              // Ozean - tiefblau
  lake: 0x42a5f5,               // See - blau
  river: 0x64b5f6               // Fluss - hellblau
};

const BIOME_SHADOWS: Record<string, number> = {
  deciduous_forest: 0x3a6c2f,
  coniferous_forest: 0x1d4a1d,
  grassland: 0x6ca332,
  hills: 0x7d5e53,
  mountains: 0x515151,
  swamp: 0x4d3e27,
  steppe: 0xb59767,
  desert: 0xd49662,
  ocean: 0x0d4d9d,
  lake: 0x3295e5,
  river: 0x54a5e6
};

const RESOURCE_COLORS: Record<string, number> = {
  wood: 0x8B4513,
  stone: 0x696969,
  iron: 0xC0C0C0,
  gold: 0xFFD700
};

export class HexRenderer {
  private app: PIXI.Application;
  private mapContainer!: PIXI.Container;
  private buildingContainer!: PIXI.Container;
  private unitContainer!: PIXI.Container;
  private uiContainer!: PIXI.Container;
  private movementOverlay!: PIXI.Container;
  
  private tiles: Map<string, PIXI.Graphics> = new Map();
  private buildings: Map<string, PIXI.Graphics> = new Map();
  private units: Map<string, PIXI.Container> = new Map();
  private dragonMarkers: Map<string, PIXI.Container> = new Map();
  private territoryBorders: Map<string, PIXI.Graphics> = new Map(); // Territoriums-Grenzen
  
  private scoutTexture: PIXI.Texture | null = null; // Scout icon texture
  
  private camera = { x: 0, y: 0, zoom: 1 };
  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };
  
  private isReady = false;
  private isDestroyed = false;
  
  // Movement mode state (unused for now)
  // private _isMovementMode = false;
  // private _movingUnitId: string | null = null;
  // private _movingUnitPosition: HexCoord | null = null;
  // private _movementPlayerUsername: string | null = null;
  
  // Queue für Tiles die ankommen bevor der Renderer bereit ist
  private pendingTiles: Map<string, HexTileState> | null = null;
  private pendingSpawnPosition: HexCoord | null = null;
  private pendingUnits: Map<string, any> | null = null;
  
  private onTileClick?: (coord: HexCoord) => void;
  private onTileHover?: (coord: HexCoord | null) => void;
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
      // Load texture first, then init containers
      this.loadScoutTexture().then(() => {
        this.initContainers();
      });
    });
  }
  
  private async loadScoutTexture() {
    try {
      this.scoutTexture = await PIXI.Assets.load('/spaeher_icon_vector.svg');
      console.log('✅ Scout texture loaded:', this.scoutTexture);
    } catch (err) {
      console.error('❌ Failed to load scout texture:', err);
    }
  }
  
  private initContainers() {
    if (!this.app.stage) return;
    
    this.mapContainer = new PIXI.Container();
    this.buildingContainer = new PIXI.Container();
    this.unitContainer = new PIXI.Container();
    this.uiContainer = new PIXI.Container();
    this.movementOverlay = new PIXI.Container();
    
    this.app.stage.addChild(this.mapContainer);
    this.app.stage.addChild(this.buildingContainer);
    this.app.stage.addChild(this.unitContainer);
    this.app.stage.addChild(this.movementOverlay);
    this.app.stage.addChild(this.uiContainer);
    
    // Zentriere Kamera
    this.camera.x = window.innerWidth / 2;
    this.camera.y = window.innerHeight / 2;
    
    this.setupInteraction();
    this.isReady = true;
    console.log('✅ PixiJS Renderer ready!');
    
    // Verarbeite pending Tiles
    if (this.pendingTiles) {
      console.log(`🔄 Processing ${this.pendingTiles.size} pending tiles`);
      this.updateMap(this.pendingTiles);
      this.pendingTiles = null;
    }
    
    // Verarbeite pending Units
    if (this.pendingUnits) {
      console.log(`🔄 Processing ${this.pendingUnits.size} pending units`);
      this.updateUnits(this.pendingUnits);
      this.pendingUnits = null;
    }
    
    // Verarbeite pending spawn position
    if (this.pendingSpawnPosition) {
      console.log('🎯 Processing pending spawn position:', this.pendingSpawnPosition);
      this.focusOn(this.pendingSpawnPosition);
      this.pendingSpawnPosition = null;
    }
    
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
      } else {
        // Hover detection for movement tooltip
        if (this.onTileHover) {
          const worldPos = this.screenToWorld(e.clientX, e.clientY);
          const hexCoord = pixelToHex(worldPos, HEX_SIZE);
          this.onTileHover(hexCoord);
        }
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
      
      // Zoom zur Mausposition
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      
      // Welt-Position vor dem Zoom
      const worldPosBefore = this.screenToWorld(mouseX, mouseY);
      
      // Zoom anwenden
      this.camera.zoom = newZoom;
      
      // Welt-Position nach dem Zoom
      const worldPosAfter = {
        x: (mouseX - this.camera.x) / this.camera.zoom,
        y: (mouseY - this.camera.y) / this.camera.zoom
      };
      
      // Kamera anpassen, damit die Welt-Position unter der Maus gleich bleibt
      this.camera.x += (worldPosAfter.x - worldPosBefore.x) * this.camera.zoom;
      this.camera.y += (worldPosAfter.y - worldPosBefore.y) * this.camera.zoom;
      
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
    
    this.unitContainer.position.set(this.camera.x, this.camera.y);
    this.unitContainer.scale.set(this.camera.zoom);
    
    this.movementOverlay.position.set(this.camera.x, this.camera.y);
    this.movementOverlay.scale.set(this.camera.zoom);
    
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
    const CHUNK_SIZE = 16;
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
  private drawHexagon(graphics: PIXI.Graphics, x: number, y: number, color: number, _shadowColor: number, _alpha = 1) {
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
  
  // Desaturate a color (make it grayscale) - amount from 0 (no change) to 1 (full gray)
  private desaturateColor(color: number, amount: number): number {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    
    // Calculate grayscale value using luminance formula
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Interpolate between original and gray
    const newR = Math.round(r + (gray - r) * amount);
    const newG = Math.round(g + (gray - g) * amount);
    const newB = Math.round(b + (gray - b) * amount);
    
    return (newR << 16) | (newG << 8) | newB;
  }
  
  // Update map with tile data - nur neue Tiles hinzufügen
  updateMap(tiles: Map<string, HexTileState>, forceRedraw = false) {
    if (!this.isReady || !this.mapContainer) {
      console.warn('⚠️ Renderer not ready for updateMap, storing tiles in queue', { isReady: this.isReady, hasMapContainer: !!this.mapContainer, tileCount: tiles.size });
      this.pendingTiles = tiles;
      return;
    }
    
    console.log(`🔄 updateMap called with ${tiles.size} tiles, current rendered: ${this.tiles.size}, forceRedraw: ${forceRedraw}`);
    
    let newTileCount = 0;
    let updatedTileCount = 0;
    
    // If forceRedraw, remove tiles that are not in the new set
    if (forceRedraw) {
      const keysToRemove: string[] = [];
      this.tiles.forEach((graphics, key) => {
        if (!tiles.has(key)) {
          graphics.destroy();
          keysToRemove.push(key);
        }
      });
      keysToRemove.forEach(key => this.tiles.delete(key));
      console.log(`🗑️ Removed ${keysToRemove.length} tiles during forceRedraw`);
    }
    
    // Add or update tiles
    tiles.forEach((tile, key) => {
      const pixel = hexToPixel({ q: tile.q, r: tile.r }, HEX_SIZE);
      
      // Verwende Biome-System
      const biome = tile.biome || 'grassland';  // Default fallback
      let color = BIOME_COLORS[biome] || BIOME_COLORS.grassland;
      const shadowColor = BIOME_SHADOWS[biome] || BIOME_SHADOWS.grassland;
      
      // Check if this is an explored-only tile (has biome but no owner/resources data)
      // Explored tiles from server have only: key, q, r, biome (no owner, no resources)
      const hasDetailedData = tile.owner !== undefined || (tile.resources && tile.resources.length > 0);
      const isExploredOnly = !hasDetailedData;
      
      // Make explored-only tiles gray/desaturated
      if (isExploredOnly) {
        color = this.desaturateColor(color, 0.7); // 70% desaturated = grayer
      }
      
      let graphics = this.tiles.get(key);
      
      if (!graphics) {
        // New tile
        newTileCount++;
        graphics = new PIXI.Graphics();
        this.mapContainer.addChild(graphics);
        this.tiles.set(key, graphics);
      } else if (forceRedraw) {
        // Existing tile, redraw it
        updatedTileCount++;
      } else {
        // Existing tile, skip if not forcing redraw
        return;
      }
      
      this.drawHexagon(graphics, pixel.x, pixel.y, color, shadowColor);
      
      // Resource node indicator (use new resources array format)
      // Only show resources on visible (non-explored-only) tiles
      if (!isExploredOnly && tile.resources && tile.resources.length > 0) {
        // Show first resource as indicator
        const firstResource = tile.resources[0];
        const resourceColor = RESOURCE_COLORS[firstResource.type] || 0xFFFFFF;
        const dot = new PIXI.Graphics();
        dot.circle(pixel.x, pixel.y, 8);
        dot.fill(resourceColor);
        this.mapContainer.addChild(dot);
      }
    });
    
    if (newTileCount > 0 || updatedTileCount > 0) {
      console.log(`✨ Rendered ${newTileCount} new + ${updatedTileCount} updated tiles (total: ${this.tiles.size})`);
      
      // Zeichne Territoriums-Grenzen
      this.drawTerritoryBorders(tiles);
    }
    
    // Culling: Entferne weit entfernte Chunks
    if (!forceRedraw) {
      this.cullDistantChunks();
    }
  }
  
  // Zeichne Territoriums-Grenzen um owned Tiles
  private drawTerritoryBorders(tiles: Map<string, HexTileState>) {
    // Lösche alte Borders
    this.territoryBorders.forEach(border => border.destroy());
    this.territoryBorders.clear();
    
    // Gruppiere Tiles nach Owner
    const ownerTiles = new Map<string, Array<{ q: number; r: number }>>();
    tiles.forEach(tile => {
      if (tile.owner) {
        if (!ownerTiles.has(tile.owner)) {
          ownerTiles.set(tile.owner, []);
        }
        ownerTiles.get(tile.owner)!.push({ q: tile.q, r: tile.r });
      }
    });
    
    // Für jeden Owner: Zeichne Border
    ownerTiles.forEach((ownedTiles, owner) => {
      const borderGraphics = new PIXI.Graphics();
      this.mapContainer.addChild(borderGraphics);
      this.territoryBorders.set(owner, borderGraphics);
      
      const borderColor = 0xFFFFFF;
      const borderWidth = 4;
      
      const tileSet = new Set(ownedTiles.map(t => `${t.q},${t.r}`));
      
      // Sammle alle Außenkanten als Segmente
      const edgeSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      
      ownedTiles.forEach(tile => {
        const pixel = hexToPixel(tile, HEX_SIZE);
        
        // 6 Nachbarn in axial coordinates für flat-top
        // Visualisierung:       N
        //                  NW      NE
        //                    (0,0)
        //                  SW      SE
        //                       S
        const neighbors = [
          { q: tile.q, r: tile.r - 1 },     // Nord (oben)
          { q: tile.q + 1, r: tile.r - 1 }, // Nordost
          { q: tile.q + 1, r: tile.r },     // Südost
          { q: tile.q, r: tile.r + 1 },     // Süd (unten)
          { q: tile.q - 1, r: tile.r + 1 }, // Südwest
          { q: tile.q - 1, r: tile.r }      // Nordwest
        ];
        
        // Hex-Ecken (flat-top: 0°=rechts, dann gegen Uhrzeigersinn)
        // Ecke 0: 0° (rechts-unten), Ecke 1: 60° (rechts-oben), Ecke 2: 120° (oben-links), 
        // Ecke 3: 180° (links-oben), Ecke 4: 240° (links-unten), Ecke 5: 300° (unten-rechts)
        const corners = [0, 60, 120, 180, 240, 300].map(angle => {
          const rad = (angle * Math.PI) / 180;
          return {
            x: pixel.x + HEX_SIZE * Math.cos(rad),
            y: pixel.y + HEX_SIZE * Math.sin(rad)
          };
        });
        
        // Zuordnung Kante -> Nachbar für flat-top:
        // Kante 0->1 (rechts, vertikal) -> Nachbar NE (Nordost)
        // Kante 1->2 (oben-rechts) -> Nachbar N (Nord)
        // Kante 2->3 (oben-links) -> Nachbar NW (Nordwest)
        // Kante 3->4 (links, vertikal) -> Nachbar SW (Südwest)
        // Kante 4->5 (unten-links) -> Nachbar S (Süd)
        // Kante 5->0 (unten-rechts) -> Nachbar SE (Südost)
        
        //const edgeToNeighborIndex = [1, 0, 5, 4, 3, 2]; // Kante i->i+1 gehört zu Nachbar[index]

        const edgeToNeighborIndex = [2, 3, 4, 5, 0, 1]; // Kante i->i+1 gehört zu Nachbar[index]
        
        for (let i = 0; i < 6; i++) {
          const neighborIdx = edgeToNeighborIndex[i];
          const neighbor = neighbors[neighborIdx];
          const hasNeighbor = tileSet.has(`${neighbor.q},${neighbor.r}`);
          
          if (!hasNeighbor) {
            const c1 = corners[i];
            const c2 = corners[(i + 1) % 6];
            edgeSegments.push({ x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y });
          }
        }
      });
      
      // Zeichne alle Segmente
      edgeSegments.forEach(seg => {
        borderGraphics.moveTo(seg.x1, seg.y1);
        borderGraphics.lineTo(seg.x2, seg.y2);
      });
      
      borderGraphics.stroke({ width: borderWidth, color: borderColor, alpha: 0.8 });
    });
  }
  
  private cullDistantChunks() {
    const CHUNK_SIZE = 16;
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
    
    this.tiles.forEach((_graphics, key) => {
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
  
  // Update units
  updateUnits(units: Map<string, any>) {
    if (!this.isReady || !this.unitContainer) {
      console.log('⚠️ Cannot update units - isReady:', this.isReady, 'unitContainer:', !!this.unitContainer);
      console.log('📦 Storing units in pending queue');
      this.pendingUnits = units;
      return;
    }
    
    console.log(`🗡️ Rendering ${units.size} units to map`);
    
    // Clear old units
    this.units.forEach(g => g.destroy());
    this.units.clear();
    
    units.forEach((unit, key) => {
      console.log(`  - Rendering unit ${key} (${unit.type}) at (${unit.q}, ${unit.r}), scoutTexture=${this.scoutTexture ? 'loaded' : 'null'}`);
      const container = new PIXI.Container();
      const pixel = hexToPixel({ q: unit.q, r: unit.r }, HEX_SIZE);
      container.position.set(pixel.x, pixel.y);
      
      // Unit representation
      if (unit.type === UnitType.SCOUT && this.scoutTexture) {
        console.log('  → Using SVG icon for scout');
        // Use SVG icon for scouts
        const sprite = new PIXI.Sprite(this.scoutTexture);
        sprite.width = 36;
        sprite.height = 36;
        sprite.anchor.set(0.5);
        container.addChild(sprite);
      } else {
        if (unit.type === UnitType.SCOUT) {
          console.log('  → Scout texture not loaded, using fallback');
        }
        // Circle with text for other units
        const graphics = new PIXI.Graphics();
        graphics.circle(0, 0, 18);
        graphics.fill(0x4CAF50);
        graphics.circle(0, 0, 18);
        graphics.stroke({ width: 2, color: 0x2E7D32 });
        container.addChild(graphics);
        
        // Unit type indicator
        const text = new PIXI.Text({
          text: unit.type === UnitType.SCOUT ? '👁' : 'U',
          style: {
            fontSize: 14,
            fill: 0xFFFFFF
          }
        });
        text.anchor.set(0.5);
        container.addChild(text);
      }
      
      // Health bar (always show)
      const healthBarBg = new PIXI.Graphics();
      healthBarBg.rect(-12, 22, 24, 3);
      healthBarBg.fill(0x333333);
      container.addChild(healthBarBg);
      
      const healthBar = new PIXI.Graphics();
      healthBar.rect(-12, 22, 24 * (unit.health / 100), 3);
      healthBar.fill(unit.health > 70 ? 0x4CAF50 : unit.health > 30 ? 0xFFA726 : 0xFF5252);
      container.addChild(healthBar);
      
      this.unitContainer.addChild(container);
      this.units.set(key, container);
    });
  }
  
  // Set click handler
  setOnTileClick(handler: (coord: HexCoord) => void) {
    this.onTileClick = handler;
  }
  
  setOnTileHover(handler: (coord: HexCoord | null) => void) {
    this.onTileHover = handler;
  }
  
  // Focus on specific hex
  focusOn(coord: HexCoord) {
    if (!this.isReady) {
      console.warn('⚠️ Renderer not ready for focusOn, storing spawn position');
      this.pendingSpawnPosition = coord;
      return;
    }
    console.log(`🎯 Focusing camera on hex (${coord.q}, ${coord.r})`);
    const pixel = hexToPixel(coord, HEX_SIZE);
    this.camera.x = window.innerWidth / 2 - pixel.x * this.camera.zoom;
    this.camera.y = window.innerHeight / 2 - pixel.y * this.camera.zoom;
    console.log(`📷 Camera position: x=${this.camera.x.toFixed(0)}, y=${this.camera.y.toFixed(0)}, zoom=${this.camera.zoom}`);
    this.updateTransform();
  }
  
  // Set missing chunks (draw "Here be dragons")
  setMissingChunks(chunks: Array<{ chunkX: number; chunkY: number }>) {
    if (!this.isReady || !this.mapContainer) return;
    
    // Clear old markers
    this.dragonMarkers.forEach(marker => marker.destroy());
    this.dragonMarkers.clear();
    
    // Draw new markers
    chunks.forEach(chunk => {
      const chunkKey = `${chunk.chunkX}_${chunk.chunkY}`;
      const CHUNK_SIZE = 16;
      
      // Berechne Chunk-Mitte in Pixel-Koordinaten
      const centerQ = chunk.chunkX * CHUNK_SIZE + CHUNK_SIZE / 2;
      const centerR = chunk.chunkY * CHUNK_SIZE + CHUNK_SIZE / 2;
      const pixel = hexToPixel({ q: centerQ, r: centerR }, HEX_SIZE);
      
      // Container für Marker
      const container = new PIXI.Container();
      
      // Dunkler Hintergrund für Chunk
      const background = new PIXI.Graphics();
      const chunkWidth = CHUNK_SIZE * HEX_SIZE * 1.5;
      const chunkHeight = CHUNK_SIZE * HEX_SIZE * Math.sqrt(3);
      background.rect(
        pixel.x - chunkWidth / 2,
        pixel.y - chunkHeight / 2,
        chunkWidth,
        chunkHeight
      );
      background.fill({ color: 0x1a1a1a, alpha: 0.8 });
      container.addChild(background);
      
      // "Here be dragons" Text
      const text = new PIXI.Text({
        text: '🐉\nHere be\nDragons',
        style: {
          fontSize: 32,
          fill: 0xff6b6b,
          align: 'center',
          fontFamily: 'Arial',
          fontWeight: 'bold',
          stroke: { color: 0x000000, width: 4 }
        }
      });
      text.anchor.set(0.5);
      text.position.set(pixel.x, pixel.y);
      container.addChild(text);
      
      this.mapContainer.addChild(container);
      this.dragonMarkers.set(chunkKey, container);
    });
  }
  
  setMovementMode(unitId: string, unitPosition: HexCoord, playerUsername: string) {
    // Store movement state (currently unused but kept for future use)
    console.log(`🎯 Movement mode: unit ${unitId} at (${unitPosition.q},${unitPosition.r}) by ${playerUsername}`);
    
    // Highlight all visible tiles as selectable
    this.tiles.forEach((_graphics, key) => {
      const tile = this.parseTileKey(key);
      if (tile) {
        // Add semi-transparent green overlay to show clickable tiles
        const overlay = new PIXI.Graphics();
        const pixel = hexToPixel({ q: tile.q, r: tile.r }, HEX_SIZE);
        
        overlay.beginPath();
        const hexSize = HEX_SIZE;
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const x = pixel.x + hexSize * Math.cos(angle);
          const y = pixel.y + hexSize * Math.sin(angle);
          if (i === 0) overlay.moveTo(x, y);
          else overlay.lineTo(x, y);
        }
        overlay.closePath();
        overlay.fill({ color: 0x00ff00, alpha: 0.2 });
        overlay.stroke({ color: 0x00ff00, width: 2, alpha: 0.5 });
        
        // Make overlay non-interactive so clicks pass through
        overlay.eventMode = 'none';
        
        this.movementOverlay.addChild(overlay);
      }
    });
    
    console.log(`🎯 Movement mode activated - click any tile to move`);
  }
  
  private parseTileKey(key: string): { q: number; r: number } | null {
    const parts = key.split(',');
    if (parts.length === 2) {
      return { q: parseInt(parts[0]), r: parseInt(parts[1]) };
    }
    return null;
  }
  
  clearMovementMode() {
    console.log(`❌ Clearing movement mode`);
    
    // Clear movement overlay
    this.movementOverlay.removeChildren();
    
    console.log(`❌ Movement mode cleared`);
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
      this.dragonMarkers.forEach(m => { try { m.destroy(); } catch {} });
      this.tiles.clear();
      this.buildings.clear();
      this.dragonMarkers.clear();
    } catch {}
  }
}
