import { Client } from '@colyseus/core';
import { GameRoomState, BuildingState, PlayerState } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import { ProductionSystem } from '../systems/ProductionSystem.js';
import { BiomeConversionSystem } from '../systems/BiomeConversionSystem.js';
import {
  BUILDING_DEFINITIONS,
  BuildCommand,
  hexToKey
} from '@hex-kingdom/shared';

const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;

export class BuildingHandler {
  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager,
    private productionSystem: ProductionSystem,
    private getPlayerByClient: (client: Client) => PlayerState | undefined,
    private biomeConversionSystem?: BiomeConversionSystem,
    private calculateStorageCapacity?: (player: PlayerState) => void
  ) {}

  async handleBuild(client: Client, command: BuildCommand): Promise<void> {
    const player = this.getPlayerByClient(client);
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
    
    // 🔒 WICHTIG: Prüfe Tile Ownership - man darf nur auf eigenen Tiles bauen!
    // Prüfe zuerst im RAM (führend für aktive Session)
    const tileKey = hexToKey({ q: command.position.q, r: command.position.r });
    const tile = this.state.tiles.get(tileKey);
    
    if (!tile) {
      client.send('error', { message: 'Dieses Tile existiert nicht!' });
      return;
    }
    
    if (!tile.owner) {
      client.send('error', { message: 'Dieses Tile gehört niemandem. Claime es zuerst!' });
      return;
    }
    
    if (tile.owner !== player.username) {
      client.send('error', { message: 'Du kannst nur auf deinen eigenen Tiles bauen!' });
      return;
    }
    
    // Stelle sicher, dass die DB synchronisiert ist (für Persistenz)
    const dbOwner = await this.postgres.getTileOwner(command.position.q, command.position.r);
    if (!dbOwner || dbOwner !== player.username) {
      console.log(`⚠️ DB out of sync for tile (${command.position.q},${command.position.r}), syncing now...`);
      try {
        await this.postgres.claimTile(command.position.q, command.position.r, player.username);
      } catch (error) {
        // Tile könnte bereits geclaimt sein - das ist OK wenn der RAM-State stimmt
        console.log(`ℹ️ Could not claim tile in DB (already claimed or error):`, error);
      }
    }
    
    // Prüfe Anzahl der Gebäude auf diesem Tile
    const existingBuildings = Array.from(this.state.buildings.values()).filter(
      b => b.q === command.position.q && b.r === command.position.r
    );
    
    const MAX_BUILDINGS_PER_TILE = 10;
    if (existingBuildings.length >= MAX_BUILDINGS_PER_TILE) {
      client.send('error', { message: `Maximal ${MAX_BUILDINGS_PER_TILE} Gebäude pro Feld möglich` });
      return;
    }
    
    // Prüfe auch in der Datenbank
    const existingInDB = await this.postgres.getBuildingsAtPosition(command.position.q, command.position.r);
    if (existingInDB.length >= MAX_BUILDINGS_PER_TILE) {
      client.send('error', { message: `Maximal ${MAX_BUILDINGS_PER_TILE} Gebäude pro Feld möglich (DB)` });
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
      
      // Owner wird NICHT hier gesetzt - Tile muss vorher bereits geclaimt sein!
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
          
          // Initialisiere Production State für fertiggestelltes Gebäude
          this.productionSystem.saveProductionState(building.owner).catch(err => {
            console.error('Failed to save production state after building completion:', err);
          });
          
          // Recalculate storage capacity for owner
          if (this.calculateStorageCapacity) {
            const owner = this.state.players.get(building.owner);
            if (owner) {
              this.calculateStorageCapacity(owner);
            }
          }
          
          // Prüfe ob Tile zu Settlement konvertiert werden kann
          if (this.biomeConversionSystem) {
            console.log(`🔄 Checking biome conversion for tile (${building.q}, ${building.r}) after building completion`);
            this.biomeConversionSystem.checkSpecificTile(building.q, building.r).catch(err => {
              console.error(`❌ Failed to check biome conversion for tile (${building.q}, ${building.r}):`, err);
            });
          } else {
            console.warn(`⚠️ BiomeConversionSystem not available for tile (${building.q}, ${building.r})`);
          }
        } else {
          building.constructionProgress = Math.max(0, Math.min(1, elapsed / totalTime));
        }
      }
    });
  }
}
