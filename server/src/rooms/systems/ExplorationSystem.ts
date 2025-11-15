import { GameRoomState } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import { VisibilitySystem } from './VisibilitySystem.js';
import { Client } from '@colyseus/core';
import {
  hexToKey,
  HexCoord
} from '@hex-kingdom/shared';

export class ExplorationSystem {
  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager,
    private visibilitySystem: VisibilitySystem,
    private getClientByUsername: (username: string) => Client | undefined
  ) {}

  async handleUnitExploration(
    playerUsername: string,
    unit: any,
    unitDef: any
  ): Promise<void> {
    const unitTileKey = hexToKey({ q: unit.q, r: unit.r });
    const unitTile = this.state.tiles.get(unitTileKey);
    if (!unitTile) return;

    const unitVisionBonus = unitDef.visionBonus || 0;
    const baseVisionRange = this.visibilitySystem.getBiomeViewDistance(unitTile.biome) + unitVisionBonus;
    const maxSearchRange = baseVisionRange + 2;

    const newlyVisible: Array<HexCoord> = [];
    
    this.state.tiles.forEach((tile) => {
      const dq = tile.q - unit.q;
      const dr = tile.r - unit.r;
      const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
      
      if (distance > maxSearchRange) return;
      
      if (this.visibilitySystem.canSeeTile(
        { q: unit.q, r: unit.r },
        unitTile.biome,
        unitVisionBonus,
        { q: tile.q, r: tile.r }
      )) {
        newlyVisible.push({ q: tile.q, r: tile.r });
      }
    });

    if (newlyVisible.length > 0) {
      await this.postgres.addExploredTiles(playerUsername, newlyVisible);

      const targetClient = this.getClientByUsername(playerUsername);
      if (targetClient) {
        const exploreTiles = newlyVisible.map(coord => {
          const tile = this.state.tiles.get(hexToKey(coord));
          if (!tile) return null;
          
          const isOwned = tile.owner === playerUsername;
          return {
            key: hexToKey(coord),
            q: tile.q,
            r: tile.r,
            biome: tile.biome,
            fertility: tile.fertility,
            owner: tile.owner,
            // Ressourcen nur für eigene Tiles
            resources: isOwned ? tile.resources.map(r => ({ type: r.type, amount: r.amount })) : []
          };
        }).filter(t => t !== null);

        targetClient.send('newlyExplored', { tiles: exploreTiles });
      }

      console.log(`🔭 ${playerUsername} hat ${newlyVisible.length} neue Tiles erkundet`);
    }
  }
}
