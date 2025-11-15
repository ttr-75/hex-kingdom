# TODO - Zukünftige Verbesserungen

## Spieler-Spawn System

### Spiral-Suche für Startpositionen
**Priorität:** Mittel  
**Status:** Geplant

Die aktuelle Implementierung sucht zufällig in einem festen Radius (10-40 Tiles) um (0,0) nach geeigneten Startpositionen. Bei vielen Spielern oder ungünstiger Weltgenerierung kann dies problematisch werden.

**Verbesserung:**
- Implementiere Spiral-Suche, die systematisch von innen nach außen expandiert
- Garantiert, dass immer eine Position gefunden wird (solange die Welt groß genug ist)
- Vermeidet zufällige Suchfehler bei 100 Versuchen

**Code-Location:** `server/src/rooms/GameRoom.ts` → `findSuitableSpawnPosition()`

**Beispiel-Algorithmus:**
```typescript
let searchRadius = 10;
const maxRadius = 200;

while (searchRadius < maxRadius) {
  // Systematisch alle Tiles in diesem Ring prüfen
  for (let angle = 0; angle < 2 * Math.PI; angle += 0.1) {
    const q = Math.round(searchRadius * Math.cos(angle));
    const r = Math.round(searchRadius * Math.sin(angle));
    // ... Eignung prüfen
    if (suitable) return { q, r };
  }
  searchRadius += 5; // Nächster Ring
}
```

---

## Weitere Punkte

_Hier können weitere TODO-Punkte hinzugefügt werden..._
