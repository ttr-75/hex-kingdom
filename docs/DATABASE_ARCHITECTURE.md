# Datenbank-Architektur: Hex Kingdom

## Übersicht

Hex Kingdom verwendet eine **3-Tier Datenbank-Architektur** für optimale Performance und Datenpersistenz:

```
┌─────────────────────────────────────────────────────────────┐
│                     GAME SERVER (RAM)                       │
│              Colyseus Room State (live game)                │
└─────────────────────────────────────────────────────────────┘
                            ▲ ▼
┌─────────────────────────────────────────────────────────────┐
│                    🔴 REDIS (In-Memory)                     │
│                  Führende DB im Live-Betrieb                │
│           TTL: 1 Stunde | < 1ms Read/Write                  │
└─────────────────────────────────────────────────────────────┘
                            ▲ ▼
┌─────────────────────────────────────────────────────────────┐
│                 🐘 POSTGRESQL (Relational)                  │
│              Persistente Backup-Datenbank                   │
│     Foreign Keys | Transactions | < 10ms Operations         │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│                  🍃 MONGODB (Document Store)                │
│               Nur für statische Terrain Chunks              │
│                      Read-Only im Gameplay                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Redis - In-Memory Session Store

### Zweck
- **Führende Datenbank** während aktiver Spielersitzungen
- Ultra-schnelle Read/Write Operations (< 1ms)
- Session-Management mit automatischem Cleanup

### Datenstruktur
```typescript
// Key: player:{username}
{
  username: string;
  resources: {
    wood: number;
    stone: number;
    iron: number;
    gold: number;
  };
  lastActivity: number;        // Timestamp
  sessionStart: number;         // Timestamp
  buildingsInConstruction: {
    [buildingId: string]: {
      startTime: number;
      endTime: number;
      progress: number;
    }
  }
}
```

### TTL (Time-To-Live)
- **Standard**: 1 Stunde
- **Auto-Cleanup**: Expired sessions werden automatisch gelöscht
- **Keep-Alive**: Bei Aktivität wird TTL erneuert

### Wann wird Redis verwendet?
- ✅ **onJoin**: Erste Lookup-Quelle für reconnecting players
- ✅ **update() Loop**: Ressourcen-Updates alle paar Sekunden
- ✅ **Building Progress**: Live-Baufortschritt
- ✅ **onLeave**: Session löschen nach PostgreSQL-Sync

### Manager: `RedisSessionManager.ts`

**Wichtige Methoden:**
```typescript
// Session erstellen/aktualisieren
setPlayerSession(username: string, data: PlayerSessionData, ttl?: number): Promise<void>

// Session abrufen
getPlayerSession(username: string): Promise<PlayerSessionData | null>

// Ressourcen aktualisieren
updatePlayerResources(username: string, resources: Resources): Promise<void>

// TTL erneuern
keepSessionAlive(username: string, ttl?: number): Promise<void>

// Session löschen
deletePlayerSession(username: string): Promise<void>
```

**Monitoring:**
```bash
npm run redis-stats
```

---

## 2. PostgreSQL - Relational Persistent Storage

### Zweck
- **Persistente Backup-Datenbank** für alle Spielerdaten
- Referentielle Integrität durch Foreign Keys
- Atomare Transaktionen für komplexe Operationen
- Basis für Statistiken und Analytics

### Schema

#### Tabelle: `players`
```sql
CREATE TABLE players (
  username VARCHAR(50) PRIMARY KEY,
  color VARCHAR(7) NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  wood INTEGER DEFAULT 50,
  stone INTEGER DEFAULT 30,
  iron INTEGER DEFAULT 10,
  gold INTEGER DEFAULT 5,
  max_wood INTEGER DEFAULT 200,
  max_stone INTEGER DEFAULT 200,
  max_iron INTEGER DEFAULT 100,
  max_gold INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP DEFAULT NOW()
);
```

#### Tabelle: `buildings`
```sql
CREATE TABLE buildings (
  id VARCHAR(100) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  owner VARCHAR(50) NOT NULL,
  level INTEGER DEFAULT 1,
  construction_start_time BIGINT NOT NULL,
  construction_end_time BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  FOREIGN KEY (owner) REFERENCES players(username) ON DELETE CASCADE,
  UNIQUE(q, r)
);

CREATE INDEX idx_buildings_owner ON buildings(owner);
CREATE INDEX idx_buildings_coords ON buildings(q, r);
```

#### Tabelle: `tile_ownership`
```sql
CREATE TABLE tile_ownership (
  q INTEGER NOT NULL,
  r INTEGER NOT NULL,
  owner VARCHAR(50),
  building_id VARCHAR(100),
  last_modified TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (q, r),
  FOREIGN KEY (owner) REFERENCES players(username) ON DELETE SET NULL,
  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL
);

