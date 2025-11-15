# Offline-Produktion System

## 📋 Übersicht

Das Offline-Produktion System ermöglicht es, dass Gebäude auch dann produzieren, wenn der Spieler nicht eingeloggt ist. Beim nächsten Login werden alle Ressourcen nachträglich berechnet und dem Spieler gutgeschrieben.

## 🏗️ Architektur

### Datenbank-Schema

Neue Tabelle: `building_production`
```sql
CREATE TABLE building_production (
  building_id VARCHAR(255) PRIMARY KEY,
  last_update_time BIGINT NOT NULL,
  production_rates JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_production_building FOREIGN KEY (building_id)
    REFERENCES buildings(id) ON DELETE CASCADE
)
```

**Felder:**
- `building_id`: Referenz zum Gebäude
- `last_update_time`: Timestamp des letzten Updates (ms)
- `production_rates`: JSON mit Produktionsraten pro Sekunde `{wood: 5.2, stone: 3.1, ...}`

### Komponenten

#### 1. BuildingRepository (`src/database/repositories/BuildingRepository.ts`)
Neue Methoden:
- `saveProductionState(state)` - Speichert Production State
- `getPlayerProductionStates(owner)` - Lädt alle Production States eines Spielers
- `getProductionState(buildingId)` - Lädt Production State eines Gebäudes
- `deleteProductionState(buildingId)` - Löscht Production State
- `updateProductionTimestamps(buildingIds, timestamp)` - Batch-Update für Timestamps

#### 2. ProductionSystem (`src/rooms/systems/ProductionSystem.ts`)
Neue Methoden:
- `saveProductionState(playerUsername)` - Speichert aktuellen Produktionszustand
- `restoreOfflineProduction(playerUsername)` - Berechnet und gibt Offline-Produktion aus
- `calculateOfflineProduction(prodState, elapsedSeconds)` - Berechnet produzierte Ressourcen

**Logik:**
1. Beim Logout: Speichere aktuelle Produktionsraten + Timestamp
2. Beim Login: 
   - Berechne vergangene Zeit: `elapsed = now - last_update_time`
   - Multipliziere Produktionsraten mit elapsed Zeit
   - Addiere zu Spieler-Ressourcen (respektiere Storage-Limits)
   - Aktualisiere Timestamp auf jetzt

#### 3. GameRoom Integration (`src/rooms/GameRoom.ts`)
- `onCreate`: ProductionSystem erhält postgres-Referenz
- `onJoin`: Ruft `restoreOfflineProduction()` auf
- `onLeave`: Ruft `saveProductionState()` auf

## 🚀 Verwendung

### Initial-Setup (für bestehende Gebäude)

Nach dem Deployment der Änderungen:
```bash
npm run init:production-states
```

Dieses Script:
- Lädt alle bestehenden Gebäude aus PostgreSQL
- Berechnet deren Produktionsraten basierend auf Tile-Ressourcen
- Erstellt initiale Production States in `building_production`

### Normale Verwendung

**Automatisch beim Spieler-Login:**
```typescript
// GameRoom.onJoin
await this.productionSystem.restoreOfflineProduction(playerUsername);
```

**Automatisch beim Spieler-Logout:**
```typescript
// GameRoom.onLeave
await this.productionSystem.saveProductionState(playerUsername);
```

### Manuelles Speichern (bei wichtigen Events)

```typescript
// Nach Gebäude-Fertigstellung
await this.productionSystem.saveProductionState(playerUsername);

// Nach Gebäude-Upgrade
await this.productionSystem.saveProductionState(playerUsername);
```

## 📊 Beispiel-Berechnung

**Szenario:**
- Spieler hat Sawmill (Level 1) auf Tile mit Holz-Ressource
- Base Production: 5 wood/s
- Produktionsmultiplikator: 1.0 (Level 1)
- **Produktionsrate: 5 wood/s**

