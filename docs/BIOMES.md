# Biome-System

Das Spiel verfügt über ein detailliertes Biome-System, das verschiedene Eigenschaften und Spielmechaniken beeinflusst.

## Biome-Eigenschaften

Jedes Biom hat folgende Eigenschaften:

### 1. **Sichtweite** (View Distance)
Bestimmt, wie weit Einheiten in diesem Biom sehen können (in Hex-Feldern).

### 2. **Bewegungsmultiplikator** (Movement Multiplier)
Beeinflusst die Geschwindigkeit von Truppen und Händlern:
- `1.0` = normale Geschwindigkeit
- `< 1.0` = verlangsamt
- `> 1.0` = beschleunigt

### 3. **Fruchtbarkeit** (Fertility)
Bereich von 0-1, beeinflusst Nahrungsproduktion von Farmen:
- `0.0-0.3` = sehr unfruchtbar
- `0.3-0.6` = mäßig fruchtbar
- `0.6-1.0` = sehr fruchtbar

Jedes Tile erhält einen zufälligen Wert innerhalb der Biom-Range.

### 4. **Ressourcen-Spawns**
Definiert welche Ressourcen mit welcher Wahrscheinlichkeit und Menge spawnen können.

---

## Die Biome

### 🌳 Laubwald (Deciduous Forest)
**Charakteristik:** Lichter Wald mit Laubbäumen

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 3 Hex-Felder |
| Bewegung | 0.85× (15% langsamer) |
| Fruchtbarkeit | 0.6 - 0.8 |
| Farbe | #4a7c3f |

**Ressourcen:**
- 🪵 **Holz**: 50-70% Chance, 300-600 Einheiten
- 🍖 **Nahrung**: 20-40% Chance, 200-400 Einheiten

---

### 🌲 Nadelwald (Coniferous Forest)
**Charakteristik:** Dichter Wald, erschwerte Sicht und Bewegung

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 2 Hex-Felder (schlechteste) |
| Bewegung | 0.7× (30% langsamer) |
| Fruchtbarkeit | 0.3 - 0.5 |
| Farbe | #2d5a2d |

**Ressourcen:**
- 🪵 **Holz**: 70-90% Chance, 500-800 Einheiten (beste Holzquelle)
- 🪨 **Stein**: 10-20% Chance, 200-400 Einheiten

---

### 🌾 Grasland (Grassland)
**Charakteristik:** Offene Ebenen, optimal für Bewegung und Sicht

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 5 Hex-Felder (sehr gut) |
| Bewegung | 1.2× (20% schneller) |
| Fruchtbarkeit | 0.7 - 0.9 (beste Farmland) |
| Farbe | #7cb342 |

**Ressourcen:**
- 🍖 **Nahrung**: 40-60% Chance, 400-700 Einheiten
- 🪵 **Holz**: 10-20% Chance, 100-300 Einheiten

---

### ⛰️ Hügelland (Hills)
**Charakteristik:** Hügelige Landschaft, gute Sicht durch erhöhte Position

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 4 Hex-Felder |
| Bewegung | 0.8× (20% langsamer) |
| Fruchtbarkeit | 0.5 - 0.7 |
| Farbe | #8d6e63 |

**Ressourcen:**
- 🪨 **Stein**: 30-50% Chance, 300-600 Einheiten
- ⚙️ **Eisen**: 20-30% Chance, 200-400 Einheiten
- 🍖 **Nahrung**: 20-30% Chance, 200-400 Einheiten

---

### 🏔️ Gebirge (Mountains)
**Charakteristik:** Hochgebirge, beste Sicht aber sehr schwieriges Gelände

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 6 Hex-Felder (beste!) |
| Bewegung | 0.5× (50% langsamer!) |
| Fruchtbarkeit | 0.1 - 0.3 (sehr unfruchtbar) |
| Farbe | #616161 |

