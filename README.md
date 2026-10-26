# ČZU Study Dashboard (Fáze 5)

A thin, mobile-first web app on top of Honza's Notion school hub (SČHOOL). Notion stays the source of truth: nothing is migrated. Fáze 1 was read-only; Fáze 2 adds two write buttons (**Hotovo**, **Naučeno dnes**) that update a topic's properties in Notion.

> **Fáze 2 writes to Notion.** Fáze 1 only needed the **Read content** capability. The buttons fail with "Integrace nemá oprávnění Update content" until you enable **Update content** on the connection (see [Enable writes](#enable-writes-fáze-2)).

- **Dnes**: topics whose computed `Termín` is today or earlier. Overdue topics first (oldest first, red), then due today. Tap a row to open the topic in Notion.
- **Předměty**: the 6 subjects with counts *Po termínu / Dnes / Neučeno*. Tap a card to see its due topics and the not-yet-learned topics sorted by `Deadline`.
- **Hotovo / Naučeno dnes**: one-tap buttons on topic rows (see [Fáze 2](#fáze-2-writes)).
- **Timeline**: tests, zápočty and deadlines from the Notion **Milníky** DB, with a thin progress bar (see [Timeline: Milníky z Notion](#timeline-milníky-z-notion)). Read-only.

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

## Mac app (Fáze 4)

The same UI packaged with Electron, so daily use is a double-click, no terminal. The app starts a small server on `127.0.0.1` (random port, only reachable from this Mac) that serves the built UI and the same `/api/topics` routes as `npm run dev`. The Notion token stays in the main process and is never sent to the page.

### Build the .app (once, on the Mac)

```bash
git fetch && git checkout faze-4-electron   # or main after merge
npm install
npm run electron:build
```

This produces `release/CZU Study Dashboard-<version>-arm64.dmg` (and a `.zip`) for Apple Silicon. Open the `.dmg`, drag **CZU Study Dashboard** to Applications, then drag it to the Dock.

The app is not signed with an Apple developer ID (only ad-hoc). A build you made yourself usually opens straight away. If macOS says it cannot verify the developer: System Settings, Privacy & Security, **Open Anyway** (once).

### Notion token in the app

- **First launch** shows a short form "Vlož Notion token". Paste the token of the **ČZU Study Dashboard** integration and click *Uložit a načíst*. If `~/CZU-learner/.env.local` exists, the form also offers to import the token from it (that file is the only place it looks).
- The token is stored encrypted with Electron `safeStorage` (the key lives in the macOS Keychain) in the app's data folder (`~/Library/Application Support/ČZU Study Dashboard/notion-token.bin`), never in the repo.
- To replace it (rotated token): menu **CZU Study Dashboard → Změnit Notion token…**. A rejected token also brings the form back.
- If Notion is unreachable (offline), the app shows a Czech error instead of a blank window; *Obnovit* retries.

### Develop with Electron

```bash
npm run electron:dev
```

Runs the Electron window against Vite (with hot reload) from this clone. Without a stored token it falls back to the clone's `.env.local`, like `npm run dev`. `npm run dev` in the browser keeps working as before.

Notion and plan links always open in your default browser. Auto-start on login, Windows/Linux builds and code signing are not part of v1.

## Zpět (undo)

After a successful **Hotovo** or **Naučeno dnes** a toast shows *Hotovo uloženo* / *Naučeno dnes* with **Zpět** for 5 seconds. Zpět writes the previous values back to Notion (only the fields the action changed: `Hotovo`, `Poslední opakování`, and for first learn also `Naučeno` and `Stav`; empty fields are cleared again) and the topic returns to its list.

- Only the last write can be undone; a new write replaces it.
- The previous values come from Notion right before the write (`POST /api/topics/{id}/hotovo` returns them), not from the browser's copy.
- `POST /api/topics/{id}/undo` refuses (409) if the page changed in Notion since the write, so a change made elsewhere is never overwritten. If undo fails, the app shows the error and reloads from Notion.
- Formula properties (`Termín`) are never written.

## Timeline: Milníky z Notion

Two kinds of things, kept apart:

| | What | Where in the app |
|---|------|------------------|
| **Milníky** | Tests, zápočty, odevzdání, soft terms, docházka | Timeline only, as milestone cards |
| **Témata** | Learning topics (Hotovo, Naučeno, retrieval) | Dnes and Předměty only |

- **Source of truth for dates = Notion DB Milníky** (under SČHOOL). Change a termín there, then *Obnovit* in the app (or reopen it). No code change, no new build.
- **Termíny ČZU** page = human-readable mirror. The app does not read it.
- **Témata `Deadline`** = study plan (when to finish learning a topic). It never creates a Timeline card.
- The Timeline reads Milníky in the same request as the topics (`GET /api/topics` returns `milniky`). Progress comes from the already loaded topics, no extra Notion calls, no writes.

### Milníky DB properties

| Property | Type | Used for |
|----------|------|----------|
| `Název` | title | Card title |
| `Předmět` | select | Matematika, Chemie, Informatika, Technická dokumentace, Udržitelná energetika, Angličtina (same names as Předměty). Other values are skipped and listed in a warning. |
| `Typ` | select | test, zapocet, zkouska, odevzdani, soft, dochazka, cviceni |
| `Datum` | date | Empty = **Bez data** (soft). A time on the date is used when `Čas` is empty. |
| `Čas`, `Místo` | text | "08:45", "13:00–14:15"; "MI", "ZII" |
| `Soft text` | text | The "when" for rows without a day ("konec listopadu") |
| `Konflikt data` | text | ISO dates separated by commas when sources disagree. 2 or more dates = **Konflikt zdrojů** badge, all dates shown, none picked. |
| `Aktivní` | checkbox | Unticked rows are hidden. Missing property = active. |
| `Poznámka` | text | Note line ("Stejný slot: opravný test 1") |
| `Progress témata` | text | One topic title per line, matched against that subject's Témata (exact, then substring). Empty = no progress bar. Unmatched titles show `?`. |
| `Pořadí` | number | Tie-break on the same day |
| `Link plán` | url | "Otevřít plán" link. Every card also links to its Milníky row in Notion. |

Sections: **Blížící se** (soonest first), **Bez data**, **Minulé** (collapsed). A conflict is past only when all its dates are. Matematika test 2 keeps the Fáze A / Fáze B badge (cutover 14. 11. 2026 in `src/timeline/config.ts`, not a date source).

### Wiring the DB (DEKAN)

1. Create the DB under SČHOOL with the properties above, share it with the **ČZU Study Dashboard** connection, seed the rows.
2. Its database block ID is in `MILNIKY.databaseId` in `src/notion/config.ts` (`8407eccc-a370-4006-8b5b-28f4a3071029`, data source `ac4c269a-5454-4a2e-8b22-4c5ad2112339`).
3. To point a dev build at another DB: `NOTION_MILNIKY_DB=<database block id>` in `.env.local` (works with `npm run dev` and `npm run electron:dev`).

There is no hardcoded fallback. If the ID is missing the Timeline says "Chybí Milníky DB"; if the DB cannot be read (for example it is not shared with the connection) it shows the error. Either way no invented dates.

### Chemie conflict

The zápočtová písemka is **not resolved**: the Chemie page and the 23. 10. lecture summary say **út 5. 1. 2027**, Termíny ČZU says **6. 1. 2027**. In Milníky set `Konflikt data` to `2027-01-05,2027-01-06`; the card shows both dates with Konflikt zdrojů. Once the real date is confirmed, clear `Konflikt data`.

## Updates (Fáze 5b)

The installed app checks for a newer version 5 s after launch (quietly) and from the menu **CZU Study Dashboard → Zkontrolovat aktualizace…**. If a newer GitHub Release exists, it offers **Stáhnout**: the new `.dmg` goes to Stažené soubory and opens; quit the app, drag it over the old one in Applications, start it again.

Why not a silent in-place update: the app is not signed with an Apple Developer ID, and macOS (Squirrel.Mac, used by `electron-updater`) refuses to install updates into unsigned apps. With a Developer ID this can be switched to `electron-updater`.

**Private repo:** GitHub's API does not show releases of a private repo without a login, so the in-app check cannot see them. In that case the menu item opens the Releases page in the browser (where you are logged in) and the quiet launch check stays silent. Making releases visible to the app needs either a public repo or a separate public repo just for releases (change `RELEASES` in `electron/update.ts` and `build.publish` in `package.json`).

### Publishing a release

```text
bump "version" in package.json → commit → git tag v0.5.0 && git push origin v0.5.0
→ .github/workflows/release.yml builds on macOS and publishes the GitHub Release (.dmg, .zip, latest-mac.yml)
```

Or locally on the Mac: `GH_TOKEN=<token with repo access> npm run electron:publish`. Never commit the token.

## Out of scope

Milestone editing in the app, parsing the Termíny page, Moodle/UIS/Drive scraping, snooze or skip, inserting or deleting pages, editing Fáze checklists inside topic pages, Google Calendar, Quizlet/flashcards, UIS/Moodle, auth and Vercel deploy.
