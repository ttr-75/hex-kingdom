import { GameRoomState } from '../GameRoomState.js';
import { BUILDING_DEFINITIONS, hexToKey } from '@hex-kingdom/shared';

export class ProductionSystem {
  constructor(private state: GameRoomState) {}

  updateProduction(deltaSeconds: number): void {
    this.state.buildings.forEach((building) => {
      if (building.constructionProgress < 1) return;
      
      const player = this.state.players.get(building.owner);
      if (!player) return;
      
      const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
      if (!def.baseProduction) return;
      
      const tileKey = hexToKey({ q: building.q, r: building.r });
      const tile = this.state.tiles.get(tileKey);
      if (!tile) return;
      
      const productionMultiplier = Math.pow(1.2, building.level - 1);
      
      if (def.baseProduction.wood) {
        const hasWoodResource = tile.resources.some(r => r.type === 'wood' && r.amount > 0);
        if (hasWoodResource) {
          player.wood = Math.min(
            player.wood + def.baseProduction.wood * productionMultiplier * deltaSeconds,
            player.storageWood
          );
        }
      }
      if (def.baseProduction.stone) {
        const hasStoneResource = tile.resources.some(r => r.type === 'stone' && r.amount > 0);
        if (hasStoneResource) {
          player.stone = Math.min(
            player.stone + def.baseProduction.stone * productionMultiplier * deltaSeconds,
            player.storageStone
          );
        }
      }
      if (def.baseProduction.iron) {
        const hasIronResource = tile.resources.some(r => r.type === 'iron' && r.amount > 0);
        if (hasIronResource) {
          player.iron = Math.min(
            player.iron + def.baseProduction.iron * productionMultiplier * deltaSeconds,
            player.storageIron
          );
        }
      }
      if (def.baseProduction.food) {
        const fertilityMultiplier = tile.fertility || 0.5;
        player.food = Math.min(
          player.food + def.baseProduction.food * productionMultiplier * fertilityMultiplier * deltaSeconds,
          player.storageFood
        );
      }
    });
  }

  updateResearch(broadcast: (type: string, message: any) => void): void {
    this.state.players.forEach((player) => {
      if (!player.currentResearch || player.researchEndTime === 0) return;
      
      if (Date.now() >= player.researchEndTime) {
        player.researchedTechs.push(player.currentResearch);
        player.currentResearch = '';
        player.researchEndTime = 0;
        
        broadcast('researchCompleted', {
          playerId: player.id,
          technology: player.currentResearch
        });
      }
    });
  }
}
