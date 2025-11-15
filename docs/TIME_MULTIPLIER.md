# Zeit-Multiplikator (TIME_MULTIPLIER)

## Übersicht

Der `TIME_MULTIPLIER` ist ein konfigurierbarer Parameter, der **alle zeitbasierten Vorgänge im Spiel beschleunigt**. Dies ist besonders nützlich für Entwicklung und Testing.

## Konfiguration

### Environment Variable setzen

Erstelle/bearbeite die `.env` Datei im `server/` Verzeichnis:

```env
# Zeit-Multiplikator (1.0 = normale Geschwindigkeit)
TIME_MULTIPLIER=20.0
```

### Beispiel-Werte

- `TIME_MULTIPLIER=1.0` - Normale Spielgeschwindigkeit (Production)
- `TIME_MULTIPLIER=10.0` - 10x schneller (empfohlen für Testing)
- `TIME_MULTIPLIER=20.0` - 20x schneller (schnelles Debugging)
- `TIME_MULTIPLIER=60.0` - 60x schneller (1 Minute = 1 Sekunde)

## Betroffene Systeme

Der TIME_MULTIPLIER beeinflusst folgende Zeitberechnungen:

### 1. Einheiten-Bewegung
- **Basiszeit:** 60 Sekunden pro Feld
- **Formel:** `(60s × unitSpeed × biomeSpeed) / TIME_MULTIPLIER`
- **Beispiel:** Mit `TIME_MULTIPLIER=20` → 3 Sekunden pro Feld

### 2. Gebäude-Bau
- **Town Hall:** Sofort (0s)
- **Barracks:** 120 Sekunden (2 Minuten)
- **Farm:** 60 Sekunden (1 Minute)
- **Mine:** 90 Sekunden (1.5 Minuten)
- **Lumberyard:** 75 Sekunden (1.25 Minuten)
- **Formel:** `constructionTime / TIME_MULTIPLIER`
- **Beispiel:** Mit `TIME_MULTIPLIER=20` → Barracks in 6 Sekunden

### 3. Technologie-Forschung
- **Formel:** `researchTime / TIME_MULTIPLIER`
- Zeiten sind in `shared/src/game-data.ts` definiert

### 4. Einheiten-Rekrutierung
*Aktuell sofort, keine Zeit implementiert*

## Code-Implementierung

### Server-Side (GameRoom.ts)

```typescript
// Zeit-Multiplikator am Anfang der Datei
const TIME_MULTIPLIER = parseFloat(process.env.TIME_MULTIPLIER || '1') || 1;

// Anwendung in Bewegungsberechnung
private calculateTileMovementTime(unitDef: any, biomeDef: any): number {
  const baseTime = 60000; // 1 Minute
  const totalTime = (baseTime * unitSpeed * biomeSpeed) / TIME_MULTIPLIER;
  return totalTime;
}

// Anwendung beim Gebäudebau
building.constructionEndTime = Date.now() + ((def.constructionTime * 1000) / TIME_MULTIPLIER);

// Anwendung bei Forschung
player.researchEndTime = Date.now() + ((tech.researchTime * 1000) / TIME_MULTIPLIER);
```

## Best Practices

### Development
```env
TIME_MULTIPLIER=20.0
```
→ Schnelles Testing, Bewegungen dauern 3s statt 60s

### Staging
```env
TIME_MULTIPLIER=5.0
```
→ Beschleunigt aber noch realistisch genug für Gameplay-Tests

### Production
```env
TIME_MULTIPLIER=1.0
```
→ Normale Spielgeschwindigkeit

## Warnung

⚠️ **Nicht vergessen:** Den TIME_MULTIPLIER auf `1.0` zurücksetzen vor dem Production-Deployment!

## Server-Neustart erforderlich

Änderungen am `TIME_MULTIPLIER` erfordern einen **Server-Neustart**, da die Environment-Variable beim Start geladen wird.

```bash
# Server neu starten
cd server
npm run dev
```