**Ressourcen:**
- 🪨 **Stein**: 60-80% Chance, 500-1000 Einheiten (beste Steinquelle)
- ⚙️ **Eisen**: 40-60% Chance, 400-800 Einheiten (beste Eisenquelle)
- 💰 **Gold**: 10-20% Chance, 300-600 Einheiten

---

### 🌿 Sumpf (Swamp)
**Charakteristik:** Sumpfiges Moorland, sehr schwieriges Gelände

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 2 Hex-Felder (schlecht) |
| Bewegung | 0.6× (40% langsamer) |
| Fruchtbarkeit | 0.4 - 0.6 |
| Farbe | #5d4e37 |

**Ressourcen:**
- 🪵 **Holz**: 30-50% Chance, 200-400 Einheiten
- 🍖 **Nahrung**: 20-30% Chance, 150-300 Einheiten
- ⚙️ **Eisen**: 10-15% Chance, 200-400 Einheiten

---

### 🌾 Steppe (Steppe)
**Charakteristik:** Trockenes Grasland, gute Durchquerbarkeit

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 4 Hex-Felder |
| Bewegung | 1.1× (10% schneller) |
| Fruchtbarkeit | 0.3 - 0.5 |
| Farbe | #c5a777 |

**Ressourcen:**
- 🍖 **Nahrung**: 20-40% Chance, 200-400 Einheiten
- 🪨 **Stein**: 20-30% Chance, 200-400 Einheiten

---

### 🏜️ Wüste (Desert)
**Charakteristik:** Trockene Wüste, keine Hindernisse aber anstrengend

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 5 Hex-Felder (sehr gut) |
| Bewegung | 0.75× (25% langsamer, tiefer Sand) |
| Fruchtbarkeit | 0.05 - 0.2 (fast unfruchtbar) |
| Farbe | #e4a672 |

**Ressourcen:**
- 💰 **Gold**: 15-30% Chance, 400-800 Einheiten (beste Goldquelle)
- 🪨 **Stein**: 20-30% Chance, 300-500 Einheiten

---

### 🌊 Ozean (Ocean)
**Charakteristik:** Tiefes Wasser, unpassierbar ohne Schiffe

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 5 Hex-Felder (sehr gut) |
| Bewegung | 0.0× (unpassierbar ohne Schiffe) |
| Fruchtbarkeit | 0.0 |
| Farbe | #1565c0 |

**Ressourcen:**
- 🍖 **Nahrung** (Fischerei): 40-60% Chance, 400-800 Einheiten

---

### 🏞️ See (Lake)
**Charakteristik:** Süßwassersee, flaches Wasser auf Land

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 4 Hex-Felder |
| Bewegung | 0.0× (unpassierbar ohne Schiffe) |
| Fruchtbarkeit | 0.0 |
| Farbe | #42a5f5 |

**Ressourcen:**
- 🍖 **Nahrung** (Fischerei): 50-70% Chance, 300-600 Einheiten

---

### 〰️ Fluss (River)
**Charakteristik:** Fließendes Wasser, passierbar an flachen Stellen (Furten)

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 3 Hex-Felder |
| Bewegung | 0.3× (langsam passierbar) |
| Fruchtbarkeit | 0.0 |
| Farbe | #64b5f6 |

**Ressourcen:**
- 🍖 **Nahrung** (Fischerei): 60-80% Chance, 200-500 Einheiten

**Besonderheit:** Flüsse werden prozedural generiert und fließen von Bergen/Hügeln bergab bis zum Ozean oder in Seen.

---

### 🏘️ Siedlung (Settlement)
**Charakteristik:** Entwickeltes Gebiet mit Bevölkerung und Infrastruktur - entsteht durch Spieleraktivität

| Eigenschaft | Wert |
|-------------|------|
| Sichtweite | 3 Hex-Felder |
| Bewegung | 1.3× (30% schneller - Straßen) |
| Fruchtbarkeit | 0.8 - 1.0 (bewirtschaftet) |
| Farbe | #974430 |

**Ressourcen:**
- Keine natürlichen Ressourcen (urbanes Gebiet)

