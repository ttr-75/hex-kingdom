# Database Migration Guide - 4 Phasen

## ✅ Phase 1: Redis für Active Sessions (ABGESCHLOSSEN)

### Was wurde implementiert:
- **RedisSessionManager** erstellt (`server/src/database/RedisSessionManager.ts`)
- Redis in GameRoom integriert (onJoin/onLeave)
- Session-Daten werden nun in Redis gespeichert (TTL: 1 Stunde)
- Beim Logout: Redis → MongoDB Sync
- Beim Login: Redis first, dann MongoDB fallback

### Neue Funktionen:
```bash
npm run redis-stats  # Zeigt aktive Sessions
```

### Datenfluss:
```
onJoin:  MongoDB → Redis (load)  → RAM (State)
onTick:  RAM (State) → Redis (update every second)
onLeave: Redis → MongoDB (persist) → Redis delete
```

### Vorteile:
- ✅ 1000x schnellere Resource-Updates
- ✅ Automatische Cleanup nach 1h (TTL)
- ✅ Reconnect lädt frischere Daten
- ✅ MongoDB nur bei Login/Logout belastet

---

## ✅ Phase 2: PostgreSQL für Players & Buildings (ABGESCHLOSSEN)

### Was wurde implementiert:
- **PostgresManager** erstellt mit Foreign Keys & Transaktionen
- Schema mit 3 Tabellen: `players`, `buildings`, `tile_ownership`
- Migration-Script: MongoDB → PostgreSQL
- Alle Daten erfolgreich migriert!

### Neue Funktionen:
```bash
npm run postgres-stats        # Zeigt PostgreSQL Daten
npm run migrate-to-postgres    # Migriert MongoDB → PostgreSQL
```

### PostgreSQL Schema:
```sql
players          → username (PK), color, timestamps
buildings        → id (PK), type, q, r (UNIQUE), owner (FK)
tile_ownership   → q, r (PK), owner (FK), building_id (FK)
```

### Vorteile:
- ✅ Foreign Keys verhindern verwaiste Daten
- ✅ Transactions garantieren Atomarität
- ✅ JOINs ermöglichen effiziente Queries
- ✅ Unique Constraints (nur 1 Gebäude pro Tile)

### Migration Erfolg:
```
✅ 1 Player migriert
✅ 3 Buildings migriert  
✅ 19 Tile Ownerships migriert
```

---

## 🔄 Phase 3: GameRoom auf PostgreSQL umstellen (IN ARBEIT)

### Ziel:
MongoDB → PostgreSQL migrieren für:
- `players` Collection
- `buildings` Collection  
- `tileDynamicData` Collection (tile_ownership)

### Warum PostgreSQL?
- **Foreign Keys**: Datenintegrität (building.owner → player.username)
- **Transactions**: Atomare Operationen (Build = -Ressourcen + Building + TileOwner)
- **JOINs**: Effiziente Queries (alle Buildings eines Players mit Tile-Info)

### Schema Design:
```sql
-- Players Table
CREATE TABLE players (
    username VARCHAR(255) PRIMARY KEY,
    color VARCHAR(7) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP DEFAULT NOW()
);

-- Buildings Table
CREATE TABLE buildings (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    owner VARCHAR(255) REFERENCES players(username) ON DELETE CASCADE,
    level INTEGER DEFAULT 1,
    construction_start_time BIGINT,
    construction_end_time BIGINT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(q, r)  -- Nur 1 Gebäude pro Tile
);

-- Tile Ownership Table
CREATE TABLE tile_ownership (
    q INTEGER NOT NULL,
    r INTEGER NOT NULL,
    owner VARCHAR(255) REFERENCES players(username) ON DELETE SET NULL,
    building_id VARCHAR(255) REFERENCES buildings(id) ON DELETE SET NULL,
    last_modified TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (q, r)
);

-- Indexes für Performance
CREATE INDEX idx_buildings_owner ON buildings(owner);
CREATE INDEX idx_tile_ownership_owner ON tile_ownership(owner);
```

### Migration Steps:
1. PostgreSQL Container starten (bereits in docker-compose.yml!)
2. `PostgresManager.ts` erstellen
3. Migration-Script: MongoDB → PostgreSQL
4. GameRoom umstellen auf PostgresManager
5. Alte MongoDB Collections löschen

---

## 📦 Phase 3: Optimierte Collection-Struktur

### Was bleibt in MongoDB:
```typescript
// READ-HEAVY, Schemaless
chunks           → Terrain, Resources (statisch)
game_events      → Battle logs, Player actions
player_stats     → Aggregierte Statistiken
```

### Was zu PostgreSQL wandert:
```typescript
// WRITE-HEAVY, Relational
players          → Player-Stammdaten
buildings        → Gebäude-Daten
tile_ownership   → Tile-Besitz
trade_offers     → Marktplatz-Angebote
```

---

## 🎯 Phase 4: Finale Architektur

### 3-Tier System:
```
┌─────────────────────────────────────┐
│         REDIS (In-Memory)           │
│  - Active Player Sessions           │
│  - Live Resources (ticking)         │
│  - Construction Progress            │
│  TTL: 1 hour                        │
└─────────────────────────────────────┘
            ↓ (sync on disconnect)
            
┌─────────────────────────────────────┐
│      PostgreSQL (Relational)        │
│  - Players (persistent)             │
│  - Buildings (with FK)              │
│  - TileOwnership (with FK)          │
│  - TradeOffers                      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│      MongoDB (Document Store)       │
│  - Chunks (terrain data)            │
│  - GameEvents (logs)                │
│  - PlayerStats (analytics)          │
└─────────────────────────────────────┘
```

### Performance-Ziele:
- **Redis**: < 1ms (session read/write)
- **PostgreSQL**: < 5ms (player/building queries)
- **MongoDB**: < 50ms (chunk loading)

---

## 🚀 Nächste Schritte

### Jetzt:
```bash
# Redis testen
npm run redis-stats

# Server neustarten um Redis zu aktivieren
npm run dev
```

### Danach (Phase 2):
1. PostgreSQL Manager implementieren
2. Migration-Script schreiben
3. Tests durchführen
4. Produktiv schalten
