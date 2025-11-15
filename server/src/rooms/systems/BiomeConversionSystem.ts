import { GameRoomState, HexTileState, TileResource } from '../GameRoomState.js';
import { PostgresManager } from '../../database/PostgresManager.js';
import {
    BiomeType,
    BIOME_DEFINITIONS,
    hexToKey
} from '@hex-kingdom/shared';
import { ArraySchema } from '@colyseus/schema';

/**
 * BiomeConversionSystem
 * 
 * Überwacht Tiles und konvertiert sie zu neuen Biomen wenn Kriterien erfüllt sind.
 * Beispiel: SETTLEMENT entsteht wenn genug Bevölkerung und Gebäude vorhanden sind.
 */
export class BiomeConversionSystem {
    // Prüfe alle X Sekunden
    private readonly CHECK_INTERVAL_MS = 30000; // 30 Sekunden
    private lastCheckTime = Date.now();

    constructor(
        private state: GameRoomState,
        private postgres: PostgresManager,
        private onBiomeChanged?: (tileOwner: string) => Promise<void>
    ) { }

    /**
     * Update-Loop: Prüfe periodisch ob Tiles konvertiert werden müssen
     */
    async update(): Promise<void> {
        const now = Date.now();

        if (now - this.lastCheckTime < this.CHECK_INTERVAL_MS) {
            return;
        }

        this.lastCheckTime = now;
        await this.checkAllTilesForConversion();
    }

    /**
     * Prüfe alle Tiles die einem Spieler gehören auf Konvertierung
     */
    private async checkAllTilesForConversion(): Promise<void> {
        // Prüfe nur Tiles die Spielern gehören
        const tilesWithOwners = Array.from(this.state.tiles.values()).filter(
            tile => tile.owner !== undefined && tile.owner !== ''
        );

        for (const tile of tilesWithOwners) {
            await this.checkTileForConversion(tile);
        }
    }

    /**
     * Prüfe ein einzelnes Tile ob es zu einem neuen Biom konvertiert werden kann
     */
    private async checkTileForConversion(tile: HexTileState): Promise<void> {
        // Aktuelles Biom
        const currentBiome = tile.biome;

        // Prüfe alle Biome die Konvertierungskriterien haben
        for (const [biomeType, biomeDef] of Object.entries(BIOME_DEFINITIONS)) {
            // Skip wenn kein Konvertierungskriterium vorhanden
            if (!biomeDef.conversionCriteria) continue;

            // Skip wenn bereits das Zielbiom
            if (currentBiome === biomeType) continue;

            // Prüfe ob Kriterien erfüllt sind
            if (await this.meetsConversionCriteria(tile, biomeDef.conversionCriteria)) {
                await this.convertTileToBiome(tile, biomeType as BiomeType);
                console.log(`🏘️ Tile (${tile.q}, ${tile.r}) converted to ${biomeType}`);
                break; // Nur eine Konvertierung pro Tile
            }
        }
    }

    /**
     * Prüfe ob ein Tile die Konvertierungskriterien erfüllt
     */
    private async meetsConversionCriteria(
        tile: HexTileState,
        criteria: NonNullable<typeof BIOME_DEFINITIONS[BiomeType]['conversionCriteria']>
    ): Promise<boolean> {
        // Zähle Gebäude auf diesem Tile
        const buildingsOnTile = Array.from(this.state.buildings.values()).filter(
            b => b.q === tile.q && b.r === tile.r && b.constructionProgress >= 1
        );

        // Debug-Logging
        const debug = false; // Setze auf true für detailliertes Logging
        if (debug) {
            console.log(`🔍 Checking conversion criteria for tile (${tile.q}, ${tile.r}):`);
            console.log(`   Buildings on tile: ${buildingsOnTile.length} (required: ${criteria.minBuildings || 0})`);
            console.log(`   Population: ${tile.population || 0} (required: ${criteria.minPopulation || 0})`);
        }

        // Prüfe Mindestanzahl Gebäude
        if (criteria.minBuildings !== undefined) {
            if (buildingsOnTile.length < criteria.minBuildings) {
                if (debug) console.log(`   ❌ Not enough buildings`);
                return false;
            }
        }

        // Prüfe erforderliche Gebäude-Typen
        if (criteria.requiredBuildingTypes && criteria.requiredBuildingTypes.length > 0) {
            const buildingTypes = buildingsOnTile.map(b => b.type);

            if (debug) {
                console.log(`   Building types present: ${buildingTypes.join(', ')}`);
                console.log(`   Required types: ${criteria.requiredBuildingTypes.join(', ')}`);
            }

            for (const requiredType of criteria.requiredBuildingTypes) {
                if (!buildingTypes.includes(requiredType)) {
                    if (debug) console.log(`   ❌ Missing required building type: ${requiredType}`);
                    return false;
                }
            }
        }

        // Prüfe Population
        if (criteria.minPopulation !== undefined) {
            const population = tile.population || 0;
            if (population < criteria.minPopulation) {
                if (debug) console.log(`   ❌ Not enough population`);
                return false;
            }
        }

        if (debug) console.log(`   ✅ All criteria met!`);
        return true;
    }

