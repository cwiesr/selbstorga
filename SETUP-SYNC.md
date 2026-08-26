# Geräte-Sync einrichten (einmalig)

Der Sync läuft nur in der **echten Web-Version** (Vercel), nicht in der Chat-Vorschau.
Alle Daten werden **im Browser Ende-zu-Ende verschlüsselt** – Server und Datenbank
sehen nur unlesbaren Chiffretext. Die Passphrase wird nie hochgeladen.

## 1. Kostenlose Datenbank bei Supabase anlegen
Supabase (supabase.com) bietet eine kostenlose PostgreSQL-Datenbank – reicht für dich allein.
1. Account anlegen → **New project** erstellen (Region z.B. Frankfurt/EU).
   Beim Erstellen wird ein **Datenbank-Passwort** vergeben – merken/kopieren.
2. Verbindungs-String holen: **Project Settings → Database → Connection string**.
   - Wähle dort **„Connection pooling"** (Transaction mode, Port **6543**) –
     das ist für Serverless (Vercel) der richtige, robuste String.
   - Kopiere die URI (Form:
     `postgresql://postgres.<ref>:<passwort>@aws-0-<region>.pooler.supabase.com:6543/postgres`).
   - Falls `[YOUR-PASSWORD]` als Platzhalter drinsteht, ersetze ihn durch dein
     Datenbank-Passwort aus Schritt 1.

Die Tabelle `sync_store` wird beim ersten Sync automatisch erstellt – du musst in
Supabase nichts anlegen. Zugriff läuft ausschließlich über den verschlüsselten
Endpunkt; Row-Level-Security musst du dafür nicht konfigurieren.

> Hinweis: Es geht auch der „Direct connection"-String (Port 5432). Für Serverless
> ist der **Pooler (6543)** aber die bessere Wahl, weil viele kurze Verbindungen
> entstehen.

## 2. App auf Vercel deployen
Das Vercel-Projekt **`selbstorga-web`** ist bereits vorbereitet (Root-Verzeichnis = `selbstorga`).
1. In Vercel das Projekt öffnen → **Settings → Git** → Repository
   `cwiesr/gruppeneinteilung` verbinden (einmalige GitHub-Freigabe).
2. **Settings → Environment Variables** → neue Variable:
   - Name: `DATABASE_URL`
   - Wert: die Connection-String aus Schritt 1
3. **Deploy** auslösen (oder Branch mergen). Fertig ist die URL `…vercel.app`.

## 3. In der App verbinden
1. App auf dem Handy/Laptop öffnen → oben rechts **⟳**.
2. Eine **starke Passphrase** eingeben (z.B. drei zufällige Wörter + Zahl).
   Dieselbe Passphrase auf jedem Gerät verwenden!
3. **Verbinden & abgleichen** tippen.
4. Auf dem zweiten Gerät genauso – die Daten erscheinen automatisch.

## Wichtig
- Die Passphrase kann **nicht** wiederhergestellt werden. Vergisst du sie,
  sind die verschlüsselten Server-Daten nicht mehr lesbar (lokal bleiben sie).
- Ohne `DATABASE_URL` antwortet der Endpunkt mit „DATABASE_URL ist nicht gesetzt".
- Konflikte werden pro Gesamtstand nach Zeitstempel gelöst (neuere Änderung gewinnt).
  Für Einzelnutzung auf mehreren Geräten passt das; bei paralleler Offline-Bearbeitung
  auf zwei Geräten kann eine Version gewinnen.

## Kosten
- Statische App + Serverless-Funktion: Vercel Hobby-Tier → **0 €**.
- Supabase Free-Tier → **0 €** (für Einzelnutzung locker ausreichend).
