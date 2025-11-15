import { GameRoomState } from '../GameRoomState.js';
import { BUILDING_DEFINITIONS, hexToKey } from '@hex-kingdom/shared';
import { PostgresManager } from '../../database/PostgresManager.js';

interface ResourceDelta {
  wood: number;
  stone: number;
  iron: number;
  food: number;
}

export class ProductionSystem {
  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager
  ) {}

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

  // ===========================
  // OFFLINE PRODUCTION
  // ===========================

  /**
   * Speichere aktuellen Produktionszustand für einen Spieler
   * Wird aufgerufen wenn Spieler offline geht oder bei wichtigen Events
   */
  async saveProductionState(playerUsername: string): Promise<void> {
    const player = this.state.players.get(playerUsername);
    if (!player) return;

    const now = Date.now();
    const savePromises: Promise<void>[] = [];

    this.state.buildings.forEach((building) => {
      if (building.owner !== playerUsername) return;
      if (building.constructionProgress < 1) return; // Nur fertige Gebäude

      const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
      if (!def.baseProduction) return; // Nur produzierende Gebäude

      const tileKey = hexToKey({ q: building.q, r: building.r });
      const tile = this.state.tiles.get(tileKey);
      if (!tile) return;

      const productionMultiplier = Math.pow(1.2, building.level - 1);
      const productionRates: any = {};

      // Berechne tatsächliche Produktionsraten
      if (def.baseProduction.wood) {
        const hasWoodResource = tile.resources.some(r => r.type === 'wood' && r.amount > 0);
        if (hasWoodResource) {
          productionRates.wood = def.baseProduction.wood * productionMultiplier;
        }
      }
      if (def.baseProduction.stone) {
        const hasStoneResource = tile.resources.some(r => r.type === 'stone' && r.amount > 0);
        if (hasStoneResource) {
          productionRates.stone = def.baseProduction.stone * productionMultiplier;
        }
      }
      if (def.baseProduction.iron) {
        const hasIronResource = tile.resources.some(r => r.type === 'iron' && r.amount > 0);
        if (hasIronResource) {
          productionRates.iron = def.baseProduction.iron * productionMultiplier;
        }
      }
      if (def.baseProduction.food) {
        const fertilityMultiplier = tile.fertility || 0.5;
        productionRates.food = def.baseProduction.food * productionMultiplier * fertilityMultiplier;
      }

      // Nur speichern wenn Produktion aktiv ist
      if (Object.keys(productionRates).length > 0) {
        savePromises.push(
          this.postgres.saveProductionState({
            buildingId: building.id,
            lastUpdateTime: now,
            productionRates
          })
        );
      }
    });

    await Promise.all(savePromises);
    console.log(`💾 Saved production state for ${savePromises.length} buildings of ${playerUsername}`);
  }

  /**
   * Stelle Produktion nach Offline-Zeit wieder her
   * Wird aufgerufen wenn Spieler sich einloggt
   */
  async restoreOfflineProduction(playerUsername: string): Promise<void> {
    const player = this.state.players.get(playerUsername);
    if (!player) {
      console.warn(`⚠️ Player ${playerUsername} not found for production restore`);
      return;
    }

    try {
      const productionStates = await this.postgres.getPlayerProductionStates(playerUsername);
      
      if (productionStates.length === 0) {
        console.log(`ℹ️ No production states found for ${playerUsername}`);
        return;
      }

      const now = Date.now();
      let totalProduced: ResourceDelta = { wood: 0, stone: 0, iron: 0, food: 0 };

      console.log(`🔄 Restoring offline production for ${playerUsername}: ${productionStates.length} buildings`);

      for (const prodState of productionStates) {
        const building = this.state.buildings.get(prodState.buildingId);
        if (!building) {
          // Gebäude existiert nicht mehr
          await this.postgres.deleteProductionState(prodState.buildingId);
          continue;
        }

        if (building.constructionProgress < 1) {
          // Gebäude noch im Bau
          continue;
        }

        const elapsedMs = now - prodState.lastUpdateTime;
        const elapsedSeconds = elapsedMs / 1000;

        console.log(`  ⏱️ Building ${building.type} (${building.id}): ${elapsedSeconds.toFixed(1)}s offline`);

        // Berechne produzierte Ressourcen
        const produced = this.calculateOfflineProduction(prodState, elapsedSeconds);
        
        // Addiere zur Gesamt-Produktion
        totalProduced.wood += produced.wood;
        totalProduced.stone += produced.stone;
        totalProduced.iron += produced.iron;
        totalProduced.food += produced.food;
      }

      // Wende Produktion auf Spieler an (respektiere Storage-Limits)
      player.wood = Math.min(player.wood + totalProduced.wood, player.storageWood);
      player.stone = Math.min(player.stone + totalProduced.stone, player.storageStone);
      player.iron = Math.min(player.iron + totalProduced.iron, player.storageIron);
      player.food = Math.min(player.food + totalProduced.food, player.storageFood);

      console.log(`✅ Offline production restored for ${playerUsername}:`);
      console.log(`   🪵 Wood: +${totalProduced.wood.toFixed(1)} (now: ${player.wood.toFixed(1)}/${player.storageWood})`);
      console.log(`   🪨 Stone: +${totalProduced.stone.toFixed(1)} (now: ${player.stone.toFixed(1)}/${player.storageStone})`);
      console.log(`   ⛏️ Iron: +${totalProduced.iron.toFixed(1)} (now: ${player.iron.toFixed(1)}/${player.storageIron})`);
      console.log(`   🌾 Food: +${totalProduced.food.toFixed(1)} (now: ${player.food.toFixed(1)}/${player.storageFood})`);

      // Aktualisiere Timestamps auf jetzt
      await this.saveProductionState(playerUsername);

    } catch (error) {
      console.error(`❌ Failed to restore offline production for ${playerUsername}:`, error);
    }
  }

  /**
   * Berechne was in der Offline-Zeit produziert wurde
   */
  private calculateOfflineProduction(
    prodState: { productionRates: any },
    elapsedSeconds: number
  ): ResourceDelta {
    const produced: ResourceDelta = { wood: 0, stone: 0, iron: 0, food: 0 };

    if (prodState.productionRates.wood) {
      produced.wood = prodState.productionRates.wood * elapsedSeconds;
    }
    if (prodState.productionRates.stone) {
      produced.stone = prodState.productionRates.stone * elapsedSeconds;
    }
    if (prodState.productionRates.iron) {
      produced.iron = prodState.productionRates.iron * elapsedSeconds;
    }
    if (prodState.productionRates.food) {
      produced.food = prodState.productionRates.food * elapsedSeconds;
    }

    return produced;
  }
}