CREATE INDEX idx_tile_ownership_owner ON tile_ownership(owner);
```

### Foreign Key Constraints

**ON DELETE CASCADE** (buildings.owner):
- Wenn ein Spieler gelöscht wird → alle seine Buildings werden gelöscht

**ON DELETE SET NULL** (tile_ownership):
- Wenn ein Spieler gelöscht wird → Tiles werden ownerless (NULL)
- Wenn ein Building gelöscht wird → Tile behält owner, building_id = NULL

### Atomare Transaktionen

**Beispiel: Building bauen**
```typescript
await postgres.buildBuildingTransaction(
  playerUsername,
  buildingData,
  resourceCost
);
```

Diese Transaction führt **atomar** aus:
1. ✅ Prüfe: Ist Tile bereits bebaut?
2. ✅ Erstelle Building
3. ✅ Setze Tile Ownership
4. ✅ Commit oder Rollback bei Fehler

### Wann wird PostgreSQL verwendet?
- ✅ **onJoin**: Fallback wenn Redis keine Session hat
- ✅ **onLeave**: Backup aller Spielerdaten aus Redis
- ✅ **handleBuild**: Atomare Transaction für Building-Bau
- ✅ **persistBuildingCompletion**: Building als completed markieren
- ✅ **Statistics**: Aggregationen und Reports

### Manager: `PostgresManager.ts`

**Player Operations:**
```typescript
createPlayer(data: PlayerData): Promise<Player>
getPlayer(username: string): Promise<Player | null>
updatePlayerResources(username: string, resources: Resources): Promise<void>
updatePlayerLastLogin(username: string): Promise<void>
```

**Building Operations:**
```typescript
createBuilding(data: Building): Promise<Building>
getPlayerBuildings(username: string): Promise<Building[]>
getBuildingAtPosition(q: number, r: number): Promise<Building | null>
completeBuilding(buildingId: string): Promise<void>
buildBuildingTransaction(...): Promise<Building>  // Atomare Transaction
```

**Tile Operations:**
```typescript
setTileOwner(q: number, r: number, owner: string): Promise<void>
getPlayerTiles(username: string): Promise<TileOwnership[]>
```

**Monitoring:**
```bash
npm run postgres-stats
```

---

## 3. MongoDB - Document Store für Terrain

### Zweck
- **Ausschließlich** für statische Terrain-Daten (Chunks)
- Read-Only während des Gameplays
- Einmalige Generierung mit `generateWorld.ts`

### Collection: `chunks`

```typescript
{
  _id: "chunk_q_r",           // z.B. "chunk_0_0"
  chunkQ: number,
  chunkR: number,
  tiles: [
    {
      q: number,
      r: number,
      biome: "grass" | "forest" | "mountain" | "water" | "desert",
      resource?: "wood" | "stone" | "iron" | "gold"
    }
  ]
}
```

### Wann wird MongoDB verwendet?
- ✅ **Weltgenerierung**: `npm run generate-world`
- ✅ **Chunk Loading**: `chunkManager.loadChunk(q, r)`
- ✅ **Fog-of-War**: Nur sichtbare Chunks werden geladen
- ❌ **NICHT** für dynamische Daten (ownership, buildings, resources)

### Manager: `ChunkManager.ts`

**Methoden:**
```typescript
loadChunk(chunkQ: number, chunkR: number): Promise<Chunk | null>
saveChunk(chunk: Chunk): Promise<void>
```

---

## Datenfluss im Detail

### 🟢 Spieler tritt bei (onJoin)

```typescript
async onJoin(client: Client, options: any) {
  // 1. Redis-First Lookup
  const redisSession = await this.redis.getPlayerSession(username);
  
  if (redisSession) {
    // ⚡ Schneller Reconnect aus Redis (< 1ms)
    player = loadFromRedis(redisSession);
  } else {
    // 2. PostgreSQL Fallback
    const dbPlayer = await this.postgres.getPlayer(username);
    
    if (dbPlayer) {
      // 📦 Returning player aus PostgreSQL (< 10ms)
      player = loadFromPostgres(dbPlayer);
    } else {
      // 🆕 Neuer Spieler erstellen
      player = await createNewPlayer(username);
      await this.postgres.createPlayer(player);
    }
  }
  
  // 3. Lade Buildings aus PostgreSQL
  const buildings = await this.postgres.getPlayerBuildings(username);
  buildings.forEach(b => this.state.buildings.set(b.id, b));
  
  // 4. Lade Tile Ownership aus PostgreSQL
  const tiles = await this.postgres.getPlayerTiles(username);
  tiles.forEach(t => this.state.tiles.set(`${t.q},${t.r}`, t));
  
  // 5. Erstelle Redis Session
  await this.redis.setPlayerSession(username, {
    username,
    resources: player.resources,
    lastActivity: Date.now(),
    sessionStart: Date.now()
  });
  
  // 6. Lade sichtbare Terrain Chunks aus MongoDB
  await loadVisibleChunks(player.position);
}
```

**Priorität:** Redis > PostgreSQL > Neu erstellen

---

### 🔨 Spieler baut Building (handleBuild)

```typescript
async handleBuild(client: Client, command: BuildCommand) {
  const player = this.state.players.get(client.sessionId);
  const def = BUILDING_DEFINITIONS[command.buildingType];
  
  // 1. Validierungen in RAM
  if (player.wood < def.baseCost.wood) {
    return client.send('error', { message: 'Not enough wood' });
  }
  
  // 2. Kosten abziehen (RAM State)
  player.wood -= def.baseCost.wood;
  player.stone -= def.baseCost.stone;
  
  // 3. Building Object erstellen
  const building = {
    id: `${player.username}_${Date.now()}`,
    type: command.buildingType,
    q: command.position.q,
    r: command.position.r,
    owner: player.username,
    level: 1,
    construction_start_time: Date.now(),
    construction_end_time: Date.now() + def.constructionTime * 1000
  };
  
  // 4. Atomare PostgreSQL Transaction
  await this.postgres.buildBuildingTransaction(
    player.username,
    building,
    def.baseCost
  );
  // ✅ Diese Transaction erstellt:
  //    - Building in buildings table
  //    - Tile ownership in tile_ownership table
  //    - Alles oder nichts (ROLLBACK on error)
  
  // 5. Füge zu RAM State hinzu
  const buildingState = new BuildingState();
  Object.assign(buildingState, building);
  this.state.buildings.set(building.id, buildingState);
  
  // 6. Update Redis Session (optional, für Safety)
  await this.redis.updatePlayerResources(player.username, {
    wood: player.wood,
    stone: player.stone,
    iron: player.iron,
    gold: player.gold
  });
}
```

**Flow:** RAM Validation → PostgreSQL Transaction → RAM State → Redis Sync

---

### 🚪 Spieler verlässt (onLeave)

```typescript
async onLeave(client: Client, consented: boolean) {
  const player = this.state.players.get(client.sessionId);
  
  // 1. Sync Redis → PostgreSQL
  await this.postgres.updatePlayerResources(player.username, {
    wood: player.wood,
    stone: player.stone,
    iron: player.iron,
    gold: player.gold
  });
  
  // 2. Speichere alle Buildings
  const buildings = Array.from(this.state.buildings.values())
    .filter(b => b.owner === player.username);
    
  for (const building of buildings) {
    if (building.constructionProgress >= 1) {
      await this.postgres.completeBuilding(building.id);
    } else {
      await this.postgres.createBuilding({
        id: building.id,
        type: building.type,
        q: building.q,
        r: building.r,
        owner: building.owner,
        level: building.level,
        construction_start_time: building.constructionStartTime,
        construction_end_time: building.constructionEndTime
      });
    }
  }
  
  // 3. Lösche Redis Session
  await this.redis.deletePlayerSession(player.username);
  
  // 4. Entferne aus RAM State
  this.state.players.delete(client.sessionId);
}
```

**Flow:** Redis → PostgreSQL Sync → Redis Cleanup → RAM Cleanup

---

## Update Loop (Ressourcen-Generierung)

```typescript
update(deltaTime: number) {
  this.resourceAccumulator += deltaTime / 1000;
  
  if (this.resourceAccumulator >= 1) {
    this.state.players.forEach(player => {
      // 1. Berechne Ressourcen-Generation aus Buildings
      const buildings = Array.from(this.state.buildings.values())
        .filter(b => b.owner === player.username && b.constructionProgress >= 1);
      
      buildings.forEach(building => {
        const def = BUILDING_DEFINITIONS[building.type];
        if (def.production) {
          player.wood += def.production.wood || 0;
          player.stone += def.production.stone || 0;
          // etc...
        }
      });
      
      // 2. Clamp zu Storage Limits
      player.wood = Math.min(player.wood, player.maxWood);
      
      // 3. Optional: Sync zu Redis (alle 5 Sekunden)
      if (this.resourceAccumulator % 5 === 0) {
        this.redis.updatePlayerResources(player.username, {
          wood: player.wood,
          stone: player.stone,
          iron: player.iron,
          gold: player.gold
        }).catch(err => console.error('Redis sync failed:', err));
      }
    });
    
    this.resourceAccumulator = 0;
  }
}
```

**Flow:** RAM Calculation → Optional Redis Sync (every 5s) → PostgreSQL Backup (onLeave)

---

## Migration von alter Architektur

### Vorher (Alt)
```
MongoDB (einzige DB)
  ├─ players collection
  ├─ buildings collection
  ├─ tileDynamicData collection
  └─ chunks collection
