# Hex Kingdom - Game Design Document

## 📋 Executive Summary

**Hex Kingdom** ist ein Echtzeit-Online-Strategiespiel, das in einer mittelalterlichen Fantasy-Welt spielt. Die Weltkarte ist in Hexagone unterteilt, auf denen Spieler Ressourcen abbauen, Gebäude errichten, handeln und optional militärisch expandieren können. Der Fokus liegt auf **wirtschaftlicher Entwicklung und Handel** – Militär ist teuer und ineffizient, was Spieler zu Diplomatie und friedlichem Wettbewerb motiviert.

---

## 🎮 Kern-Gameplay-Loop

1. **Erkunden** → Ressourcen-Knoten auf der Karte entdecken
2. **Sammeln** → Gebäude auf Ressourcen-Hexen bauen
3. **Produzieren** → Echtzeit-Ressourcenproduktion
4. **Handeln** → Mit anderen Spielern Ressourcen kaufen/verkaufen
5. **Forschen** → Tech-Tree für Produktions- und Handels-Boni
6. **Expandieren** → Neue Gebiete erschließen (friedlich oder militärisch)

---

## 🗺️ Hex-Grid-System

### Koordinaten
- **Axiales Koordinatensystem** (q, r)
- Flat-Top-Orientierung
- Distanzberechnung via Cube-Koordinaten

### Terrain-Typen
| Terrain  | Farbe   | Eigenschaften |
|----------|---------|---------------|
| Grasland | Grün    | Standard, keine Boni |
| Wald     | Dunkelgrün | +10% Holzproduktion |
| Berge    | Grau    | +15% Stein/Eisen-Produktion |
| Wasser   | Blau    | Nicht bebaubar, blockiert Bewegung |
| Wüste    | Beige   | -20% Nahrungsproduktion |

### Ressourcen-Knoten
- Spawnen zufällig auf der Karte (15% Chance pro Hex)
- Typen: Holz, Stein, Eisen, Gold
- Endliche Menge (500-1000 Einheiten)
- Regeneration: Nahrung (Farms) regeneriert, Mineralien nicht

---

## 🏗️ Gebäude-System

### Produktionsgebäude

#### 🪵 Sägewerk (Lumbermill)
- **Kosten:** 30 Holz, 25 Stein
- **Produktion:** 1.0 Holz/Sekunde
- **Bauzeit:** 40 Sekunden
- **Max Level:** 5 (+20% pro Level)

#### ⛏️ Bergwerk (Mine)
- **Kosten:** 50 Holz, 30 Stein
- **Produktion:** 0.5 Stein/s, 0.2 Eisen/s
- **Bauzeit:** 60 Sekunden
- **Max Level:** 5

#### 🌾 Farm
- **Kosten:** 40 Holz, 20 Stein
- **Produktion:** 0.8 Nahrung/Sekunde
- **Bauzeit:** 45 Sekunden
- **Max Level:** 5
- **Besonderheit:** Nahrung regeneriert nicht, muss kontinuierlich produziert werden

### Infrastruktur

#### 📦 Lagerhaus (Warehouse)
- **Kosten:** 60 Holz, 40 Stein
- **Effekt:** +500 Lagerkapazität für alle Ressourcen pro Level
- **Bauzeit:** 50 Sekunden
- **Max Level:** 10

#### 🏪 Marktplatz (Marketplace)
- **Kosten:** 80 Holz, 60 Stein, 50 Gold
- **Effekt:** Ermöglicht Handelsfunktionen
- **Bauzeit:** 90 Sekunden
- **Max Level:** 3 (reduziert Handelsgebühren pro Level)

#### 🔬 Forschungslabor (Research Lab)
- **Kosten:** 120 Holz, 100 Stein, 80 Gold
- **Effekt:** Ermöglicht Tech-Tree-Forschung
- **Bauzeit:** 150 Sekunden
- **Max Level:** 5 (reduziert Forschungszeit)

### Militär

#### ⚔️ Kaserne (Barracks)
- **Kosten:** 100 Holz, 80 Stein, 40 Eisen
- **Effekt:** Rekrutiert Militäreinheiten
- **Bauzeit:** 120 Sekunden
- **Max Level:** 5

---

## 💰 Handelssystem

### Marktplatz-Mechanik
1. Spieler erstellt **Verkaufsangebot:**
   - Ressource auswählen
   - Menge angeben
   - Preis pro Einheit in Gold festlegen
   - Gültigkeitsdauer: 1 Stunde

2. Andere Spieler können:
   - Angebote durchsuchen
   - Teilmengen kaufen
   - Sofort-Transaktion (keine Verhandlungen)

