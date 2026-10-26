# ČZU Study Dashboard (Fáze 6)

A thin, mobile-first web app on top of a Notion school hub (SČHOOL). Notion stays the source of truth: nothing is migrated. Fáze 1 was read-only; Fáze 2 adds two write buttons (**Hotovo**, **Naučeno dnes**) that update a topic's properties in Notion.

> **Fáze 2 writes to Notion.** Fáze 1 only needed the **Read content** capability. The buttons fail with "Integrace nemá oprávnění Update content" until you enable **Update content** on the connection (see [Enable writes](#enable-writes-fáze-2)).

- **Dnes**: topics whose computed `Termín` is today or earlier. Overdue topics first (oldest first, red), then due today. Tap a row to open the topic in Notion.
- **Předměty**: the 6 subjects with counts *Po termínu / Dnes / Neučeno*. Tap a card to see its due topics and the not-yet-learned topics sorted by `Deadline`.
- **Naučeno dnes**: one-tap button for first learn (see [Fáze 2](#fáze-2-writes)).
- **Hotovo / Trénink**: opens a small sheet to log a retrieval session (method + skóre 1 to 5) into the Notion **Tréninky** DB, and on a due topic also advance `Hotovo` (see [Tréninky: metody a skóre](#tréninky-metody-a-skóre)).
- **Timeline**: tests, zápočty and deadlines from the Notion **Milníky** DB, with a thin progress bar (see [Timeline: Milníky z Notion](#timeline-milníky-z-notion)). Read-only.

Stack: Vite + React + TypeScript, Vitest. The Notion token is used only by a small middleware inside the Vite dev/preview server (`/api/topics`), never in the browser.

## Setup

### 1. Create a Notion integration

1. Open <https://www.notion.so/profile/integrations> and click **New integration**.
2. Workspace: your school workspace. Type: **Internal**. Name it e.g. `ČZU Dashboard`.
3. Capabilities: **Read content**, **Update content** and **Insert content** (Insert is only for new rows in the Tréninky DB, see [Fáze 6](#tréninky-metody-a-skóre)). Leave everything else off.
4. Save and copy the **Internal Integration Secret** (`ntn_...`).

### 2. Share the databases with the integration

The integration only sees pages that are explicitly connected to it. Simplest: open the hub page **SČHOOL**, click `•••` → **Connections** → add `ČZU Dashboard`. Child pages and inline databases inherit the connection.

If you prefer to share selectively, connect each of these (`•••` → Connections on the database or its parent page):

- Předměty
- M Témata (Matematika)
- CH Témata (Chemie)
- ICT Témata (Informatika)
- TD Témata (Technická dokumentace)
- UE Témata (Udržitelná energetika)
- AJ Témata (Angličtina)
- Milníky (Timeline)
- Tréninky (session log)

All IDs live in `src/notion/config.ts`.

### Enable writes (Fáze 2)

The existing connection **ČZU Study Dashboard** was created read-only for Fáze 1. Before using the buttons:

1. Open <https://www.notion.so/profile/integrations> and pick **ČZU Study Dashboard**.
2. Tab **Capabilities**: tick **Update content** and, for Fáze 6, **Insert content**, click **Save**.
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
- Fáze 6: after a logged session the toast offers the same Zpět; it also archives the Tréninky row the save created.

## Tréninky: metody a skóre

Fáze 6 replaces the one-shot **Hotovo** with a small session tracker. The source of truth for how a topic was trained and how it went is the Notion **Tréninky** DB (under SČHOOL, next to Předměty and Milníky). The checklists in the topic pages (*3. Retrieval*, *4. Fáze čtyři*) stay human notes: the app never reads, ticks or renames them.

### In the app

- **Hotovo** on a due or overdue row opens the sheet: **Metoda** (Flashcards, Generated Qs, Brain dump, Quizlet, Jiné), **Skóre** 1 to 5 (1 katastrofa, 5 jistý, required), **Datum** (today by default, not in the future), **Posunout gap**, then **Uložit**.
- **Trénink** on a learned topic that is not due (Předměty, *Ostatní naučená*) opens the same sheet for extra practice.
- **Hotovo z Quizletu** in the sheet saves with method Quizlet (Skóre still required). Quizlet has no public API: the app never calls, scrapes or embeds Quizlet. If the topic's `Odkaz` is a quizlet.com link, the sheet shows a plain link to it.
- **Historie** in the sheet lists the topic's last 10 sessions (newest first). Rows show the last skóre as a chip (red 1 and 2, amber 3, green 4 and 5).
- **Naučeno dnes** stays a one-tap first learn with no session row.

### Preferované metody

Each subject has a short list of preferred methods in `PREFERRED_METHODS` (`src/lib/sessions.ts`). It is app config, not a Notion property, so changing it is a code edit:

| Předmět | Preferované |
|---------|-------------|
| M | Generated Qs, Brain dump, Flashcards |
| CH | Flashcards, Quizlet, Generated Qs |
| ICT | Flashcards, Generated Qs, Jiné |
| TD | Brain dump, Jiné, Flashcards |
| UE | Flashcards, Jiné |
| AJ | Quizlet, Flashcards, Generated Qs |

The sheet lists the preferred methods first and preselects the first one; the other methods stay available after them, dimmed. The open subject card in Předměty shows the list as *Metody: …*. With Skóre 1 or 2 the sheet adds a short tip ("Zkus příště jinou metodu."); it does not change the gap. Quizlet stays a manual log plus the optional `Odkaz` link. The *3. Retrieval* checklist in the topic body is not the session log: Tréninky is.

### Hotovo gap rule

| Topic | Posunout gap default | Uložit does |
|-------|----------------------|-------------|
| Due today or overdue | **on** | Tréninky row + the Fáze 2 Hotovo advance (`Poslední opakování` = the session day) |
| Not due (extra practice) | off | Tréninky row only, `Hotovo` / `Poslední opakování` untouched |
| `Hotovo` = měsíc | off, locked | Tréninky row only |

The toggle can be flipped either way before Uložit. The same method can be logged any number of times, on any day.

### Tréninky DB properties

| Property | Type | Written by the app |
|----------|------|--------------------|
| `Název` | title | `{datum} · {metoda} · {téma}` |
| `Datum` | date | Session day, date only |
| `Metoda` | select | `flashcards`, `generatedQs`, `brainDump`, `quizlet`, `other` (English keys; Czech labels only in the UI) |
| `Skóre` | number | 1 to 5 |
| `Předmět` | select | Subject name as in Předměty |
| `Téma` | text | Topic title at write time |
| `Téma page ID` | text | Topic page UUID (the join key) |
| `Posunul gap` | checkbox | Whether this save advanced Hotovo |
| `Poznámka` | text | Not written yet (kept for later) |
| `Zdroj` | select | Always `app` (`manual` for rows added by hand) |

Endpoints: `POST /api/topics/{pageId}/session` with `{ method, score, date?, advanceGap }`, `GET /api/topics/{pageId}/sessions`. The server checks the topic is in one of the 6 Témata DBs, creates the row, then (with Posunout gap) patches the topic. If the topic patch fails, the new row is archived again, so `Posunul gap` never lies. **Zpět** after a session reverts the topic fields and archives the row. To try another DB in dev: `NOTION_TRENINKY_DB=<database block id>` in `.env.local`. Without a configured DB the sheet says "Chybí Tréninky DB" and offers only the old Hotovo.

### Planning from scores

In Notion, filter Tréninky by `Skóre` ≤ 2 (optionally the last 14 days of `Datum`) and group by `Téma` or `Předmět` to see weak topics; group by `Metoda` to see which method works. Tréninky rows never appear on the Timeline and never create dates or pages elsewhere.

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
2. Its database block ID is in `MILNIKY.databaseId` in `src/notion/config.ts`.
3. To point a dev build at another DB: `NOTION_MILNIKY_DB=<database block id>` in `.env.local` (works with `npm run dev` and `npm run electron:dev`).

There is no hardcoded fallback. If the ID is missing the Timeline says "Chybí Milníky DB"; if the DB cannot be read (for example it is not shared with the connection) it shows the error. Either way no invented dates.

### Chemie conflict

The zápočtová písemka is **not resolved**: the Chemie page and the 23. 10. lecture summary say **út 5. 1. 2027**, Termíny ČZU says **6. 1. 2027**. In Milníky set `Konflikt data` to `2027-01-05,2027-01-06`; the card shows both dates with Konflikt zdrojů. Once the real date is confirmed, clear `Konflikt data`.

## Updates (in-place)

The installed app checks for a newer version 5 s after launch (quietly) and from the menu **CZU Study Dashboard → Zkontrolovat aktualizace…**. If a newer GitHub Release exists, it offers **Aktualizovat**:

1. Downloads the release's `.zip` (progress on the Dock icon) into a temp folder and unpacks it with `ditto`.
2. Checks the bundle: same app ID (`build.appId`) and the version of the release tag. Anything else is refused and the installed app stays as it is.
3. Quits. A small script waits for the app to exit, moves the new `.app` over the old one in Applications (keeping the old one until the new one is in place, restoring it if the move fails) and starts the new version.

No Finder, no `.dmg`, no drag and drop. This is done by the app itself because it is not signed with an Apple Developer ID: macOS (Squirrel.Mac, used by `electron-updater`) refuses to install updates into unsigned apps.

When the app cannot replace itself, it falls back to the old way (the `.dmg` goes to Stažené soubory and opens) and says why: it runs straight from the mounted `.dmg`, macOS runs it from a temporary copy (App Translocation, after opening it outside Applications), or the folder is not writable.

The app reads `GET /repos/{owner}/{repo}/releases` (the repo is public, no login needed), takes the newest published version and merges the assets of every release with that tag.

**First time:** an app older than 0.7.0 does not have this yet, so install 0.7.0 by hand once (download the `.dmg` from Releases, drag to Applications, Nahradit). Every later update installs itself.

### Publishing a release

```text
bump "version" in package.json → commit → git tag v0.7.0 && git push origin v0.7.0
→ .github/workflows/release.yml: creates the release as a draft, builds on macOS,
  uploads .dmg, .zip and latest-mac.yml, then publishes it as latest
```

The draft is created first on purpose: when electron-builder creates the release itself, the `.dmg` and `.zip` uploads race and one tag can end up with two half-filled releases.

Or locally on the Mac: `GH_TOKEN=<token with repo access> npm run electron:publish`, then publish the draft on GitHub. Never commit the token.

## Out of scope

Milestone editing in the app, parsing the Termíny page, Moodle/UIS/Drive scraping, snooze or skip, creating or deleting pages other than Tréninky rows, editing Fáze checklists inside topic pages, suggesting a method or changing gap lengths from skóre, Google Calendar, Quizlet/Anki sync, UIS/Moodle, auth and Vercel deploy.