```

**Probleme:**
- ❌ Zu langsam für Live-Updates (50-100ms)
- ❌ Keine Foreign Keys → Orphaned Buildings möglich
- ❌ Keine Transactions → Race Conditions
- ❌ Keine relationalen Queries (JOINs)

### Nachher (Neu)
```
Redis (Live Sessions)
  └─ player:{username} keys mit TTL

PostgreSQL (Persistent)
  ├─ players table (FK parent)
  ├─ buildings table (FK → players)
  └─ tile_ownership table (FK → players, buildings)

MongoDB (Static Terrain)
  └─ chunks collection (read-only)
```

**Vorteile:**
- ✅ Redis: < 1ms für Live-Sessions
- ✅ PostgreSQL: Foreign Keys + Transactions
- ✅ MongoDB: Effizient für große Terrain-Daten
- ✅ Klare Trennung: Live vs. Persistent vs. Static

### Migration Script
```bash
npm run migrate-to-postgres
```

Führt aus:
1. Liest alle Daten aus MongoDB (players, buildings, tileDynamicData)
2. Erstellt PostgreSQL Schema mit Foreign Keys
3. Migriert alle Daten
4. Validiert mit `npm run postgres-stats`

**Nach Migration:**
```bash
npm run cleanup-mongodb
```

Löscht alte Collections (players, buildings, tileDynamicData), behält nur `chunks`.

---

## Best Practices

### 🔴 Redis
- ✅ Verwende für **alle Live-Sessions**
- ✅ Nutze TTL für automatisches Cleanup
- ✅ Keep-Alive bei Player-Aktivität
- ❌ NICHT für langfristige Persistenz

### 🐘 PostgreSQL
- ✅ Verwende Transactions für **atomare Operations**
- ✅ Nutze Foreign Keys für **Datenintegrität**
- ✅ Erstelle Indexes für häufige Queries
- ❌ NICHT für hochfrequente Updates (< 1s Intervall)

### 🍃 MongoDB
- ✅ Verwende für **große Dokumente** (Chunks)
- ✅ Ideal für **statische Daten**
- ❌ NICHT mehr für dynamische Spielerdaten

### 🎮 GameRoom (Colyseus)
- ✅ RAM State ist **führend** während Gameplay
- ✅ Sync zu Redis **optinal** alle paar Sekunden
- ✅ Sync zu PostgreSQL **zwingend** bei onLeave
- ✅ Load aus Redis > PostgreSQL > Create New

---

## Monitoring & Debugging

### Redis Stats
```bash
npm run redis-stats
```

Zeigt:
- Anzahl aktiver Sessions
- Ressourcen pro Spieler
- TTL Status
- Uptime

### PostgreSQL Stats
```bash
npm run postgres-stats
```

Zeigt:
- Total Players, Buildings, Tiles
- Per-Player Breakdown
- Completion Status
- Last Login Times

### MongoDB Stats
```bash
npm run db-stats
```

Zeigt:
- Anzahl Chunks
- Total Tiles
- Biome Distribution

---

## Troubleshooting

### Problem: Spieler verliert Fortschritt
**Ursache:** Redis Session expired, PostgreSQL nicht synced  
**Lösung:** Stelle sicher dass `onLeave()` immer PostgreSQL-Sync ausführt

### Problem: Building doppelt vorhanden
**Ursache:** Race Condition bei parallelen Builds  
**Lösung:** Nutze `buildBuildingTransaction()` - prüft UNIQUE constraint auf (q,r)

### Problem: Orphaned Buildings nach Spieler-Löschung
**Ursache:** Foreign Key nicht gesetzt  
**Lösung:** Migration prüfen - `ON DELETE CASCADE` muss aktiv sein

### Problem: Redis memory voll
**Ursache:** Zu viele alte Sessions ohne TTL  
**Lösung:** TTL auf allen keys setzen, cleanup-script laufen lassen

---

## Performance Benchmarks

| Operation | Redis | PostgreSQL | MongoDB |
|-----------|-------|------------|---------|
| Player Lookup | < 1ms | ~5ms | ~50ms |
| Resource Update | < 1ms | ~8ms | ~60ms |
| Building Create | < 1ms (cache) | ~12ms (transaction) | ~70ms |
| Chunk Load | N/A | N/A | ~30ms |
| Session Create | < 1ms | N/A | N/A |

**Empfehlung:** Redis für < 1s Updates, PostgreSQL für Persistenz, MongoDB für Terrain

---

## Weitere Dokumentation

- [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md) - Migrations-Details
- [HYBRID_DATABASE.md](./HYBRID_DATABASE.md) - Ursprüngliche Planung
- [GDD.md](./GDD.md) - Game Design Document

---

**Autor:** Database Migration Team  
**Letzte Aktualisierung:** 14.11.2025  
**Version:** 2.0 (Post-Migration)
