# Hybrid Database System

## Konzept

Das Hybrid-System trennt **statische** und **dynamische** Tile-Daten in separate MongoDB Collections für optimale Performance.

### 🗺️ Statische Daten (Chunks Collection)
**Was:** Terrain, Ressourcen-Typ, Ressourcen-Menge  
**Warum:** Diese Daten ändern sich nie oder sehr selten  
**Struktur:** 16x16 Tiles pro Chunk-Dokument (256 Tiles)  
**Performance:** Bulk-Loading beim Viewport-Change

### 🔄 Dynamische Daten (TileDynamicData Collection)
**Was:** Owner (Spieler-Besitz), Building-Links  
**Warum:** Diese Daten ändern sich häufig  
**Struktur:** 1 Dokument pro Tile (nur wenn nötig!)  
**Performance:** Schnelle Partial Updates, keine großen Dokumente

## Vorteile

1. **Kleinere Chunk-Dokumente**
   - 16x16 statt 32x32 = 4x weniger Daten pro Update
   - Schnellere DB-Operationen

2. **Granulare Updates**
   - Owner-Change betrifft nur 1 kleines Dokument
   - Kein Re-Write von 256+ Tiles

3. **Speicher-Effizienz**
   - Nur ~5-10% der Tiles haben Owner/Buildings
   - Dynamische Collection bleibt klein

4. **Query-Performance**
   - Index auf `owner` → "Zeige alle Territorien von Spieler X"
   - Index auf `buildingId` → "Finde Tile mit Building Y"

## Nutzung

### Welt generieren
```bash
npm run generate-world
```
Erstellt nur statische Daten (Terrain, Ressourcen)

### Stats anzeigen
```bash
npm run db-stats
```
Zeigt Statistiken über beide Collections

### Im Code

**Tile-Besitz setzen:**
```typescript
// RAM-Update (sofort sichtbar)
tile.owner = playerId;

// DB-Update (async)
await tileDataManager.setTileOwner(q, r, playerId);
```

**Bulk-Operations:**
```typescript
// Erobere mehrere Tiles auf einmal
await tileDataManager.batchSetOwner(tiles, newOwner);
```

**Spieler-Territorium laden:**
```typescript
const tiles = await tileDataManager.getPlayerTiles(playerId);
```

## Performance-Zahlen

**Beispiel-Welt (100x100 Chunks):**
- Static Chunks: ~625 Chunks, ~40 KB/Chunk = **25 MB**
- Dynamic Data: ~5000 Tiles (nur besiedelt), ~200 Bytes/Tile = **1 MB**
- **Gesamt: 26 MB** (vs. 50+ MB ohne Hybrid-System)

**Update-Performance:**
- Owner-Change: 1 Query, ~1ms
- Building-Build: 2 Queries, ~2ms
- Territorium-Eroberung (100 Tiles): 1 Bulk-Query, ~10ms

## Migration

Falls du bereits eine Welt mit dem alten System hast:

1. Generiere die Welt neu: `npm run generate-world`
2. Owner-Daten gehen verloren (Spieler müssen neu starten)
3. Oder: Migration-Script schreiben, um Owner aus alten Chunks zu extrahieren

## Best Practices

1. **Immer RAM first**: Update erst `tile.owner` in RAM, dann async in DB
2. **Batch wo möglich**: Nutze `batchSetOwner` für mehrere Tiles
3. **Cleanup regelmäßig**: Verwaiste Einträge löschen mit Cleanup-Script
4. **Monitor Stats**: Regelmäßig `npm run db-stats` checken