3. **Transaktionskosten:**
   - Basis: 5% Gebühr (geht an "Steuersystem")
   - Reduziert durch:
     - Marktplatz-Upgrades
     - Technologie "Handelsrouten"

### Dynamische Preise
- Kein fester Preis – Spieler bestimmen Markt
- Empfohlene Richtwerte:
  - Holz: 0.5 Gold/Einheit
  - Stein: 0.8 Gold/Einheit
  - Eisen: 1.5 Gold/Einheit
  - Nahrung: 0.3 Gold/Einheit

### Handelsverträge (Fortgeschritten)
- Erfordert Technologie "Diplomatie"
- Langfristige Lieferverträge zwischen Spielern
- Automatischer Ressourcenaustausch
- Vertragsbruch = Reputationsverlust

---

## 🔬 Forschungsbaum

### Wirtschaft-Zweig

#### Tier 1 (Keine Voraussetzungen)
- **Effizienter Bergbau** → Bergwerk +25% (100 Gold, 50 Stein, 120s)
- **Fortgeschrittene Landwirtschaft** → Farm +30% (80 Gold, 40 Holz, 100s)
- **Holzfälltechnik** → Sägewerk +25% (60 Gold, 30 Stein, 90s)
- **Lagererweiterung** → +50% Lagerkapazität (200 Gold, 100 Holz, 100 Stein, 200s)

#### Tier 2
- **Handelsrouten** → -20% Handelsgebühren (150 Gold, 50 Holz, 180s)
  - Voraussetzung: Keine

#### Tier 3
- **Diplomatie** → Schaltet Bündnisse und Verträge frei (300 Gold, 100 Nahrung, 240s)
  - Voraussetzung: Handelsrouten

### Infrastruktur-Zweig

#### Tier 1
- **Steinmetzkunst** → -15% Baukosten (120 Gold, 80 Stein, 130s)
- **Kartographie** → +2 Sichtweite (100 Gold, 50 Holz, 120s)

#### Tier 2
- **Ingenieurwesen** → -25% Bauzeit (180 Gold, 100 Stein, 50 Eisen, 200s)
  - Voraussetzung: Steinmetzkunst

### Militär-Zweig (Optional)

#### Tier 1
- **Waffenschmieden** → +20% Angriffswert (180 Gold, 100 Eisen, 150s)
- **Rüstungshandwerk** → +25% Verteidigung (200 Gold, 120 Eisen, 160s)

#### Tier 2
- **Kavallerieausbildung** → -30% Kavallerie-Rekrutierungszeit (250 Gold, 100 Nahrung, 180s)

---

## ⚔️ Militär-System

### Design-Philosophie
**Militär ist absichtlich teuer und ineffizient**, um Handel zu fördern.

### Einheiten

#### Krieger (Warrior)
- **Kosten:** 30 Holz, 20 Eisen, 10 Nahrung
- **Unterhalt:** 2 Nahrung/min, 1 Gold/min
- **Rekrutierungszeit:** 60s
- **Stats:** HP 100, Angriff 15, Verteidigung 10, Bewegung 3

#### Bogenschütze (Archer)
- **Kosten:** 40 Holz, 10 Eisen, 10 Nahrung
- **Unterhalt:** 1.5 Nahrung/min, 1 Gold/min
- **Rekrutierungszeit:** 50s
- **Stats:** HP 70, Angriff 20, Verteidigung 5, Bewegung 3

#### Kavallerie (Cavalry)
- **Kosten:** 50 Holz, 40 Eisen, 20 Nahrung, 30 Gold
- **Unterhalt:** 3 Nahrung/min, 3 Gold/min
- **Rekrutierungszeit:** 90s
- **Stats:** HP 120, Angriff 25, Verteidigung 12, Bewegung 5

### Kampf-Mechanik
- **Rundenbasiert** (trotz Echtzeit-Spiel)
- Schaden = `(Angriff - Verteidigung) * Zufallsfaktor (0.8-1.2)`
- Eroberung: Feld wird neutral, wenn alle Verteidiger besiegt sind
- Kann erst nach 10 Sekunden beansprucht werden

### Unterhalt-Strafen
- Ressourcen werden automatisch pro Minute abgezogen
- Wenn Nahrung < 0: Einheiten verlieren 5 HP/Sekunde
- Wenn Gold < 0: Einheiten desertieren nach 60 Sekunden

---

## 🎯 Spielziele & Siegbedingungen

### MVP (Phase 1)
- **Kein echtes "Spielende"** – Sandbox-Modus
- Spieler können jederzeit beitreten/verlassen
- Ziel: Größtes Reich aufbauen

### Zukünftig (Phase 2+)
1. **Eroberung:** Kontrolliere 60% der Karte
2. **Wirtschaft:** Erreiche 10.000 Gold
3. **Technologie:** Erforsche alle Technologien
4. **Zeit-Limit:** Höchste Punktzahl nach 2 Stunden

