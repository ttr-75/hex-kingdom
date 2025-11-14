# 🚀 Schnellstart-Anleitung

## Voraussetzungen

- **Node.js 20+** ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- Optional: Docker Desktop (für Datenbank)

## Installation

### 1. Dependencies installieren

Öffne PowerShell im Projektordner `hex-kingdom`:

```powershell
# Haupt-Dependencies
npm install

# Shared-Package bauen
cd shared
npm run build
cd ..

# Server-Dependencies
cd server
npm install
cd ..

# Client-Dependencies
cd client
npm install
cd ..
```

### 2. Datenbank starten (Optional)

Für persistente Daten (später benötigt):

```powershell
npm run docker:up
```

### 3. Server & Client starten

```powershell
# Alles parallel starten (empfohlen)
npm run dev
```

**Oder einzeln:**

```powershell
# Terminal 1: Server
cd server
npm run dev

# Terminal 2: Client
cd client
npm run dev
```

## Zugriff

- **Client:** http://localhost:5173
- **Server:** http://localhost:2567
- **Colyseus Monitor:** http://localhost:2567/colyseus

## Erste Schritte im Spiel

1. Öffne http://localhost:5173 in **2 Browser-Tabs** (für Multiplayer-Test)
2. Gib in jedem Tab einen Benutzernamen ein
3. Klicke "Spiel beitreten"
4. **Kamera-Controls:**
   - **Drag:** Linke Maustaste halten + bewegen
   - **Zoom:** Mausrad
5. **Gebäude bauen:**
   - Auf ein Hex-Feld klicken
   - Gebäude-Typ wählen
   - Warte bis Baufortschritt bei 100%
6. **Ressourcen beobachten:** Oben links in der HUD

## Troubleshooting

### "Cannot find module" Fehler
```powershell
# Lösche node_modules und installiere neu
Remove-Item -Recurse -Force node_modules, client/node_modules, server/node_modules, shared/node_modules
npm install
```

### Server startet nicht
```powershell
# Prüfe ob Port 2567 frei ist
netstat -ano | findstr :2567

# Falls belegt, beende Prozess:
taskkill /PID <PID> /F
```

### Client zeigt weiße Seite
```powershell
# Lösche Vite-Cache
cd client
Remove-Item -Recurse -Force .vite
npm run dev
```

### WebSocket-Verbindung schlägt fehl
- Stelle sicher, dass der Server läuft (http://localhost:2567/health sollte `{"status":"ok"}` zeigen)
- Prüfe Browser-Console auf Fehlermeldungen (F12)

## Entwicklung

### Code-Struktur
```
hex-kingdom/
├── shared/          # Gemeinsame Typen & Logik
│   └── src/
│       ├── types.ts       # Datenmodelle
│       ├── hex-utils.ts   # Hex-Grid-Mathematik
│       └── game-data.ts   # Gebäude/Tech-Definitionen
├── server/          # Colyseus Gameserver
│   └── src/
│       ├── index.ts       # Server-Einstiegspunkt
│       └── rooms/
│           ├── GameRoom.ts      # Spiellogik
│           └── GameRoomState.ts # State-Schema
└── client/          # React Frontend
    └── src/
        ├── App.tsx              # Haupt-Komponente
        ├── components/
        │   └── GameCanvas.tsx   # Map-Viewer
        ├── renderer/
        │   └── HexRenderer.ts   # PixiJS-Engine
        ├── network/
        │   └── NetworkManager.ts # WebSocket-Client
        └── store/
            └── gameStore.ts     # State-Management
```

### Live-Reload
Beide Dev-Server unterstützen Hot-Reload:
- **Client:** Änderungen in `client/src/` werden sofort sichtbar
- **Server:** Neustart bei Änderungen in `server/src/`

### Debugging

**Server:**
```powershell
# Mit Debugger (VS Code)
# Drücke F5 oder füge Breakpoints in server/src/ ein
```

**Client:**
```powershell
# Browser DevTools (F12)
# Console zeigt Netzwerk-Events und State-Updates
```

## Nächste Schritte

- [ ] Implementiere Marktplatz-UI (Task 4)
- [ ] Erweitere Forschungsbaum-Interface (Task 5)
- [ ] Füge Militär-Einheiten hinzu (Task 7)
- [ ] Erstelle Diplomatie-System (Task 9)

## Performance-Tipps

- **Viele Spieler:** Erhöhe `tickRate` in `server/src/rooms/GameRoom.ts` (Zeile 35)
- **Große Maps:** Passe `mapRadius` in `generateMap()` an (GameRoom.ts, Zeile 415)
- **Client-FPS:** Reduziere `HEX_SIZE` in `HexRenderer.ts` (Zeile 6)

## Support

Bei Fragen oder Problemen:
1. Prüfe `docs/GDD.md` für Design-Entscheidungen
2. Lies `server/src/rooms/GameRoom.ts` Kommentare
3. Schaue in Colyseus-Docs: https://docs.colyseus.io/

---

Viel Erfolg beim Entwickeln! 🎮
