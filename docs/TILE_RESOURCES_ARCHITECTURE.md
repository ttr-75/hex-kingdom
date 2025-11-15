# Tile Resources & Population Architecture

## Übersicht

Dynamische Verwaltung von Ressourcen und Population auf Tiles mit einem Zwei-Ebenen-System.

## Architektur

### 1. MongoDB (Statische Daten)
**Zweck:** Initiale Werte bei Map-Generierung

```typescript
// In chunks collection
{
  _id: "chunk_0_0",
  chunkX: 0,
  chunkY: 0,
  tiles: [{
    q: 5,
    r: 10,
    biome: "grassland",
    fertility: 0.7,
    resources: [
      { type: "wood", amount: 500 },
      { type: "stone", amount: 200 }
    ],
    population: 50  // Startwert
  }]
}
```

**Verwendung:**
- ✅ Bei World-Generierung
- ✅ Als Template für neue/unclaimed Tiles
- ❌ NICHT für Updates während des Spiels

### 2. PostgreSQL (Dynamische Daten)
**Zweck:** Laufende Änderungen während des Spiels

#### Tabelle: `tile_resources`
```sql
CREATE TABLE tile_resources (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  last_modified TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (q, r, resource_type)
);
```

#### Tabelle: `tile_population`
```sql
CREATE TABLE tile_population (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  population INTEGER NOT NULL DEFAULT 0,
  last_modified TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (q, r)
);
```

**Verwendung:**
- ✅ Nur für claimed/besiedelte Tiles
- ✅ Alle Produktions-Updates
- ✅ Alle Verbrauchs-Updates
- ✅ Population-Wachstum/-Verlust

## Workflow

### Tile wird beansprucht (claimed)

```typescript
// 1. Lade statische Daten aus MongoDB
const chunkData = await chunkManager.loadChunk(chunkX, chunkY);
const tileData = chunkData.tiles.find(t => t.q === q && t.r === r);

// 2. Migriere zu PostgreSQL
await tileDataManager.claimTile(q, r, playerUsername, {
  resources: tileData.resources,
  population: tileData.population
});

// Ab jetzt: PostgreSQL = Source of Truth
```

### Ressourcen-Update (Produktion/Verbrauch)

```typescript
// Holz sammeln (+100)
await tileRepository.adjustTileResource(q, r, 'wood', 100);

// Holz verbrauchen (-50)
await tileRepository.adjustTileResource(q, r, 'wood', -50);

// Alle Ressourcen eines Tiles holen
const resources = await tileRepository.getTileResources(q, r);
// => [{ type: 'wood', amount: 550 }, { type: 'stone', amount: 200 }]
```

### Population-Update

```typescript
// Bevölkerung wächst (+5)
await tileRepository.adjustTilePopulation(q, r, 5);

// Bevölkerung sinkt (-2)
await tileRepository.adjustTilePopulation(q, r, -2);

// Aktuelle Population abrufen
const pop = await tileRepository.getTilePopulation(q, r);
// => 53
```

### Tile-Besitzerwechsel (Eroberung)

```typescript
// Tile übernehmen
await tileDataManager.transferTile(q, r, newOwner, true);

// Was passiert:
// 1. tile_ownership.owner = newOwner
// 2. buildings.owner = newOwner (für alle Gebäude auf diesem Tile)
// 3. tile_resources: KEINE Änderung ✅
// 4. tile_population: KEINE Änderung ✅
```

## API-Referenz

### TileRepository

#### Ressourcen-Management
```typescript
// Setze alle Ressourcen (überschreibt)
await tileRepository.setTileResources(q, r, [
  { type: 'wood', amount: 500 },
  { type: 'stone', amount: 200 }
]);

// Hole alle Ressourcen
const resources = await tileRepository.getTileResources(q, r);

// Update einzelne Ressource (UPSERT)
await tileRepository.updateTileResource(q, r, 'wood', 600);

// Erhöhe/Verringere Ressource (Delta)
const newAmount = await tileRepository.adjustTileResource(q, r, 'wood', -50);

// Lösche alle Ressourcen
await tileRepository.clearTileResources(q, r);
```

#### Population-Management
```typescript
// Setze Population
await tileRepository.setTilePopulation(q, r, 100);

// Hole Population
const pop = await tileRepository.getTilePopulation(q, r);

// Erhöhe/Verringere (Delta)
const newPop = await tileRepository.adjustTilePopulation(q, r, 5);

// Gesamte Population eines Spielers
const totalPop = await tileRepository.getPlayerTotalPopulation(username);

// Lösche Population
await tileRepository.clearTilePopulation(q, r);
```

### TileDataManager

```typescript
// Tile beanspruchen (mit Migration)
await tileDataManager.claimTile(q, r, owner, {
  resources: [{ type: 'wood', amount: 500 }],
  population: 50
});

// Tile übertragen (mit Gebäuden)
await tileDataManager.transferTile(q, r, newOwner, true);
```

### BuildingRepository

```typescript
// Gebäude übertragen bei Tile-Eroberung
const count = await buildingRepository.transferBuildingsOnTile(q, r, newOwner);
```

## Performance-Überlegungen

### Vorteile PostgreSQL für dynamische Daten
1. **Transaktionen:** ACID-Garantien für Ressourcen-Updates
2. **Indizes:** Schnelle Abfragen nach Koordinaten
3. **Atomic Updates:** `adjustTileResource` ist thread-safe
4. **Aggregationen:** `getPlayerTotalPopulation` effizient

### MongoDB für statische Daten
1. **Chunk-basiert:** Große Bereiche schnell laden
2. **Schemalos:** Flexible Erweiterung möglich
3. **Read-Heavy:** Optimiert für Lesezugriffe

## Migration

### Neue Installation
```bash
npm run migrate:tile-resources
```

### Existierende Daten
Tiles werden automatisch migriert wenn sie beansprucht werden. Keine manuelle Migration nötig.

## Best Practices

### ✅ Do's
- PostgreSQL für alle Runtime-Updates
- MongoDB nur für initiale Werte lesen
- Batch-Updates wo möglich
- Transaktionen für kritische Operations

### ❌ Don'ts
- Nie MongoDB Chunks zur Laufzeit updaten
- Nicht zwischen MongoDB und PostgreSQL synchronisieren
- Keine manuellen Daten-Kopien zwischen DBs

## Beispiel: Production System Integration

```typescript
class ProductionSystem {
  async updateTileProduction(q: number, r: number, deltaSeconds: number) {
    // Hole Gebäude auf diesem Tile
    const buildings = await buildingRepository.getBuildingsAtPosition(q, r);
    
    for (const building of buildings) {
      if (building.type === 'sawmill') {
        // Produziere Holz
        await tileRepository.adjustTileResource(
          q, r, 
          'wood', 
          PRODUCTION_RATE * deltaSeconds
        );
      }
    }
    
    // Population-Wachstum
    const currentPop = await tileRepository.getTilePopulation(q, r);
    const growthRate = 0.001; // 0.1% pro Update
    const growth = Math.floor(currentPop * growthRate * deltaSeconds);
    
    if (growth > 0) {
      await tileRepository.adjustTilePopulation(q, r, growth);
    }
  }
}
```

## Zusammenfassung

| Feature | MongoDB | PostgreSQL |
|---------|---------|------------|
| **Zweck** | Statische Template-Daten | Dynamische Spiel-Daten |
| **Wann** | Bei Map-Generierung | Während des Spiels |
| **Updates** | Nie | Ständig |
| **Tiles** | Alle | Nur claimed |
| **Daten** | Terrain, Initial Resources | Resources, Population, Owner |
