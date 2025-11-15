/**
 * Script zum Initialisieren der Production States für bestehende Gebäude
 * 
 * Dieses Script sollte einmalig nach dem Deployment der Offline-Produktion
 * ausgeführt werden, um für alle bestehenden fertiggestellten Gebäude
 * einen initialen Production State zu erstellen.
 */

import { PostgresManager } from '../database/PostgresManager.js';
import { ChunkManager } from '../database/ChunkManager.js';
import { BUILDING_DEFINITIONS } from '@hex-kingdom/shared';

async function main() {
  console.log('🔧 Initialisiere Production States für bestehende Gebäude...');

  const postgres = new PostgresManager();
  await postgres.connect();

  const chunkManager = new ChunkManager();
  await chunkManager.connect();

  try {
    // Hole alle Spieler
    const players = await postgres.getAllPlayers();
    console.log(`📊 Gefunden: ${players.length} Spieler`);

    const now = Date.now();
    let totalBuildings = 0;
    let totalProducingBuildings = 0;

    for (const player of players) {
      console.log(`\n🔍 Verarbeite Spieler: ${player.username}`);
      
      // Hole alle Gebäude des Spielers
      const buildings = await postgres.getPlayerBuildings(player.username);
      console.log(`  📦 ${buildings.length} Gebäude gefunden`);
      totalBuildings += buildings.length;

      for (const building of buildings) {
        // Nur fertiggestellte Gebäude
        if (!building.completed_at) {
          console.log(`  ⏳ Gebäude ${building.id} (${building.type}) noch im Bau - überspringe`);
          continue;
        }

        const def = BUILDING_DEFINITIONS[building.type as keyof typeof BUILDING_DEFINITIONS];
        if (!def || !def.baseProduction) {
          console.log(`  ℹ️ Gebäude ${building.id} (${building.type}) produziert nicht - überspringe`);
          continue;
        }

        // Lade Tile-Daten für Ressourcen-Check
        const { chunkX, chunkY } = chunkManager.getChunkCoords(building.q, building.r);
        await chunkManager.loadChunk(chunkX, chunkY);
        const tile = await chunkManager.getTile(building.q, building.r);

        if (!tile) {
          console.warn(`  ⚠️ Tile (${building.q}, ${building.r}) nicht gefunden für Gebäude ${building.id}`);
          continue;
        }

        const productionMultiplier = Math.pow(1.2, building.level - 1);
        const productionRates: any = {};

        // Berechne Produktionsraten basierend auf Tile-Ressourcen
        if (def.baseProduction.wood) {
          const hasWoodResource = tile.resources?.some((r: any) => r.type === 'wood' && r.amount > 0);
          if (hasWoodResource) {
            productionRates.wood = def.baseProduction.wood * productionMultiplier;
          }
        }

        if (def.baseProduction.stone) {
          const hasStoneResource = tile.resources?.some((r: any) => r.type === 'stone' && r.amount > 0);
          if (hasStoneResource) {
            productionRates.stone = def.baseProduction.stone * productionMultiplier;
          }
        }

        if (def.baseProduction.iron) {
          const hasIronResource = tile.resources?.some((r: any) => r.type === 'iron' && r.amount > 0);
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
          await postgres.saveProductionState({
            buildingId: building.id,
            lastUpdateTime: now,
            productionRates
          });

          totalProducingBuildings++;
          console.log(`  ✅ Production State für ${building.type} (Level ${building.level}) erstellt:`, productionRates);
        } else {
          console.log(`  ℹ️ Gebäude ${building.type} auf Tile ohne passende Ressourcen`);
        }
      }
    }

    console.log('\n📊 Zusammenfassung:');
    console.log(`   Spieler: ${players.length}`);
    console.log(`   Gebäude gesamt: ${totalBuildings}`);
    console.log(`   Produzierende Gebäude: ${totalProducingBuildings}`);
    console.log('\n✅ Production States erfolgreich initialisiert!');

  } catch (error) {
    console.error('❌ Fehler beim Initialisieren der Production States:', error);
    process.exit(1);
  } finally {
    await postgres.disconnect();
    await chunkManager.disconnect();
  }

  process.exit(0);
}

main().catch(console.error);