    /**
     * Konvertiere ein Tile zu einem neuen Biom
     */
    private async convertTileToBiome(tile: HexTileState, newBiome: BiomeType): Promise<void> {
        const oldBiome = tile.biome;
        const oldFertility = tile.fertility;

        // Update im RAM (Colyseus State)
        tile.biome = newBiome;

        // Update Biom-spezifische Eigenschaften
        const biomeDef = BIOME_DEFINITIONS[newBiome];
        if (biomeDef) {
            // Setze Fruchtbarkeit basierend auf neuem Biom
            // Verwende einen zufälligen Wert innerhalb des Biom-Bereichs
            const newFertility = biomeDef.fertility.min + 
                Math.random() * (biomeDef.fertility.max - biomeDef.fertility.min);
            tile.fertility = newFertility;
            
            // Für Settlement: Entferne natürliche Ressourcen
            if (newBiome === BiomeType.SETTLEMENT) {
                tile.resources = new ArraySchema<TileResource>(); // Entferne Ressourcen^
                tile.fertility = 0.0; // Setze Fruchtbarkeit auf 0
            }
        }

        // Update NUR in PostgreSQL (als Override für MongoDB)
        // MongoDB bleibt unverändert als statische Weltdaten
        try {
            await this.postgres.setTileBiome(tile.q, tile.r, newBiome);
            console.log(`✅ Tile (${tile.q}, ${tile.r}) biome override in PostgreSQL: ${oldBiome} -> ${newBiome}`);
            
            // Update Fruchtbarkeit in PostgreSQL
            if (tile.fertility !== undefined) {
                await this.postgres.setTileFertility(tile.q, tile.r, tile.fertility);
                console.log(`✅ Tile (${tile.q}, ${tile.r}) fertility updated in PostgreSQL: ${oldFertility?.toFixed(2)} -> ${tile.fertility.toFixed(2)}`);
            }
            
            // Update Ressourcen in PostgreSQL (konvertiere ArraySchema zu Array)
            const resourcesArray = Array.from(tile.resources)
                .filter(r => r !== undefined)
                .map(r => ({
                    type: r.type,
                    amount: r.amount
                }));
            await this.postgres.setTileResources(tile.q, tile.r, resourcesArray);
            console.log(`✅ Tile (${tile.q}, ${tile.r}) resources updated in PostgreSQL: ${resourcesArray.length} resources`);
        } catch (error) {
            console.error(`❌ Failed to update tile biome/fertility/resources in PostgreSQL:`, error);
        }

        // Optional: Spawne Population für Settlement
        if (newBiome === BiomeType.SETTLEMENT && biomeDef.populationSpawn) {
            const spawnAmount = Math.floor(
                Math.random() * (biomeDef.populationSpawn.amount.max - biomeDef.populationSpawn.amount.min + 1)
                + biomeDef.populationSpawn.amount.min
            );

            if (tile.population === undefined || tile.population === 0) {
                tile.population = spawnAmount;
                console.log(`👥 Settlement spawned ${spawnAmount} population on (${tile.q}, ${tile.r})`);
            }
        }

        // Trigger visibility update für den Tile-Besitzer
        if (tile.owner && this.onBiomeChanged) {
            try {
                await this.onBiomeChanged(tile.owner);
                console.log(`🔄 Visibility update triggered for ${tile.owner} after biome conversion`);
            } catch (error) {
                console.error(`❌ Failed to update visibility for ${tile.owner}:`, error);
            }
        }
    }

    /**
     * Manuell ein spezifisches Tile auf Konvertierung prüfen
     * (kann von Handlers aufgerufen werden wenn Gebäude gebaut werden)
     */
    async checkSpecificTile(q: number, r: number): Promise<void> {
        const tileKey = hexToKey({ q, r });
        const tile = this.state.tiles.get(tileKey);

        if (!tile) return;

        await this.checkTileForConversion(tile);
    }
}
