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

| What | Database block ID |
|------|-------------------|
| Předměty | `820212ad-dbb3-4c70-b7ca-ff4a64a86025` |
| M Témata (Matematika) | `58c6bc0a-a6e2-4463-9497-4b3ead3c62d5` |
| CH Témata (Chemie) | `44ee8c0b-067b-4d55-8b2f-7513356bb245` |
| ICT Témata (Informatika) | `6de1da79-7574-44a4-a7bc-3b7cb23c3715` |
| TD Témata (Technická dokumentace) | `09d8e793-3e5a-4c86-9b98-bf1647a142ea` |
| UE Témata (Udržitelná energetika) | `0281606c-8db6-4bde-b030-49e30a1c09db` |
| AJ Témata (Angličtina) | `8c9258f5-e060-421c-9a89-84ae4d263c9b` |

All IDs live in `src/notion/config.ts`.

### 3. Configure and run

```bash
git clone https://github.com/Valentys289/CZU-learner.git
cd CZU-learner
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

`src/notion/client.ts` queries each subject with `POST /v1/databases/{database_block_id}/query` (Notion-Version `2022-06-28`), with pagination. Trashed/archived pages are skipped.

The `collection://` IDs Notion shows internally are **not** API data source IDs: `POST /v1/data_sources/{collection_id}/query` returns 404. They are kept in `config.ts` as `collectionId` for reference only. If the legacy endpoint ever rejects a database (400, e.g. after a second data source is added to it), the client looks up the real data source ID with `GET /v1/databases/{id}` (`2025-09-03`) and queries that.

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
