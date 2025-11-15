import { Client } from '@colyseus/core';
import { GameRoomState, UnitState, PlayerState } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { ExplorationSystem } from '../systems/ExplorationSystem.js';
import {
  UNIT_DEFINITIONS,
  BIOME_DEFINITIONS,
  MoveUnitCommand,
  HexCoord,
  findPath,
  hexToKey
} from '@hex-kingdom/shared';

export class UnitHandler {
  constructor(
    private state: GameRoomState,
    private postgres: PostgresManager,
    private movementSystem: MovementSystem,
    private explorationSystem: ExplorationSystem,
    private getPlayerByClient: (client: Client) => PlayerState | undefined
  ) {}

  async handleRecruitUnit(client: Client, command: any): Promise<void> {
    const player = this.getPlayerByClient(client);
    if (!player) return;

    const { buildingId, unitType } = command;
    
    const building = this.state.buildings.get(buildingId);
    if (!building || building.owner !== player.username) {
      client.send('error', { message: 'Gebäude nicht gefunden' });
      console.log(`❌ Building ${buildingId} not found or not owned by ${player.username}`);
      return;
    }

    if (building.type !== 'barracks') {
      client.send('error', { message: 'Nur Kasernen können Einheiten rekrutieren' });
      return;
    }

    if (building.constructionProgress < 1) {
      client.send('error', { message: 'Gebäude noch nicht fertig' });
      return;
    }

    const unitDef = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS];
    if (!unitDef) return;

    if (
      (unitDef.cost.wood && player.wood < unitDef.cost.wood) ||
      (unitDef.cost.stone && player.stone < (unitDef.cost.stone || 0)) ||
      (unitDef.cost.iron && player.iron < unitDef.cost.iron) ||
      (unitDef.cost.gold && player.gold < unitDef.cost.gold) ||
      (unitDef.cost.food && player.food < unitDef.cost.food)
    ) {
      client.send('error', { message: 'Nicht genug Ressourcen' });
      return;
    }

    if (unitDef.cost.wood) player.wood -= unitDef.cost.wood;
    if (unitDef.cost.stone) player.stone -= (unitDef.cost.stone || 0);
    if (unitDef.cost.iron) player.iron -= (unitDef.cost.iron || 0);
    if (unitDef.cost.gold) player.gold -= (unitDef.cost.gold || 0);
    if (unitDef.cost.food) player.food -= (unitDef.cost.food || 0);

    const unit = new UnitState();
    unit.id = `${player.username}_unit_${Date.now()}`;
    unit.type = unitType;
    unit.q = building.q;
    unit.r = building.r;
    unit.owner = player.username;
    unit.health = unitDef.health;

    this.state.units.set(unit.id, unit);

    await this.postgres.createUnit({
      id: unit.id,
      type: unit.type,
      q: unit.q,
      r: unit.r,
      owner: unit.owner,
      health: unit.health,
      movement_remaining: unitDef.movementRange
    });

    console.log(`🎖️ Unit rekrutiert: ${unitType} für ${player.username}`);
    
    await this.explorationSystem.handleUnitExploration(player.username, unit, unitDef);
  }

  async handleMoveUnit(client: Client, command: MoveUnitCommand): Promise<void> {
    console.log(`🎯 handleMoveUnit called: unitId=${command.unitId}, destination=(${command.destination.q},${command.destination.r})`);
    
    const player = this.getPlayerByClient(client);
    if (!player) return;

    const unit = this.state.units.get(command.unitId);
    if (!unit || unit.owner !== player.username) {
      client.send('error', { message: 'Einheit nicht gefunden' });
      return;
    }

    const unitDef = UNIT_DEFINITIONS[unit.type as keyof typeof UNIT_DEFINITIONS];
    if (!unitDef) return;

    if (this.movementSystem.hasMovingUnit(command.unitId)) {
      client.send('error', { message: 'Einheit bewegt sich bereits' });
      return;
    }

    const start: HexCoord = { q: unit.q, r: unit.r };
    const goal: HexCoord = command.destination;

    console.log(`🔍 Finding path from (${start.q},${start.r}) to (${goal.q},${goal.r})`);

    const isPassable = (coord: HexCoord): boolean => {
      const key = hexToKey(coord);
      const tile = this.state.tiles.get(key);
      if (!tile) return false;
      
      if (tile.owner && tile.owner !== player.username) return false;
      
      const biomeDef = BIOME_DEFINITIONS[tile.biome as keyof typeof BIOME_DEFINITIONS];
      return biomeDef && biomeDef.movementMultiplier > 0;
    };

    const path = findPath(start, goal, isPassable);
    
    console.log(`📍 Path result:`, path);
    
    if (!path || path.length === 0) {
      client.send('error', { message: 'Kein Weg zum Ziel gefunden' });
      return;
    }

    if (path.length < 2) {
      client.send('error', { message: 'Bereits am Ziel' });
      return;
    }

    await this.movementSystem.startMovement(command.unitId, path);

    // Send path to client for smooth animation with duration info
    const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;
    const pathWithDurations = path.map((p, index) => {
      if (index === 0) return { q: p.q, r: p.r, duration: 0 }; // Starting position
      
      const tileKey = hexToKey(p);
      const tile = this.state.tiles.get(tileKey);
      if (!tile) return { q: p.q, r: p.r, duration: 6000 }; // Default 6s
      
      const biomeDef = BIOME_DEFINITIONS[tile.biome as keyof typeof BIOME_DEFINITIONS];
      
      // Calculate duration (same formula as MovementSystem)
      const baseTime = 60000;
      const unitSpeed = unitDef.speedMultiplier || 1.0;
      const biomeSpeed = biomeDef.movementMultiplier || 1.0;
      const duration = (baseTime * unitSpeed * biomeSpeed) / TIME_MULTIPLIER;
      
      return { q: p.q, r: p.r, duration };
    });

    client.send('unitMovementStarted', {
      unitId: command.unitId,
      path: pathWithDurations,
      startTime: Date.now()
    });

    console.log(`🚶 Unit ${unit.type} started moving from (${unit.q},${unit.r}) to (${goal.q},${goal.r}) - ${path.length} tiles`);
  }

  handleCancelMovement(client: Client, command: { unitId: string }): void {
    const player = this.getPlayerByClient(client);
    if (!player) return;

    const unit = this.state.units.get(command.unitId);
    if (!unit || unit.owner !== player.username) {
      client.send('error', { message: 'Einheit nicht gefunden' });
      return;
    }

    this.movementSystem.cancelMovement(command.unitId);
  }
}
