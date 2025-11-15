# 🔄 Datenbank Reset Guide

## Problem: Alte Ressourcen nach Postgres-Reset

Wenn du `clear-postgres` ausführst und dich dann neu einloggst, werden die Ressourcen möglicherweise aus **Redis Cache** geladen, nicht aus der neuen Postgres-Datenbank. Dies liegt daran, dass Redis Player-Sessions für 1 Stunde cached (TTL = 3600 Sekunden).

### Datenfluss beim Login:
1. **Erster Check: Redis** → Wenn Session existiert, lade Ressourcen von Redis
2. **Zweiter Check: PostgreSQL** → Wenn kein Redis, lade aus PostgreSQL
3. **Dritter Check: Neu** → Wenn kein PostgreSQL, erstelle neuen Spieler mit Startressourcen

## 🛠️ Verfügbare Reset-Scripts

### 1. `npm run clear-redis` ⚡ NEU!
**Löscht nur:** Redis Cache (Player Sessions, Building Sessions)  
**Behält:** PostgreSQL, MongoDB  

```bash
npm run clear-redis
```

**Wann verwenden:**
- Du möchtest gecachte Daten zurücksetzen, aber die Datenbank behalten
- Testen, ob Daten korrekt aus PostgreSQL geladen werden
- Probleme mit falschen gecachten Ressourcen beheben

---

### 2. `npm run clear-postgres` ✨ AKTUALISIERT!
**Löscht:** PostgreSQL + Redis Cache  
**Behält:** MongoDB (Welt-Daten)

```bash
npm run clear-postgres
```

**Wann verwenden:**
- Neues Spiel mit bestehender Welt starten
- Spieler-Daten, Gebäude, Units zurücksetzen
- **WICHTIG:** Löscht jetzt auch Redis Cache!

---

### 3. `npm run complete-cleanup`
**Löscht:** PostgreSQL + Redis + MongoDB (nur leeren, Struktur bleibt)  
**Behält:** Tabellen-Struktur in PostgreSQL

```bash
npm run complete-cleanup
```

**Wann verwenden:**
- Alle Spiel-Daten löschen, aber Schema behalten
- Schneller Reset ohne neue Weltgenerierung

---

### 4. `npm run full-reset` 🔥
**Löscht:** Alles (PostgreSQL + Redis + MongoDB)  
**Erstellt neu:** PostgreSQL Schema + Neue Welt

```bash
npm run full-reset
```

**Wann verwenden:**
- Kompletter Neustart mit neuer Welt
- Nach Schema-Änderungen
- Entwicklung: Frischer Start

**Schritte:**
1. ❌ Löscht alle Daten (MongoDB, Redis, PostgreSQL)
2. 🔧 Erstellt PostgreSQL Schema neu
3. 🗺️ Generiert neue Welt in MongoDB

---

## 📊 Status-Scripts

### Check Datenbank-Status
```bash
npm run db-stats       # MongoDB Status
npm run redis-stats    # Redis Keys und Memory
npm run postgres-stats # PostgreSQL Tabellen und Counts
```

---

## 🐛 Troubleshooting

### Problem: Alte Ressourcen nach clear-postgres
**Ursache:** Redis Cache wurde nicht geleert  
**Lösung:** Verwende das aktualisierte `npm run clear-postgres` (löscht jetzt Redis automatisch)

### Problem: Server findet keine Tabellen
**Ursache:** PostgreSQL Schema fehlt  
**Lösung:** 
```bash
npm run full-reset
```

### Problem: Spieler hat 0 Ressourcen trotz Produktion
**Ursache:** Redis Session verloren  
**Lösung:** PostgreSQL speichert Ressourcen beim onLeave(). Warte bis nächster Login oder Redis-TTL.

---

## ⚙️ Redis Cache Konfiguration

### Session TTL
- **Player Sessions:** 1 Stunde (3600s)
- **Building Sessions:** 2 Stunden (7200s)

### Keys Struktur
```
session:player:<username>     # Player Resources & Research
session:building:<buildingId> # Construction Progress
```

### Manuelle Redis-Befehle
```bash
# Alle Keys anzeigen
redis-cli KEYS "*"

# Einzelnen Spieler löschen
redis-cli DEL "session:player:admin"

# Alle Sessions löschen
redis-cli FLUSHDB
```

---

## 🎯 Best Practices

### Entwicklung
1. **Schneller Test:** `npm run clear-redis` → Cached-Daten weg
2. **Neues Spiel:** `npm run clear-postgres` → PostgreSQL + Redis weg
3. **Kompletter Reset:** `npm run full-reset` → Alles neu

### Produktion
- **NIE** `full-reset` oder `complete-cleanup` in Production verwenden!
- Verwende gezielte Backups und Migrations-Scripts
- Redis TTL sorgt automatisch für Cache-Cleanup

---

## 📝 Changelog

### v2.0 - Redis Integration Fix
- ✅ `clear-postgres` löscht jetzt auch Redis Cache
- ✅ Neues Script: `clear-redis` für isoliertes Redis-Cleanup
- ✅ `fullReset` erstellt jetzt `player_resources` Tabelle
- ✅ `completeCleanup` berücksichtigt `player_resources` Tabelle

### v1.0 - Initial Setup
- `clear-postgres` löschte nur PostgreSQL
- Ressourcen blieben in Redis cached (Bug!)
