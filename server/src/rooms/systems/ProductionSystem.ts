import { GameRoomState } from '../GameRoomState.js';
import { BUILDING_DEFINITIONS, hexToKey } from '@hex-kingdom/shared';

export class ProductionSystem {
  constructor(private state: GameRoomState) {}

  updateProduction(deltaSeconds: number): void {
    let productionCount = 0;
    
    this.state.buildings.forEach((building) => {
      // Debug: Zeige alle Gebäude
      if (building.type === 'lumbermill') {
        console.log(`🪵 Checking lumbermill at (${building.q}, ${building.r}):`, {
          constructionProgress: building.constructionProgress,
          owner: building.owner,
          level: building.level
        });
      }
      
      if (building.constructionProgress < 1) {
        if (building.type === 'lumbermill') {
          console.log(`⚠️ Lumbermill not finished yet: ${(building.constructionProgress * 100).toFixed(1)}%`);
        }
        return;
      }
      
      // Finde Spieler anhand des Usernames (building.owner ist der username, nicht sessionId)
      let player: any = null;
      this.state.players.forEach((p) => {
        if (p.username === building.owner) {
          player = p;
        }
      });
      
      if (!player) {
        if (building.type === 'lumbermill') {
          console.log(`❌ Player not found for owner: ${building.owner}`);
          console.log(`   Available players:`, Array.from(this.state.players.values()).map(p => p.username));
        }
        return;
      }
      
      const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
      if (!def.baseProduction) return;
      
      // Hole das Tile, auf dem das Gebäude steht
      const tileKey = hexToKey({ q: building.q, r: building.r });
      const tile = this.state.tiles.get(tileKey);
      if (!tile) {
        if (building.type === 'lumbermill') {
          console.log(`❌ Tile not found at (${building.q}, ${building.r})`);
        }
        return;
      }
      
      const productionMultiplier = Math.pow(1.2, building.level - 1);
      
      // Prüfe für jede Ressource, ob sie auf dem Tile vorhanden ist
      if (def.baseProduction.wood) {
        const hasWoodResource = tile.resources.some(r => r.type === 'wood' && r.amount > 0);
        if (building.type === 'lumbermill') {
          console.log(`🌳 Tile resources:`, tile.resources.map(r => `${r.type}: ${r.amount}`));
          console.log(`🪵 Has wood resource: ${hasWoodResource}`);
        }
        
        if (hasWoodResource) {
          const woodBefore = player.wood;
          player.wood = Math.min(
            player.wood + def.baseProduction.wood * productionMultiplier * deltaSeconds,
            player.storageWood
          );
          const woodProduced = player.wood - woodBefore;
          
          if (building.type === 'lumbermill') {
            console.log(`✅ Produced ${woodProduced.toFixed(2)} wood (${woodBefore.toFixed(2)} -> ${player.wood.toFixed(2)})`);
          }
          productionCount++;
        } else if (building.type === 'lumbermill') {
          console.log(`⚠️ No wood resource on tile!`);
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
        // Food-Produktion basiert auf Fruchtbarkeit, nicht auf Ressourcen
        const fertilityMultiplier = tile.fertility || 0.5;
        player.food = Math.min(
          player.food + def.baseProduction.food * productionMultiplier * fertilityMultiplier * deltaSeconds,
          player.storageFood
        );
      }
    });
    
    if (productionCount > 0) {
      console.log(`📊 Production cycle complete: ${productionCount} buildings produced resources`);
    }
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