---

## 🌐 Multiplayer-Architektur

### Server
- **Colyseus** (WebSocket-Framework)
- Tick-Rate: 10 Updates/Sekunde
- State-Synchronisation: Automatisch via Colyseus Schema
- Persistenz: PostgreSQL für Spieler-Accounts, Redis für Sessions

### Client
- **React** + **PixiJS** (WebGL-Rendering)
- Zustand-Management: Zustand
- Optimierung: Nur sichtbare Hexfelder rendern

### Netzwerk-Protokoll
- **Befehle (Client → Server):**
  - `build` → Gebäude bauen
  - `research` → Technologie erforschen
  - `createTradeOffer` → Handelsangebot erstellen
  - `acceptTradeOffer` → Angebot annehmen
  - `moveUnit` → Einheit bewegen
  - `attackUnit` → Einheit angreifen

- **Events (Server → Client):**
  - `buildingCompleted` → Gebäude fertig
  - `researchCompleted` → Forschung abgeschlossen
  - `tradeCompleted` → Handel durchgeführt
  - `unitMoved` → Einheit bewegt
  - `combatResult` → Kampfergebnis

---

## 📊 Balancing-Tabelle

### Ressourcen-Konvertierung
| Rezept | Input | Output | Zeit |
|--------|-------|--------|------|
| Holz → Gold | 10 Holz | 4 Gold | Sofort (Markt) |
| Stein → Gold | 10 Stein | 6 Gold | Sofort (Markt) |
| Eisen → Gold | 10 Eisen | 12 Gold | Sofort (Markt) |

### ROI-Analyse (Return on Investment)
| Gebäude | Break-Even | Profit nach 1h |
|---------|------------|----------------|
| Sägewerk | ~75s | +3000 Holz |
| Bergwerk | ~100s | +1800 Stein |
| Farm | ~50s | +2400 Nahrung |

### Militär-Kosten vs. Handel
- **1 Krieger (30 min):** ~180 Nahrung + 30 Gold
- **Alternativ:** 180 Nahrung = 54 Gold (Verkauf) → Wirtschaft ist 2x effizienter!

---

## 🎨 UI/UX-Design

### HUD-Elemente
1. **Ressourcen-Anzeige** (oben links)
   - Aktuell / Maximale Kapazität
   - Farbcodierung bei niedrigen Reserven

2. **Minimap** (unten rechts)
   - Zeigt kontrollierte Gebiete
   - Spieler-Farben

3. **Bau-Menü** (Kontext-abhängig)
   - Erscheint bei Hex-Klick
   - Zeigt verfügbare Gebäude + Kosten

4. **Forschungs-Panel** (Tab-Menü)
   - Tech-Tree-Visualisierung
   - Fortschrittsbalken

5. **Marktplatz-Interface** (Tab-Menü)
   - Liste aktiver Angebote
   - Eigene Angebote verwalten

### Visuelle Stil
- **Farbpalette:** Dunkle Basis (#1a1a2e) + Cyan-Akzente (#4ECDC4)
- **Schriftart:** System-Fonts (Performance)
- **Animationen:** Subtil (Baufortschritt, Ressourcen-Tick)

---

## 📅 Entwicklungs-Roadmap

### Phase 1: MVP (Aktuell) ✅
- Hex-Grid-Rendering
- Gebäude-System (6 Typen)
- Ressourcen-Produktion
- Basis-Multiplayer

### Phase 2: Handel & Forschung (Next)
- Marktplatz-UI
- Tech-Tree komplett
- Diplomatie-System

### Phase 3: Militär (Optional)
- Einheiten-Rekrutierung
- Kampf-System
- Gebietseroberung

### Phase 4: Polish & Balance
- Persistente Accounts (Login-System)
- Leaderboards
- Tutorial
- Audio/SFX

---

## 🔧 Technische Anforderungen

### Server
- Node.js 20+
- PostgreSQL 16
- Redis 7
- RAM: 512 MB (klein), 2 GB (100+ Spieler)

### Client
- Moderne Browser (Chrome 90+, Firefox 88+, Safari 14+)
- WebGL 2.0 Support
- 2 GB RAM empfohlen

### Netzwerk
- WebSocket-Verbindung
- ~10 KB/s pro Spieler
- Latenz < 100ms empfohlen

---

## 📝 Changelog

### Version 0.1.0 (Aktuell)
- Initiales Projekt-Setup
- Hex-Grid-Engine
- Gebäude-System
- Echtzeit-Produktion
- Multiplayer-Grundlagen

---

**Entwickler:** GitHub Copilot  
**Datum:** 13. November 2025  
**Status:** In Entwicklung (MVP)
