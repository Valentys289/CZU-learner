# ČZU Study Dashboard (Fáze 3)

A thin, mobile-first web app on top of Honza's Notion school hub (SČHOOL). Notion stays the source of truth: nothing is migrated. Fáze 1 was read-only; Fáze 2 adds two write buttons (**Hotovo**, **Naučeno dnes**) that update a topic's properties in Notion.

> **Fáze 2 writes to Notion.** Fáze 1 only needed the **Read content** capability. The buttons fail with "Integrace nemá oprávnění Update content" until you enable **Update content** on the connection (see [Enable writes](#enable-writes-fáze-2)).

- **Dnes**: topics whose computed `Termín` is today or earlier. Overdue topics first (oldest first, red), then due today. Tap a row to open the topic in Notion.
- **Předměty**: the 6 subjects with counts *Po termínu / Dnes / Neučeno*. Tap a card to see its due topics and the not-yet-learned topics sorted by `Deadline`.
- **Hotovo / Naučeno dnes**: one-tap buttons on topic rows (see [Fáze 2](#fáze-2-writes)).
- **Timeline**: upcoming zápočty, tests and deadlines with a thin progress bar (see [Timeline](#timeline-sources-of-truth)). Read-only.

Stack: Vite + React + TypeScript, Vitest. The Notion token is used only by a small middleware inside the Vite dev/preview server (`/api/topics`), never in the browser.

## Setup

### 1. Create a Notion integration

1. Open <https://www.notion.so/profile/integrations> and click **New integration**.
2. Workspace: Kohlís school space. Type: **Internal**. Name it e.g. `ČZU Dashboard`.
3. Capabilities: **Read content** and **Update content**. Leave **Insert content** off, the app never creates pages.
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

### Enable writes (Fáze 2)

The existing connection **ČZU Study Dashboard** was created read-only for Fáze 1. Before using the buttons:

1. Open <https://www.notion.so/profile/integrations> and pick **ČZU Study Dashboard**.
2. Tab **Capabilities**: tick **Update content**, keep **Insert content** off, click **Save**.
3. The token does not change, so `.env.local` stays as it is. Restart `npm run dev` anyway.

### 3. Configure and run

```bash
git clone https://github.com/Valentys289/CZU-learner.git
cd CZU-learner
cp .env.example .env.local   # then paste the secret into NOTION_TOKEN
npm install
npm run dev               # http://localhost:5173 (also on your LAN IP, for the phone)
```

`.env.local` (gitignored, never commit it; `.env` works too):

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

## Fáze 2 (writes)

Two buttons, one tap each, disabled while the request runs:

- **Hotovo** on every due or overdue row (Dnes and the subject's *K opakování* list): "I finished the step that was due".
- **Naučeno dnes** on rows in the true Neučeno queue (`Hotovo` Neučeno or empty and no `Naučeno` date), in the subject's *Neučeno podle deadline* list.

The UI updates optimistically (the topic moves at once, counts update). If Notion refuses the write, the row is put back and a short Czech error is shown.

### Hotovo advance (`src/lib/hotovo.ts`, DEKAN rules)

| Current `Hotovo` | After **Hotovo** | Next Termín |
|------------------|------------------|-------------|
| Neučeno or empty (with `Naučeno` set) | večer, `Stav` = Retrieval | today + 2 |
| večer | 2 dny | today + 5 |
| 2 dny | 5 dní | today + 12 |
| 5 dní | 12 dní | today + 1 month (clamped to month end) |
| 12 dní | měsíc | none, done |
| měsíc | no button | |

Every advance sets `Poslední opakování` = today (Europe/Prague, date only). `Stav` is only written when leaving Neučeno.

**Naučeno dnes** = first learn plus that evening's retrieval: `Naučeno` = today, `Poslední opakování` = today, `Hotovo` = večer, `Stav` = Retrieval. Next Termín is today + 2.

Formula properties (`Termín`) are never written; the app recomputes Termín locally.

### Endpoint

`POST /api/topics/{pageId}/hotovo` and `POST /api/topics/{pageId}/nauceno` (Vite middleware). The server reads the page first (`GET /v1/pages/{id}`), checks that it belongs to one of the 6 Témata databases, computes the patch from Notion's current values (so a stale browser tab cannot skip a step), then `PATCH /v1/pages/{id}` and returns the updated topic.

The dev server listens on your LAN (`server.host: true`) so the phone can reach it. Since Fáze 2 the API can write, so only run it on a network you trust.

## Timeline: sources of truth

The Timeline tab makes **no extra Notion calls and no writes**. It reuses the topics already loaded for Dnes and combines them with a static baseline.

| Source | What it gives | Who updates it |
|--------|---------------|----------------|
| `src/timeline/baseline.ts` | Verified milestones (baseline 26. 10. 2026): dates, times, places, soft rows | DEKAN, by editing the file when sources change |
| Notion `Deadline` on topics | Live dates for milestones that declare a `deadlineMatch` (ICT Excel opravný, TD Téma SP) | Honza, in Notion |
| Notion `Naučeno` / `Hotovo` | Progress bars | Fáze 2 buttons or Notion |

Rules:

- **No invented days.** A milestone without a concrete day is a soft row (ICT esej "Konec listopadu", Excel "Začátek prosince", UE "Zápočet = docházka") with no date and no countdown.
- When a live Notion `Deadline` disagrees with the baseline, the card shows **both** dates with a **Konflikt zdrojů** badge, Notion first.
- TD Téma SP only appears while a TD topic still carries that `Deadline`.
- Matematika test 2 progress counts 4 bundles (Definiční obor, Inverzní funkce, Limity, Derivace) matched by topic title; Derivace is done only when both Asymptoty and Výpočet derivací are learned. A bundle with no matching topic shows a `?`. Badge Fáze A until 14. 11. 2026, Fáze B after. "Otevřít plán" links out to the test 2 study page.
- Other progress: "learned" = `Naučeno` set or `Hotovo` past Neučeno. Chemie and AJ count all topics of the subject.
- Sort: upcoming (soonest first), then Bez data, then Minulé (collapsed, most recent first). A conflict counts as past only when all its dates are.

### Chemie conflict

The zápočtová písemka date is **not resolved**: the Chemie page and the 23. 10. lecture summary say **út 5. 1. 2027**, the Termíny ČZU page says **6. 1. 2027**. The card shows "út 5. 1. 2027 / st 6. 1. 2027" with the Konflikt zdrojů badge. Once DEKAN or Honza confirms the real date, set `date` and remove `conflictDates` in `baseline.ts`.

## Out of scope

Milestone editing in the app, Moodle/UIS/Drive scraping, undo, snooze or skip, inserting or deleting pages, editing Fáze checklists inside topic pages, Google Calendar, Quizlet/flashcards, UIS/Moodle, auth and Vercel deploy.
