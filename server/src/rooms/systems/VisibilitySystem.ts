import { GameRoomState } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import { Client } from '@colyseus/core';
import {
  UNIT_DEFINITIONS,
  BIOME_DEFINITIONS,
  hexToKey,
  hexLine,
  HexCoord
} from '@hex-kingdom/shared';

export class VisibilitySystem {
  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager,
    private getClientByUsername: (username: string) => Client | undefined
  ) {}

  getBiomeViewDistance(biomeType: string): number {
    const biomeDef = BIOME_DEFINITIONS[biomeType as keyof typeof BIOME_DEFINITIONS];
    return biomeDef?.viewDistance ?? 2;
  }

  canSeeTile(
    observerPos: HexCoord,
    observerBiome: string,
    observerVisionBonus: number,
    targetPos: HexCoord
  ): boolean {
    const baseVisionRange = this.getBiomeViewDistance(observerBiome) + observerVisionBonus;
    
    const dq = targetPos.q - observerPos.q;
    const dr = targetPos.r - observerPos.r;
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    
    if (distance > baseVisionRange) return false;
    if (distance === 0) return true;
    
    const line = hexLine(observerPos, targetPos);
    let remainingVision = baseVisionRange;
    
    // Prüfe alle Tiles auf dem Weg (außer Start und Ziel)
    for (let i = 1; i < line.length - 1; i++) {
      const checkTile = this.state.tiles.get(hexToKey(line[i]));
      if (checkTile) {
        const biomeViewDistance = this.getBiomeViewDistance(checkTile.biome);
        // Je niedriger viewDistance, desto höher die Kosten
        const visionCost = Math.max(0, 5 - biomeViewDistance);
        remainingVision -= visionCost * 0.3;
        
        // Wenn die Sicht aufgebraucht ist, können wir nicht weitersehen
        if (remainingVision <= 0) {
          return false;
        }
      }
    }
    
    // Prüfe ob genug Sicht übrig ist, um das Ziel zu erreichen
    return remainingVision >= 0.5; // Kleine Toleranz
  }

  async updatePlayerVisibility(playerUsername: string): Promise<void> {
    const targetClient = this.getClientByUsername(playerUsername);
    if (!targetClient) return;

    const visibleKeys = new Set<string>();
    
    // 1. Owned tiles
    this.state.tiles.forEach(tile => {
      if (tile.owner === playerUsername) {
        const key = hexToKey({ q: tile.q, r: tile.r });
        visibleKeys.add(key);
        
        const baseVisionRange = this.getBiomeViewDistance(tile.biome);
        const maxSearchRange = baseVisionRange + 2;
        
        this.state.tiles.forEach((t2, k2) => {
          const dq = t2.q - tile.q;
          const dr = t2.r - tile.r;
          const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
          
          if (distance > maxSearchRange) return;
          
          if (this.canSeeTile(
            { q: tile.q, r: tile.r },
            tile.biome,
            0,
            { q: t2.q, r: t2.r }
          )) {
            visibleKeys.add(k2);
          }
        });
      }
    });
    
    // 2. Units' vision
    this.state.units.forEach(unit => {
      if (unit.owner === playerUsername) {
        const unitTile = this.state.tiles.get(hexToKey({ q: unit.q, r: unit.r }));
        if (unitTile) {
          const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
          const unitVisionBonus = unitDef?.visionBonus || 0;
          const baseVisionRange = this.getBiomeViewDistance(unitTile.biome) + unitVisionBonus;
          const maxSearchRange = baseVisionRange + 2;
          
          this.state.tiles.forEach((tile, key) => {
            const dq = tile.q - unit.q;
            const dr = tile.r - unit.r;
            const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
            
            if (distance > maxSearchRange) return;
            
            if (this.canSeeTile(
              { q: unit.q, r: unit.r },
              unitTile.biome,
              unitVisionBonus,
              { q: tile.q, r: tile.r }
            )) {
              visibleKeys.add(key);
            }
          });
        }
      }
    });
    
    const exploredFromDB = await this.postgres.getExploredTiles(playerUsername);
    const exploredKeys = new Set<string>(
      exploredFromDB.map(t => hexToKey({ q: t.q, r: t.r }))
    );
    
    const visibleTiles: Array<any> = [];
    const exploredOnlyTiles: Array<any> = [];
    
    visibleKeys.forEach(key => {
      const tile = this.state.tiles.get(key);
      if (tile) {
        const isOwned = tile.owner === playerUsername;
        visibleTiles.push({
          key,
          q: tile.q,
          r: tile.r,
          biome: tile.biome,
          fertility: tile.fertility,
          owner: tile.owner,
          // Ressourcen nur für eigene oder aktuell sichtbare Tiles
          resources: isOwned ? tile.resources.map(r => ({ type: r.type, amount: r.amount })) : []
        });
      }
    });
    
    exploredKeys.forEach(key => {
      if (!visibleKeys.has(key)) {
        const tile = this.state.tiles.get(key);
        if (tile) {
          exploredOnlyTiles.push({
            key,
            q: tile.q,
            r: tile.r,
            biome: tile.biome
            // Keine Ressourcen für nur-erkundete Tiles!
          });
        }
      }
    });
    
    targetClient.send('visibilityUpdate', { 
      visibleTiles,
      exploredTiles: exploredOnlyTiles
    });
    
    console.log(`👁️ Updated visibility for ${playerUsername}: ${visibleTiles.length} visible, ${exploredOnlyTiles.length} explored-only`);
  }
}