**Bevölkerung:**
- Immer 10-25 Einwohner bei Entstehung

**Besonderheit:** 
- Kann NICHT während der Weltgenerierung spawnen
- Entsteht nur durch Spieler-Entwicklung eines Tiles
- **Konvertierungskriterien:**
  - Mindestens 5 Einwohner auf dem Tile
  - Mindestens 3 Gebäude
  - Mindestens 1 Wohngebäude (Residence)

**Vorteile:**
- Schnellere Bewegung durch ausgebaute Infrastruktur
- Sehr hohe Fruchtbarkeit für Farmen
- Zeigt entwickelte Gebiete auf der Karte

---

## Wasser-System

Das Spiel unterscheidet zwischen drei Arten von Wasser:

1. **Ozean** 🌊 - Tiefes Wasser an den Kontinentalrändern, generiert durch Continent-Noise
2. **See** 🏞️ - Binnengewässer, generiert an niedrigen Punkten im Inland
3. **Fluss** 〰️ - Fließgewässer, die von Bergen zu Ozeanen oder Seen fließen

### Fluss-Generation
Flüsse werden durch einen **Downhill-Algorithmus** generiert:
- Startpunkte: Zufällige Tiles in Bergen und Hügeln
- Fließrichtung: Immer zum niedrigsten Nachbar-Hex
- Ende: Wenn Ozean erreicht oder keine niedrigeren Nachbarn vorhanden

### See-Generation  
Seen spawnen an niedrigen Punkten (Elevation < 0.3) im Inland:
- Kreisförmige oder organische Form
- Radius: 3-8 Hex-Felder
- Können als Endpunkt für Flüsse dienen

---

## Strategische Überlegungen

### Beste Biome für...

**⚔️ Militärische Basen:**
- **Gebirge**: Beste Sichtweite für Verteidigung (trotz langsamer Bewegung)
- **Hügel**: Guter Kompromiss zwischen Sicht und Bewegung

**🏭 Ressourcenproduktion:**
- **Holz**: Nadelwald > Laubwald
- **Stein**: Gebirge > Hügel
- **Eisen**: Gebirge > Hügel
- **Gold**: Wüste > Gebirge
- **Nahrung**: Grasland > Laubwald

**🚶 Schnelle Truppenbewegung:**
- **Siedlung**: +30% Geschwindigkeit (beste)
- **Grasland**: +20% Geschwindigkeit
- **Steppe**: +10% Geschwindigkeit
- ❌ **Meiden**: Gebirge (-50%), Sumpf (-40%)

**🌾 Nahrungsproduktion:**
- **Siedlung**: 0.8-1.0 Fruchtbarkeit (beste)
- **Grasland**: 0.7-0.9 Fruchtbarkeit
- **Laubwald**: 0.6-0.8 Fruchtbarkeit
- ❌ **Ungeeignet**: Wüste, Gebirge

**🏘️ Siedlungsentwicklung:**
- Baue Wohngebäude (Residence) + weitere Gebäude auf einem Tile
- Warte bis mindestens 5 Einwohner dort leben
- Das Tile wird automatisch zu einer Siedlung konvertiert
- Profitiere von besserer Infrastruktur und Bewegungsgeschwindigkeit

---

## Implementierung

Die Biome-Definitionen befinden sich in:
- `shared/src/types.ts` - BiomeType Enum & BiomeDefinition Interface
- `shared/src/game-data.ts` - BIOME_DEFINITIONS mit allen Werten

Die Weltgenerierung in `server/src/scripts/generateWorld.ts` verwendet Multi-Layer-Noise:
1. **Kontinental-Noise**: Bestimmt Land vs. Wasser
2. **Elevation-Noise**: Bestimmt Höhe (Gebirge, Hügel, Flachland)
3. **Feuchtigkeit-Noise**: Bestimmt Klima (Wälder, Wüsten, Sümpfe)
4. **Temperatur**: Basiert auf Breitengrad + Noise

Diese Layer werden kombiniert, um realistische Biom-Verteilungen zu erzeugen.
