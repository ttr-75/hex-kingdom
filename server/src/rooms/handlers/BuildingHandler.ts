import { Client } from '@colyseus/core';
import { GameRoomState, BuildingState } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import {
  BUILDING_DEFINITIONS,
  BuildCommand,
  hexToKey
} from '@hex-kingdom/shared';

const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;

export class BuildingHandler {
  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager
  ) {}

  async handleBuild(client: Client, command: BuildCommand): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    
    try {
      const dbPlayer = await this.postgres.getPlayer(player.username);
      if (!dbPlayer) {
        console.error(`❌ Player ${player.username} not found in PostgreSQL, creating now...`);
        await this.postgres.createPlayer(player.username, player.color);
        console.log(`✅ Player ${player.username} created in PostgreSQL`);
      }
    } catch (error) {
      console.error(`❌ Failed to verify/create player in PostgreSQL:`, error);
      client.send('error', { message: 'Datenbankfehler beim Erstellen des Spielers' });
      return;
    }
    
    const def = BUILDING_DEFINITIONS[command.buildingType];
    if (!def) return;
    
    if (
      (def.baseCost.wood && player.wood < def.baseCost.wood) ||
      (def.baseCost.stone && player.stone < def.baseCost.stone) ||
      (def.baseCost.iron && player.iron < def.baseCost.iron) ||
      (def.baseCost.gold && player.gold < def.baseCost.gold)
    ) {
      client.send('error', { message: 'Nicht genug Ressourcen' });
      return;
    }
    
    const tileKey = hexToKey(command.position);
    const existingBuilding = Array.from(this.state.buildings.values()).find(
      b => b.q === command.position.q && b.r === command.position.r
    );
    
    if (existingBuilding) {
      client.send('error', { message: 'Feld bereits bebaut' });
      return;
    }
    
    const existingInDB = await this.postgres.getBuildingAtPosition(command.position.q, command.position.r);
    if (existingInDB) {
      client.send('error', { message: 'Feld bereits bebaut (in DB)' });
      return;
    }
    
    if (def.baseCost.wood) player.wood -= def.baseCost.wood;
    if (def.baseCost.stone) player.stone -= def.baseCost.stone;
    if (def.baseCost.iron) player.iron -= def.baseCost.iron;
    if (def.baseCost.gold) player.gold -= def.baseCost.gold;
    
    const building = new BuildingState();
    building.id = `${player.username}_${Date.now()}`;
    building.type = command.buildingType;
    building.q = command.position.q;
    building.r = command.position.r;
    building.owner = player.username;
    building.level = 1;
    building.constructionStartTime = Date.now();
    building.constructionEndTime = Date.now() + ((def.constructionTime * 1000) / TIME_MULTIPLIER);
    building.constructionProgress = 0;
    
    console.log(`🏗️ Building started: ${command.buildingType} at (${command.position.q}, ${command.position.r}), will finish at ${new Date(building.constructionEndTime).toLocaleString()}`);
    
    try {
      await this.postgres.buildBuildingTransaction(
        player.username,
        {
          id: building.id,
          type: building.type,
          q: building.q,
          r: building.r,
          owner: building.owner,
          level: building.level,
          construction_start_time: building.constructionStartTime,
          construction_end_time: building.constructionEndTime
        },
        def.baseCost
      );
      
      console.log(`✅ Building ${building.id} saved to DB successfully`);
      
      this.state.buildings.set(building.id, building);
      
      const tile = this.state.tiles.get(tileKey);
      if (tile) {
        tile.owner = player.username;
      }
    } catch (err) {
      console.error('❌ Failed to save building to DB:', err);
      
      if (def.baseCost.wood) player.wood += def.baseCost.wood;
      if (def.baseCost.stone) player.stone += def.baseCost.stone;
      if (def.baseCost.iron) player.iron += def.baseCost.iron;
      if (def.baseCost.gold) player.gold += def.baseCost.gold;
      
      client.send('error', { message: 'Fehler beim Speichern des Gebäudes' });
    }
  }

  updateConstruction(broadcast: (type: string, message: any) => void): void {
    const now = Date.now();
    
    this.state.buildings.forEach((building) => {
      if (building.constructionProgress >= 1) return;
      
      if (building.constructionEndTime > 0 && building.constructionStartTime > 0) {
        const totalTime = building.constructionEndTime - building.constructionStartTime;
        const elapsed = now - building.constructionStartTime;
        
        if (now >= building.constructionEndTime) {
          building.constructionProgress = 1;
          console.log(`✅ Building completed: ${building.type} at (${building.q}, ${building.r})`);
          
          broadcast('buildingCompleted', {
            buildingId: building.id,
            owner: building.owner
          });
          
          this.postgres.completeBuilding(building.id).catch(err => {
            console.error('Failed to persist building completion:', err);
          });
        } else {
          building.constructionProgress = Math.max(0, Math.min(1, elapsed / totalTime));
        }
      }
    });
  }
}
