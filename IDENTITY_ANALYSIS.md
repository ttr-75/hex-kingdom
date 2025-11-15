# 🔍 Analyse: Session ID vs. Username Problem

## Problem-Übersicht

Das System verwendet **zwei verschiedene Identifikatoren** für Spieler, was zu Inkonsistenzen führt:

1. **`client.sessionId`** - Temporäre Colyseus-Session ID
2. **`player.username`** - Persistente Spieler-ID (z.B. "admin", "player1")

---

## 📊 Aktuelle Architektur

### PlayerState Schema
```typescript
export class PlayerState extends Schema {
  @type('string') id: string = '';        // ← Wird mit sessionId gefüllt
  @type('string') username: string = '';   // ← Persistente ID
  // ...
}
```

### Wie Spieler gespeichert werden (GameRoom.ts)
```typescript
// onJoin()
const persistentId = options.username || `Player_${client.sessionId.slice(0, 6)}`;
player.id = client.sessionId;           // ← Temporär!
player.username = persistentId;         // ← Persistent!
this.state.players.set(client.sessionId, player);  // ⚠️ Key = sessionId
```

**Problem:** Die Map verwendet `sessionId` als Key, aber alle Entity-Owner (`building.owner`, `unit.owner`, `tile.owner`) verwenden `username`!

---

## 🔴 Wo es schief läuft

### 1. **ProductionSystem** (vorher gefixt)
```typescript
// ❌ FALSCH - findet Spieler nicht
const player = this.state.players.get(building.owner);  // building.owner = "admin"
// players Map: { "abc123sessionId" => PlayerState }

// ✅ RICHTIG - durchsucht alle Spieler
let player = null;
this.state.players.forEach((p) => {
  if (p.username === building.owner) player = p;
});
```

### 2. **Alle Message Handler**
```typescript
// BuildingHandler.handleBuild()
const player = this.state.players.get(client.sessionId);  // ✅ OK
building.owner = player.username;  // ✅ OK - nutzt persistente ID

// UnitHandler.handleRecruitUnit()
const player = this.state.players.get(client.sessionId);  // ✅ OK
unit.owner = player.username;  // ✅ OK
```

**Hier funktioniert es**, weil der Handler direkt Zugriff auf `client.sessionId` hat.

### 3. **Systems ohne Client-Kontext**
```typescript
// MovementSystem.ts
await this.onExploration(unit.owner, unit, unitDef);  // unit.owner = "admin"
// Aber onExploration hat KEINEN Zugriff auf sessionId!

// VisibilitySystem.ts
this.clients.forEach((c) => {
  const p = this.state.players.get(c.sessionId);  // ✅ OK wenn online
  // ...
});
```

**Problem:** Wenn ein System nur den `username` hat, kann es den Spieler nicht direkt finden!

---

## 🔄 Warum zwei IDs existieren

### SessionId (Colyseus-intern)
- **Zweck:** Eindeutige ID für jede WebSocket-Verbindung
- **Lebensdauer:** Nur während der aktiven Verbindung
- **Ändert sich:** Bei jedem Reconnect
- **Verwendet für:**
  - Client-Kommunikation (`client.send()`)
  - `this.state.players` Map Key
  - Temporäre Session-Zuordnung

### Username (Persistent)
- **Zweck:** Dauerhafte Spieler-Identität
- **Lebensdauer:** Permanent (über Sessions hinweg)
- **Ändert sich:** Nie
- **Verwendet für:**
  - Datenbank-Referenzen (PostgreSQL, Redis)
  - Entity Ownership (Buildings, Units, Tiles)
  - Reconnect-Logik

---

## 🎯 Warum die aktuelle Architektur problematisch ist

### Problem 1: Inkonsistente Map Keys
```typescript
// Spieler wird mit sessionId als Key gespeichert
this.state.players.set(client.sessionId, player);

// Aber Owner-Referenzen nutzen username
building.owner = "admin"  // ← Username
unit.owner = "admin"      // ← Username
tile.owner = "admin"      // ← Username

// Beim Lookup schlägt es fehl!
const player = this.state.players.get("admin");  // ❌ undefined
```

### Problem 2: Reconnects sind kompliziert
Wenn ein Spieler reconnected:
1. Neue `sessionId` wird generiert
2. `username` bleibt gleich
3. **Alle Owner-Referenzen sind noch gültig** (weil username)
4. **Aber der Map-Key ändert sich!** (weil sessionId)

### Problem 3: Performance-Overhead
```typescript
// ❌ LANGSAM - O(n) - durchsucht alle Spieler
let player = null;
this.state.players.forEach((p) => {
  if (p.username === building.owner) player = p;
});

// ✅ SCHNELL - O(1) - direkter Zugriff
const player = this.state.players.get(username);
```

