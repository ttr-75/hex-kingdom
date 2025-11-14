# Hex Kingdom - Medieval Fantasy Strategy Game

Ein Echtzeit-Online-Strategiespiel in einer mittelalterlichen Fantasy-Welt auf Hex-Grid-Basis.

## 🎮 Spielkonzept

- **Hex-basierte Weltkarte** mit Ressourcen-Knoten
- **Echtzeit-Wirtschaft:** Ressourcen sammeln, Gebäude bauen, Handel treiben
- **Handelsfokus:** Spieler-zu-Spieler Marktplatz, Diplomatie, Allianzen
- **Militär optional:** Truppen sind teuer (hoher Unterhalt) → Anreiz zu friedlichem Spiel
- **Forschungsbaum:** 12+ Technologien für Wirtschaft, Militär, Infrastruktur

## 🏗️ Tech-Stack

- **Client:** React 18 + TypeScript + PixiJS (WebGL-Rendering)
- **Server:** Node.js + TypeScript + Colyseus (Echtzeit-Gameserver)
- **Database:** PostgreSQL (Persistenz) + Redis (Sessions)
- **Deployment:** Docker + Docker Compose

## 📁 Projekt-Struktur

```
hex-kingdom/
├── client/          # React + PixiJS Frontend
├── server/          # Colyseus Gameserver
├── shared/          # Gemeinsame Types & Datenmodelle
├── docs/            # Game Design Dokumente
└── docker-compose.yml
```

## 🚀 Schnellstart

### Voraussetzungen
- Node.js 20+
- Docker & Docker Compose (optional für DB)

### Installation

```powershell
# Dependencies installieren
npm install

# Server & Client parallel starten
npm run dev
```

### Mit Docker

```powershell
# Datenbank starten
npm run docker:up

# Server & Client starten
npm run dev
```

Server läuft auf: `http://localhost:2567`  
Client läuft auf: `http://localhost:5173`

## 📚 Dokumentation

- [Game Design Document](./docs/GDD.md)
- [Hex-Grid System](./docs/HEX_SYSTEM.md)
- [Handelssystem](./docs/TRADING.md)
- [API Referenz](./docs/API.md)

## 🎯 MVP Features (Phase 1)

- ✅ Hex-Grid-Rendering mit PixiJS
- ✅ Ressourcen-System (5 Typen)
- ✅ Gebäude-System (6 Typen)
- ✅ Echtzeit-Produktion
- ⬜ Marktplatz (Angebote erstellen/kaufen)
- ⬜ Forschungsbaum (12 Technologien)
- ⬜ Militär-Grundlagen (3 Einheitentypen)
- ⬜ Multiplayer-Synchronisation

## 🧪 Testing

```powershell
npm run test
```

## 📦 Production Build

```powershell
npm run build
```

## 📝 Lizenz

MIT