**Offline-Zeit: 2 Stunden (7200 Sekunden)**

Bei Login:
```
Produziertes Holz = 5 wood/s × 7200s = 36,000 wood
Nach Storage-Limit: min(36000, storage_capacity)
```

## 🔍 Debugging

### Tabellen prüfen
```bash
npm run check:tables
```

### PostgreSQL Stats
```bash
npm run postgres-stats
```

### Production States anzeigen
```sql
SELECT 
  bp.building_id,
  b.type,
  b.owner,
  bp.production_rates,
  bp.last_update_time,
  EXTRACT(EPOCH FROM (NOW() - TO_TIMESTAMP(bp.last_update_time/1000))) as hours_offline
FROM building_production bp
JOIN buildings b ON bp.building_id = b.id
ORDER BY b.owner, b.type;
```

## ⚠️ Wichtige Hinweise

1. **Storage-Limits werden respektiert**: Produktion stoppt, wenn Storage voll ist
2. **Nur fertige Gebäude produzieren**: `construction_progress >= 1`
3. **Ressourcen müssen auf Tile vorhanden sein**: Wood-Produktion nur auf Tiles mit Wood-Ressource
4. **Automatische Cleanup**: Production States werden gelöscht wenn Gebäude gelöscht wird (CASCADE)

## 🔄 Workflow

```
Spieler logout → saveProductionState()
    ↓
Zeit vergeht (offline)
    ↓
Spieler login → restoreOfflineProduction()
    ↓
Berechne: resources = production_rate × elapsed_time
    ↓
Addiere zu Spieler-Ressourcen (mit Storage-Limit)
    ↓
Update last_update_time = now
```

## 🎯 Vorteile

✅ Spieler werden nicht bestraft fürs Offline-Sein
✅ Ressourcen akkumulieren auch bei Server-Neustart
✅ Analog zum bewährten Movement-System
✅ Effizient: Nur aktive produzierende Gebäude gespeichert
✅ Respektiert alle Game-Rules (Storage-Limits, Ressourcen-Verfügbarkeit)

## 📝 Testing

1. Baue ein produzierendes Gebäude (Sawmill auf Wald-Tile)
2. Warte bis Gebäude fertig ist
3. Logout (Production State wird gespeichert)
4. Warte einige Minuten (oder ändere DB-Timestamp manuell)
5. Login (Offline-Produktion wird berechnet)
6. Prüfe Ressourcen-Anzeige → sollte erhöht sein

### Manuelle Timestamp-Manipulation (für schnelles Testing):
```sql
-- Simuliere 1 Stunde Offline-Zeit
UPDATE building_production 
SET last_update_time = EXTRACT(EPOCH FROM (NOW() - INTERVAL '1 hour')) * 1000
WHERE building_id IN (
  SELECT id FROM buildings WHERE owner = 'admin'
);
```

## 🔧 Scripts

| Command | Beschreibung |
|---------|-------------|
| `npm run init:production-states` | Initialisiere Production States für bestehende Gebäude |
| `npm run check:tables` | Prüfe ob alle Tabellen existieren |
| `npm run postgres-stats` | Zeige PostgreSQL Statistiken |

## 🐛 Troubleshooting

**Problem: Production States werden nicht erstellt**
- Prüfe ob Gebäude fertiggestellt ist (`completed_at` gesetzt)
- Prüfe ob Gebäude Produktion hat (nicht alle Gebäude produzieren)
- Prüfe ob Tile entsprechende Ressource hat

**Problem: Offline-Produktion wird nicht angewendet**
- Prüfe Server-Logs beim Login
- Prüfe ob Production State in DB existiert
- Prüfe ob `last_update_time` korrekt gesetzt ist

**Problem: Ressourcen über Storage-Limit**
- Sollte nicht passieren - Storage-Limits werden in `restoreOfflineProduction()` respektiert
- Prüfe `Math.min(current + produced, storageLimit)` Logik