---

## ✅ Empfohlene Lösung: Username als Map Key

### Warum Username als Key besser ist:

1. **✅ Konsistenz:** Owner-Referenzen stimmen mit Map-Key überein
2. **✅ Reconnects:** Username bleibt gleich, Map bleibt gültig
3. **✅ Performance:** O(1) statt O(n) Lookups
4. **✅ Datenbank-Konsistenz:** Gleicher Identifier überall
5. **✅ Einfachheit:** Keine doppelte ID-Verwaltung

### Was geändert werden muss:

#### 1. GameRoom.ts - Map Key ändern
```typescript
// ❌ ALT
this.state.players.set(client.sessionId, player);

// ✅ NEU
this.state.players.set(player.username, player);
```

#### 2. Zusätzliche Map für Client-Lookups
```typescript
// Neue Map für sessionId -> username Mapping
private clientToUsername = new Map<string, string>();

// onJoin()
this.state.players.set(player.username, player);
this.clientToUsername.set(client.sessionId, player.username);

// onLeave()
const username = this.clientToUsername.get(client.sessionId);
if (username) {
  this.state.players.delete(username);
  this.clientToUsername.delete(client.sessionId);
}
```

#### 3. Message Handler anpassen
```typescript
// ❌ ALT
const player = this.state.players.get(client.sessionId);

// ✅ NEU
const username = this.clientToUsername.get(client.sessionId);
const player = this.state.players.get(username);
```

#### 4. Systems vereinfachen
```typescript
// ProductionSystem - wird trivial!
this.state.buildings.forEach((building) => {
  const player = this.state.players.get(building.owner);  // ✅ Direkt!
  if (!player) return;
  // ...
});
```

---

## 🚨 Alternative: SessionId überall nutzen

**Nicht empfohlen**, weil:

1. ❌ Owner-Referenzen in DB müssten sessionId speichern → Reconnects brechen alles
2. ❌ Gebäude/Units eines Spielers wären nach Reconnect verloren
3. ❌ Redis/PostgreSQL müssten bei jedem Reconnect alle Owner aktualisieren
4. ❌ Spieler-Identität ist nicht persistent

---

## 📝 Migration Plan

### Phase 1: Vorbereitungen
1. Erstelle `clientToUsername` Map
2. Teste Dual-Mapping (beide Maps parallel)

### Phase 2: Umstellung
1. Ändere `players.set()` von sessionId auf username
2. Füge Helper-Methode hinzu:
   ```typescript
   private getPlayerByClient(client: Client): PlayerState | undefined {
     const username = this.clientToUsername.get(client.sessionId);
     return username ? this.state.players.get(username) : undefined;
   }
   ```

### Phase 3: Cleanup
1. Suche alle `players.get(client.sessionId)` und ersetze
2. Entferne workarounds in ProductionSystem
3. Teste Reconnect-Szenarien

### Phase 4: Testing
- ✅ Reconnect funktioniert
- ✅ Buildings produzieren korrekt
- ✅ Units bewegen sich
- ✅ Keine Performance-Regression

---

## 🎓 Lessons Learned

### Warum ist das passiert?

1. **Colyseus-Konvention:** Colyseus Tutorials nutzen oft `sessionId` als Key
2. **Persistence später hinzugefügt:** Username-System kam später dazu
3. **Schnelle Entwicklung:** Inkonsistenz nicht sofort aufgefallen
4. **Fehlende Abstraktion:** Kein zentrales Player-Lookup-System

### Best Practice für die Zukunft:

```typescript
// ✅ Zentrales Player-Management
class PlayerManager {
  private players = new MapSchema<PlayerState>();
  private clientToUsername = new Map<string, string>();
  
  getByClient(sessionId: string): PlayerState | undefined {
    const username = this.clientToUsername.get(sessionId);
    return username ? this.players.get(username) : undefined;
  }
  
  getByUsername(username: string): PlayerState | undefined {
    return this.players.get(username);
  }
  
  add(sessionId: string, player: PlayerState): void {
    this.players.set(player.username, player);
    this.clientToUsername.set(sessionId, player.username);
  }
  
  remove(sessionId: string): void {
    const username = this.clientToUsername.get(sessionId);
    if (username) {
      this.players.delete(username);
      this.clientToUsername.delete(sessionId);
    }
  }
}
```

---

## 🏁 Fazit

**Empfehlung:** Migriere zu **Username als Map Key**.

**Warum:**
- ✅ Konsistent mit Ownership-System
- ✅ Reconnect-safe
- ✅ Performance-Verbesserung
- ✅ Weniger Code-Komplexität
- ✅ Einfacheres Debugging

**Aufwand:** ~2-3 Stunden für vollständige Migration + Testing
