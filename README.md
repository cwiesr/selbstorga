# Selbstorga – persönliches Selbstorganisations-Tool

Eigenständige Web-App (unabhängig vom Tennis-Tool). Läuft komplett im Browser,
ohne Server und ohne Datenbank – alle Daten liegen lokal im Gerät (localStorage).

## Nutzen / aufs Handy laden
1. `selbstorga/index.html` im Browser öffnen (oder das Verzeichnis als statische
   Seite hosten, z.B. auf Vercel/GitHub Pages).
2. Auf dem Handy im Browser-Menü **„Zum Startbildschirm hinzufügen"** wählen –
   dann startet es wie eine App (PWA, Vollbild).

> Hinweis: Ohne Sync werden Daten pro Gerät/Browser lokal gespeichert.
> **Geräte-Sync** (verschlüsselt, über mehrere Geräte) ist optional verfügbar –
> siehe `SETUP-SYNC.md`. Ohne Einrichtung läuft die App weiter komplett lokal/offline.

## Funktionen
- **Übersicht** – wichtigste To-dos aus allen Bereichen nach Dringlichkeit
  sortiert, Nachhak- und Überfällig-Listen, Schnell-Eingabe „morgen fällig".
- **Bereiche/Tabs** (wie Excel-Tabs) – frei anlegbar, umbenennbar, löschbar.
  Arbeit & Privat sind vorangelegt.
- **To-dos** – Wichtigkeit, Frist (erledigt bis), Nachhak-Datum, Notiz,
  **Milestones** (Teilschritte) und **Projekt**-Untergruppen.
- **Projekt → eigener Tab** – wird ein Projekt zu groß, per Klick „↗ eigener
  Tab" herauslösen.
- **Routinen** – Workout, LaVita, Meditation, Komfortzone, Kontakt … mit
  Tages-Score (%), 7-/30-Tage-Schnitt, Streak, 14-Tage-Verlauf, Fokus-Bewertung
  und automatisch gezählten erledigten To-dos.
- **Mind (Leben)** – tägliche Reflexionsfrage + Erinnerung (Spaß zuerst, Zeit
  für dich, coole Dinge erleben). Gedanken werden gespeichert.
- **Ideen** – nach Themenbereichen; jede Idee lässt sich zu einem To-do machen.
- **Lebenswünsche** – Reisen, Challenges, Erlebnisse; „💡 Schlag mir was vor"
  liefert Vorschläge zum Übernehmen.
- **Chat 💬** – natürlichsprachige Eingabe, z.B. *„Angebot schreiben bis Freitag
  wichtig Arbeit"* → wird zu Titel + Frist + Wichtigkeit + Bereich geparst.

- **Geräte-Sync (optional):** Ende-zu-Ende-verschlüsselt über eine Passphrase.
  Daten werden im Browser verschlüsselt, bevor sie in eine Postgres-DB gehen –
  Server/DB sehen nur Chiffretext. Einrichtung: `SETUP-SYNC.md`.

## Technik
- `index.html` – die App (HTML/CSS/JS inline), plus `manifest.webmanifest`.
- `api/sync.js` – optionaler Serverless-Endpunkt für den Geräte-Sync (Vercel + Postgres).
- `package.json` – nur für den Sync-Endpunkt (`pg`). Die App selbst braucht keinen Build.

## Bereich Leben / Arbeit (seit 2026-11-04)
Die App öffnet immer im Bereich **Leben** (Heute, Eingang, Erlebnisse, 100 Things, Alive, Mehr) und wechselt über „💼 Arbeit" in den bisherigen To-do-Bereich.
- `api/sort.js` ordnet Eingaben aus dem Eingang per Claude API ein (braucht `ANTHROPIC_API_KEY`).
- `api/push.js` sendet Web-Push-Erinnerungen (21:00 Abendfrage, So 18:00 Wochenrückblick, 1. So 18:15 Monatsplanung, 15. 18:00 100 Things). Tabellen und VAPID-Schlüssel legt es selbst in der Datenbank an (`DATABASE_URL`).
- `.github/workflows/reminders.yml` ruft den Endpoint alle 10 Minuten auf. Bei eigener Domain `APP_URL` als Repository-Variable setzen. Optional `CRON_SECRET` (Vercel-Env + GitHub-Secret) zum Absichern.
- Deep Links: `/?open=abend|woche|monat|things|eingang|arbeit|stunden`.
