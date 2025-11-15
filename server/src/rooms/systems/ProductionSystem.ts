import { GameRoomState } from '../GameRoomState.js';
import { BUILDING_DEFINITIONS } from '@hex-kingdom/shared';

export class ProductionSystem {
  constructor(private state: GameRoomState) {}

  updateProduction(deltaSeconds: number): void {
    this.state.buildings.forEach((building) => {
      if (building.constructionProgress < 1) return;
      
      const player = this.state.players.get(building.owner);
      if (!player) return;
      
      const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
      if (!def.baseProduction) return;
      
      const productionMultiplier = Math.pow(1.2, building.level - 1);
      
      if (def.baseProduction.wood) {
        player.wood = Math.min(
          player.wood + def.baseProduction.wood * productionMultiplier * deltaSeconds,
          player.storageWood
        );
      }
      if (def.baseProduction.stone) {
        player.stone = Math.min(
          player.stone + def.baseProduction.stone * productionMultiplier * deltaSeconds,
          player.storageStone
        );
      }
      if (def.baseProduction.iron) {
        player.iron = Math.min(
          player.iron + def.baseProduction.iron * productionMultiplier * deltaSeconds,
          player.storageIron
        );
      }
      if (def.baseProduction.food) {
        player.food = Math.min(
          player.food + def.baseProduction.food * productionMultiplier * deltaSeconds,
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
