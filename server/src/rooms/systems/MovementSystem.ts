import { GameRoomState } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import {
  UNIT_DEFINITIONS,
  BIOME_DEFINITIONS,
  hexToKey,
  HexCoord
} from '@hex-kingdom/shared';

const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;

export interface MovingUnit {
  unitId: string;
  path: HexCoord[];
  currentTileIndex: number;
  startTime: number;
  tileStartTime: number;
  tileDuration: number;
}

export class MovementSystem {
  private movingUnits: Map<string, MovingUnit> = new Map();

  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager,
    private onExploration: (playerUsername: string, unit: any, unitDef: any) => Promise<void>,
    private onVisibilityUpdate: (playerUsername: string) => Promise<void>
  ) {}

  getMovingUnits(): Map<string, MovingUnit> {
    return this.movingUnits;
  }

  hasMovingUnit(unitId: string): boolean {
    return this.movingUnits.has(unitId);
  }

  async startMovement(unitId: string, path: HexCoord[]): Promise<void> {
    const unit = this.state.units.get(unitId);
    if (!unit) return;

    const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
    if (!unitDef) return;

    // Calculate time for first move
    const firstMoveTile = path[1];
    const firstTileKey = hexToKey(firstMoveTile);
    const firstTileState = this.state.tiles.get(firstTileKey);
    
    if (!firstTileState) return;

    const firstBiomeDef = BIOME_DEFINITIONS[firstTileState.biome as keyof typeof BIOME_DEFINITIONS];
    const firstTileDuration = this.calculateTileMovementTime(unitDef, firstBiomeDef);

    const now = Date.now();
    const movement: MovingUnit = {
      unitId,
      path,
      currentTileIndex: 1,
      startTime: now,
      tileStartTime: now,
      tileDuration: firstTileDuration
    };

    this.movingUnits.set(unitId, movement);
    unit.isMoving = true;

    // Persist to database
    await this.postgres.saveUnitMovement(movement)
      .then(() => console.log(`💾 Movement saved to DB for unit ${unitId}`))
      .catch(err => console.error(`❌ Failed to save movement to DB:`, err));
  }

  cancelMovement(unitId: string): void {
    const unit = this.state.units.get(unitId);
    if (!unit) return;

    if (this.movingUnits.has(unitId)) {
      this.movingUnits.delete(unitId);
      unit.isMoving = false;
      this.postgres.deleteUnitMovement(unitId).catch(console.error);
      console.log(`⏹️ Movement cancelled for unit ${unit.type}`);
    }
  }

  async updateMovements(now: number): Promise<void> {
    const toRemove: string[] = [];
    
    for (const [unitId, movement] of this.movingUnits) {
      const unit = this.state.units.get(unitId);
      if (!unit) {
        toRemove.push(unitId);
        continue;
      }

      const elapsed = now - movement.tileStartTime;
      
      if (elapsed >= movement.tileDuration) {
        const nextTile = movement.path[movement.currentTileIndex];
        
        unit.q = nextTile.q;
        unit.r = nextTile.r;
        
        console.log(`📍 Unit ${unit.type} reached tile (${nextTile.q},${nextTile.r})`);
        
        // Trigger exploration
        const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
        if (unitDef) {
          await this.onExploration(unit.owner, unit, unitDef);
        }
        
        await this.onVisibilityUpdate(unit.owner);
        
        // Check if journey complete
        if (movement.currentTileIndex >= movement.path.length - 1) {
          toRemove.push(unitId);
          unit.isMoving = false;
          console.log(`✅ Unit ${unit.type} completed movement to (${nextTile.q},${nextTile.r})`);
          
          await this.postgres.moveUnit(unitId, unit.q, unit.r, 0);
          await this.postgres.deleteUnitMovement(unitId);
        } else {
          // Advance to next tile
          movement.currentTileIndex++;
          const nextTargetTile = movement.path[movement.currentTileIndex];
          const tileKey = hexToKey(nextTargetTile);
          const tileState = this.state.tiles.get(tileKey);
          
          if (tileState) {
            const biomeDef = BIOME_DEFINITIONS[tileState.biome as keyof typeof BIOME_DEFINITIONS];
            const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
            
            movement.tileStartTime = now;
            movement.tileDuration = this.calculateTileMovementTime(unitDef, biomeDef);
            
            await this.postgres.saveUnitMovement(movement)
              .then(() => console.log(`💾 Movement updated in DB for tile ${movement.currentTileIndex}`))
              .catch(err => console.error(`❌ Failed to update movement in DB:`, err));
          } else {
            toRemove.push(unitId);
            console.error(`❌ Unit ${unit.type} reached invalid tile, stopping`);
          }
        }
      }
    }
    
    toRemove.forEach(id => this.movingUnits.delete(id));
  }

  async restorePlayerMovements(playerUsername: string): Promise<void> {
    try {
      const movements = await this.postgres.getActiveMovements();
      const playerMovements = movements.filter(m => {
        const unit = this.state.units.get(m.unitId);
        return unit && unit.owner === playerUsername;
      });
      
      console.log(`🔄 Restoring ${playerMovements.length} active movements for ${playerUsername}`);
      
      const now = Date.now();
      
      for (const movement of playerMovements) {
        const unit = this.state.units.get(movement.unitId);
        if (!unit) {
          await this.postgres.deleteUnitMovement(movement.unitId);
          continue;
        }
        
        const elapsedSinceLastTile = now - movement.tileStartTime;
        console.log(`  ⏱️ Unit ${movement.unitId}: ${elapsedSinceLastTile}ms elapsed, tile duration: ${movement.tileDuration}ms`);
        
        let currentIndex = movement.currentTileIndex;
        let remainingTime = elapsedSinceLastTile;
        let currentTileDuration = movement.tileDuration;
        
        while (remainingTime >= currentTileDuration && currentIndex < movement.path.length - 1) {
          remainingTime -= currentTileDuration;
          currentIndex++;
          
          const nextTile = movement.path[currentIndex];
          unit.q = nextTile.q;
          unit.r = nextTile.r;
          
          console.log(`  🚀 Fast-forwarded unit to tile ${currentIndex}: (${nextTile.q},${nextTile.r})`);
          
          const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
          if (unitDef) {
            await this.onExploration(unit.owner, unit, unitDef);
          }
          
          if (currentIndex >= movement.path.length - 1) {
            console.log(`  ✅ Unit ${unit.type} completed movement during offline time`);
            unit.isMoving = false;
            await this.postgres.moveUnit(movement.unitId, unit.q, unit.r, 0);
            await this.postgres.deleteUnitMovement(movement.unitId);
            await this.onVisibilityUpdate(unit.owner);
            return;
          }
          
          const nextTargetTile = movement.path[currentIndex];
          const tileKey = hexToKey(nextTargetTile);
          const tileState = this.state.tiles.get(tileKey);
          
          if (tileState) {
            const biomeDef = BIOME_DEFINITIONS[tileState.biome as keyof typeof BIOME_DEFINITIONS];
            const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
            currentTileDuration = this.calculateTileMovementTime(unitDef, biomeDef);
          } else {
            console.error(`  ❌ Invalid tile at index ${currentIndex}, stopping movement`);
            await this.postgres.deleteUnitMovement(movement.unitId);
            return;
          }
        }
        
        movement.currentTileIndex = currentIndex;
        movement.tileStartTime = now - remainingTime;
        movement.tileDuration = currentTileDuration;
        
        this.movingUnits.set(movement.unitId, movement);
        unit.isMoving = true;
        
        await this.postgres.saveUnitMovement(movement);
        console.log(`  ✅ Restored movement for unit ${movement.unitId}: tile ${movement.currentTileIndex}/${movement.path.length}, ${remainingTime}ms into current tile`);
        
        await this.onVisibilityUpdate(unit.owner);
      }
    } catch (error) {
      console.error(`❌ Failed to restore movements for ${playerUsername}:`, error);
    }
  }

  calculateTileMovementTime(unitDef: any, biomeDef: any): number {
    const baseTime = 60000;
    const unitSpeed = unitDef.speedMultiplier || 1.0;
    const biomeSpeed = biomeDef.movementMultiplier || 1.0;
    const totalTime = (baseTime * unitSpeed * biomeSpeed) / TIME_MULTIPLIER;
    
    console.log(`⏱️ Movement time: ${baseTime}ms base × ${unitSpeed} unit × ${biomeSpeed} biome ÷ ${TIME_MULTIPLIER}x = ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
    return totalTime;
  }
}
