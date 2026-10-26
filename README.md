# ČZU Study Dashboard (Fáze 1)

A thin, mobile-first, read-only web app on top of Honza's Notion school hub (SČHOOL). Notion stays the source of truth: nothing is migrated and nothing is written back yet.

- **Dnes**: topics whose computed `Termín` is today or earlier. Overdue topics first (oldest first, red), then due today. Tap a row to open the topic in Notion.
- **Předměty**: the 6 subjects with counts *Po termínu / Dnes / Neučeno*. Tap a card to see its due topics and the not-yet-learned topics sorted by `Deadline`.
- **Timeline**: stub for Fáze 3.

Stack: Vite + React + TypeScript, Vitest. The Notion token is used only by a small middleware inside the Vite dev/preview server (`/api/topics`), never in the browser.

## Setup

### 1. Create a Notion integration

1. Open <https://www.notion.so/profile/integrations> and click **New integration**.
2. Workspace: Kohlís school space. Type: **Internal**. Name it e.g. `ČZU Dashboard`.
3. Capabilities: **Read content** is enough for Fáze 1 (Fáze 2 will need **Update content**).
4. Save and copy the **Internal Integration Secret** (`ntn_...`).

### 2. Share the databases with the integration

The integration only sees pages that are explicitly connected to it. Simplest: open the hub page **SČHOOL**, click `•••` → **Connections** → add `ČZU Dashboard`. Child pages and inline databases inherit the connection.

If you prefer to share selectively, connect each of these (`•••` → Connections on the database or its parent page):

| What | Data source (collection) ID |
|------|-----------------------------|
| Předměty | `d7dc58ab-50c1-41e5-b89c-56555930ba2f` |
| M Témata (Matematika) | `9defdb0c-8fe4-49fe-bec2-bcced09a161d` |
| CH Témata (Chemie) | `33a638c6-e8a3-47c8-a13e-cc645ecc96a7` |
| ICT Témata (Informatika) | `b2a9d095-4b31-4a3d-9a21-90edc0a3060b` |
| TD Témata (Technická dokumentace) | `1e4f5234-0705-4331-854c-f0b31d3a2ff1` |
| UE Témata (Udržitelná energetika) | `7b732ab0-5554-41db-8356-4a5fc531e766` |
| AJ Témata (Angličtina) | `7805fb3f-692d-467e-8f9d-891684e9f661` |

All IDs live in `src/notion/config.ts`.

### 3. Configure and run

```bash
cd czu-study-dashboard
cp .env.example .env      # then paste the secret into NOTION_TOKEN
npm install
npm run dev               # http://localhost:5173 (also on your LAN IP, for the phone)
```

`.env`:

```
NOTION_TOKEN=ntn_...
TZ=Europe/Prague          # optional, this is the default
```

If a subject can't be read (not shared, wrong ID), the other subjects still load and the app shows which one failed and why.

### Scripts

| Command | What |
|---------|------|
| `npm run dev` | Dev server with the `/api/topics` middleware |
| `npm test` | Vitest unit tests (Termín rules, Notion page mapping) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm run preview` | Production build, served with the same middleware |

## How Termín is computed

Notion formula values (`Termín`, `Další krok`, `Další retrieval`) are not reliably returned by the API, so `src/lib/termin.ts` recomputes them. Calendar dates only, today is taken in `Europe/Prague`.

`Hotovo` is the last **finished** step:

| Hotovo | Next Termín |
|--------|-------------|
| `Neučeno` (or empty) + `Naučeno` set | `Naučeno` (evening retrieval the same day) |
| `Neučeno` (or empty), no `Naučeno` | none (counted as Neučeno, listed by `Deadline`) |
| `večer` | `Poslední opakování` + 2 days |
| `2 dny` | `Poslední opakování` + 5 days |
| `5 dní` | `Poslední opakování` + 12 days |
| `12 dní` | `Poslední opakování` + 1 calendar month (31. 1. → 28./29. 2.) |
| `měsíc` | done, no Termín |

If `Hotovo` is past `Neučeno` but `Poslední opakování` is empty, `Naučeno` is the baseline. Datetime values are reduced to their calendar date.

## Notion API

`src/notion/client.ts` calls `POST /v1/data_sources/{id}/query` (Notion-Version `2025-09-03`) with pagination. If that endpoint rejects the request (400/404), it falls back to the legacy `POST /v1/databases/{database_block_id}/query` (`2022-06-28`). Trashed/archived pages are skipped.

## Fáze 2 (not implemented, writes)

To be confirmed with DEKAN before coding. Draft:

`markRetrievalDone(topic)`
1. Set `Poslední opakování` = today.
2. Advance `Hotovo`: Neučeno → večer, večer → 2 dny, 2 dny → 5 dní, 5 dní → 12 dní, 12 dní → měsíc (měsíc stays).
3. When coming from the first learn: also make sure `Naučeno` is set and `Stav` = `Retrieval`.

`markNauceno(topic)`: set `Naučeno` = today, `Poslední opakování` = today, `Hotovo` = `večer` after the evening retrieval. Exact semantics open, clarify with DEKAN.

Writes will need the integration's **Update content** capability and a `PATCH /v1/pages/{id}` endpoint in the middleware.

## Out of scope

Editing Fáze checklists inside topic pages, Google Calendar, Quizlet/flashcards, UIS/Moodle, auth and Vercel deploy, snooze.
