# Datenfluss-Analyse: Redis ↔ PostgreSQL ↔ Client

## 📊 AKTUELLER ZUSTAND (Status Quo)

### 1. **onJoin** (Spieler verbindet sich)

#### Ladepriorität:
```
Redis → PostgreSQL → Neu erstellen
```

**Redis vorhanden?**
- ✅ JA: Lade Resources aus Redis (live-Daten während aktiver Session)
  - `player.wood`, `player.stone`, etc. aus Redis geladen
  - PostgreSQL Player-Check: Falls nicht vorhanden → erstelle in PostgreSQL (für Foreign Keys)
  - TTL erneuern: `keepPlayerSessionAlive()`

- ❌ NEIN: PostgreSQL Check
  - **PostgreSQL vorhanden?** → "Returning Player"
    - Lade `player.color` aus PostgreSQL
    - Setze STARTING_RESOURCES (⚠️ PROBLEM: Alte Resources gehen verloren!)
  - **PostgreSQL NICHT vorhanden?** → "Neuer Spieler"
    - Erstelle Player in PostgreSQL
    - Setze STARTING_RESOURCES

#### Nach dem Laden:
- Lade **Tiles** (ownership) aus PostgreSQL
- Lade **Buildings** aus PostgreSQL
- Lade **Units** aus PostgreSQL
- **ERSTELLE Redis-Session** mit aktuellen Player-Daten

---

### 2. **update()** Loop (60x/Sekunde)

#### Was passiert:
```typescript
productionSystem.updateProduction(deltaSeconds)
  → player.wood += production
  → player.stone += production
  // etc.
```

#### Was NICHT passiert:
- ❌ **KEIN** Redis-Update!
- ❌ **KEIN** PostgreSQL-Update!

**➡️ Resources existieren NUR im RAM (Colyseus State)**

---

### 3. **onLeave** (Spieler disconnected)

```typescript
Redis (führend) → PostgreSQL (backup)
```

#### Aktueller Code:
```typescript
redisSession = await redis.getPlayerSession(username)
if (redisSession) {
  console.log('💾 Syncing Redis → PostgreSQL')
  // TODO: Resources-Tabelle in PostgreSQL hinzufügen
  // ⚠️ AKTUELL: Resources werden NICHT gespeichert!
  
  await redis.deletePlayerSession(username)
}
```

**Buildings & Units:**
- ✅ Werden in PostgreSQL gespeichert
- ✅ Werden bei onLeave synchronisiert

---

## 🚨 PROBLEME

### Problem 1: Resources gehen verloren bei onLeave
```
1. Spieler spielt, sammelt 1000 Wood
2. Spieler disconnected (onLeave)
3. Redis-Session gelöscht
4. Resources wurden NICHT nach PostgreSQL gespeichert
5. Spieler reconnected → Lädt aus PostgreSQL → STARTING_RESOURCES ❌
```

### Problem 2: Kein Persistence während Gameplay
- Resources existieren nur im RAM
- Server-Crash = alle Resources verloren
- Keine Backups während aktiver Session

### Problem 3: Redis wird nie aktualisiert
- Redis wird beim onJoin erstellt
- Danach nie mehr updated
- Bei langem Disconnect (> TTL) sind Redis-Daten veraltet

---

## ✅ WAS FUNKTIONIERT

1. **Tiles (Ownership)**
   - ✅ Werden in PostgreSQL gespeichert (bei claim)
   - ✅ Werden aus PostgreSQL geladen (onJoin)
   - ✅ Migration von MongoDB → PostgreSQL läuft

2. **Tile Resources & Population**
   - ✅ Werden aus MongoDB migriert (bei claim)
   - ✅ Werden in PostgreSQL gespeichert
   - ✅ Persistent

3. **Buildings**
   - ✅ Werden in PostgreSQL gespeichert (onLeave)
   - ✅ Werden aus PostgreSQL geladen (onJoin)
   - ✅ Construction-Progress wird getrackt

4. **Units**
   - ✅ Werden in PostgreSQL gespeichert
   - ✅ Werden aus PostgreSQL geladen
   - ✅ Movements werden persistent gespeichert

---

## 🎯 EMPFOHLENE FIXES

### Fix 1: Player Resources nach PostgreSQL speichern (onLeave)
```typescript
// onLeave():
await postgres.updatePlayerResources(username, {
  wood: player.wood,
  stone: player.stone,
  iron: player.iron,
  gold: player.gold,
  food: player.food,
  fish: player.fish
})
```

### Fix 2: Player Resources aus PostgreSQL laden (onJoin - Returning Player)
```typescript
// onJoin() - wenn Redis leer, PostgreSQL vorhanden:
const resources = await postgres.getPlayerResources(username)
if (resources) {
  player.wood = resources.wood
  player.stone = resources.stone
  // etc.
}
```

### Fix 3: Redis periodisch updaten (optional)
```typescript
// update() Loop - alle 10 Sekunden:
if (this.updateCounter % 600 === 0) { // 60 ticks/sec * 10 sec
  await this.syncAllPlayersToRedis()
}
```

---

## 📋 ZUSAMMENFASSUNG

| Daten-Typ | Wo gespeichert? | Wann gespeichert? | Persistent? |
|-----------|----------------|-------------------|-------------|
| Player Resources | RAM (State) | ❌ Nie | ❌ NEIN |
| Tile Ownership | PostgreSQL | Bei Claim | ✅ JA |
| Tile Resources | PostgreSQL | Bei Claim (MongoDB→PG) | ✅ JA |
| Tile Population | PostgreSQL | Bei Claim (MongoDB→PG) | ✅ JA |
| Buildings | PostgreSQL | onLeave | ✅ JA |
| Units | PostgreSQL | onCreate, onMove | ✅ JA |
| Redis Session | Redis | onJoin | ⏱️ TTL-basiert |

**Kritisch:** Player Resources (wood, stone, etc.) gehen bei disconnect verloren! ❌
