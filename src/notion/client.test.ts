import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllTopics,
  fetchChecklist,
  fetchMilniky,
  fetchSessions,
  fetchTreninky,
  logSession,
  pageToMilnikyRow,
  pageToSession,
  pageToTopic,
  setChecklistItem,
  undoSession,
  undoTopic,
  updateTopic,
  writePropsToNotion,
} from "./client";
import { MILNIKY, SUBJECTS, TRENINKY } from "./config";

const chemie = SUBJECTS.find((s) => s.code === "CH")!;

// Shape of a page from POST /v1/data_sources/{id}/query. Formulas come back without a value.
const page = {
  object: "page" as const,
  id: "abc",
  url: "https://www.notion.so/abc",
  properties: {
    Téma: { type: "title", title: [{ plain_text: "Redoxní " }, { plain_text: "reakce" }] },
    Hotovo: { type: "select", select: { name: "2 dny" } },
    "Poslední opakování": { type: "date", date: { start: "2026-10-18" } },
    Naučeno: { type: "date", date: { start: "2026-10-15T09:00:00.000+02:00" } },
    Deadline: { type: "date", date: null },
    Stav: { type: "select", select: { name: "Retrieval" } },
    Pořadí: { type: "number", number: 3 },
    Odkaz: { type: "url", url: null },
    Termín: { type: "formula", formula: { type: "date", date: null } },
  },
};

describe("pageToTopic", () => {
  it("maps Notion properties and computes Termín locally", () => {
    expect(pageToTopic(page, chemie, "2026-10-26")).toEqual({
      id: "abc",
      url: "https://www.notion.so/abc",
      subject: "CH",
      title: "Redoxní reakce",
      hotovo: "2 dny",
      nauceno: "2026-10-15",
      posledni: "2026-10-18",
      deadline: null,
      stav: "Retrieval",
      poradi: 3,
      odkaz: null,
      termin: "2026-10-23",
      dueState: "overdue",
    });
  });

  it("tolerates missing properties and unknown Hotovo values", () => {
    const t = pageToTopic(
      { ...page, properties: { Hotovo: { type: "select", select: { name: "???" } } } },
      chemie,
      "2026-10-26",
    );
    expect(t).toMatchObject({ title: "(bez názvu)", hotovo: null, termin: null, dueState: "none" });
  });
});

describe("fetchAllTopics request routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  const empty = { object: "list", results: [], has_more: false, next_cursor: null };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("queries every subject, Milníky and Tréninky by database block ID, never by collection ID", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...empty, results: [page] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAllTopics("tok");
    const urls = fetchMock.mock.calls.map(([url]) => url);

    expect(res.errors).toEqual([]);
    expect(res.topics).toHaveLength(SUBJECTS.length);
    expect(urls).toEqual(
      [...SUBJECTS, MILNIKY, TRENINKY].map((s) => `https://api.notion.com/v1/databases/${s.databaseId}/query`),
    );
    for (const s of [...SUBJECTS, MILNIKY, TRENINKY]) expect(urls.join()).not.toContain(s.collectionId);
  });

  it("resolves the real data source when the legacy endpoint refuses the database", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/query") && url.includes("/databases/")) {
        return json({ object: "error", status: 400, code: "validation_error", message: "multiple data sources" }, 400);
      }
      if (url.includes("/databases/")) return json({ object: "database", data_sources: [{ id: "ds-real" }] });
      return json({ ...empty, results: [page] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAllTopics("tok");

    expect(res.errors).toEqual([]);
    expect(res.topics).toHaveLength(SUBJECTS.length);
    expect(fetchMock).toHaveBeenCalledWith("https://api.notion.com/v1/data_sources/ds-real/query", expect.anything());
  });

  it("reports a 404 per subject without failing the others", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes(SUBJECTS[0].databaseId)
          ? json({ object: "error", status: 404, code: "object_not_found", message: "Could not find database" }, 404)
          : json(empty),
      ),
    );

    const res = await fetchAllTopics("tok");

    expect(res.errors).toEqual([{ subject: SUBJECTS[0].code, message: "Could not find database" }]);
  });
});

describe("updateTopic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  // 26. 10. 2026 in Prague.
  const now = new Date("2026-10-26T10:00:00Z");
  const inChemie = { ...page, parent: { type: "database_id", database_id: chemie.databaseId.replace(/-/g, "") } };

  it("reads the page, then PATCHes Hotovo + Poslední opakování only", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PATCH") return json(inChemie);
      return json({
        ...inChemie,
        properties: {
          ...inChemie.properties,
          Hotovo: { type: "select", select: { name: "5 dní" } },
          "Poslední opakování": { type: "date", date: { start: "2026-10-26" } },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { topic, previous, written } = await updateTopic("tok", "abc", "hotovo");

    expect(fetchMock.mock.calls.map(([url, init]) => [init?.method, url])).toEqual([
      ["GET", "https://api.notion.com/v1/pages/abc"],
      ["PATCH", "https://api.notion.com/v1/pages/abc"],
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({
      properties: {
        Hotovo: { select: { name: "5 dní" } },
        "Poslední opakování": { date: { start: "2026-10-26" } },
      },
    });
    expect(topic).toMatchObject({ hotovo: "5 dní", posledni: "2026-10-26", termin: "2026-11-07", dueState: "upcoming" });
    expect(previous).toEqual({ hotovo: "2 dny", posledni: "2026-10-18" });
    expect(written).toEqual({ hotovo: "5 dní", posledni: "2026-10-26" });
  });

  it("refuses pages outside the Témata databases without writing", async () => {
    const fetchMock = vi.fn(async () => json({ ...page, parent: { type: "page_id" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateTopic("tok", "abc", "hotovo")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an action that does not fit the topic (Naučeno dnes on a learned topic)", async () => {
    const fetchMock = vi.fn(async () => json(inChemie));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateTopic("tok", "abc", "nauceno")).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("undoTopic", () => {
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const inChemie = { ...page, parent: { type: "database_id", database_id: chemie.databaseId } };

  it("PATCHes the previous values back while Notion still holds the written ones", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PATCH") return json(inChemie);
      return json({ ...inChemie, properties: { ...inChemie.properties, Hotovo: { type: "select", select: { name: "večer" } } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const topic = await undoTopic("tok", "abc", { hotovo: "večer", posledni: null }, { hotovo: "2 dny", posledni: "2026-10-18" });

    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({
      properties: { Hotovo: { select: { name: "večer" } }, "Poslední opakování": { date: null } },
    });
    expect(topic.hotovo).toBe("večer");
  });

  it("refuses when the page changed since the write, without writing", async () => {
    const fetchMock = vi.fn(async () => json(inChemie));
    vi.stubGlobal("fetch", fetchMock);

    await expect(undoTopic("tok", "abc", { hotovo: "večer" }, { hotovo: "5 dní" })).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("writePropsToNotion", () => {
  it("clears with null and never writes Termín", () => {
    const props = writePropsToNotion({ hotovo: null, nauceno: null, stav: null, posledni: "2026-10-26" });
    expect(props).toEqual({
      Hotovo: { select: null },
      Naučeno: { date: null },
      Stav: { select: null },
      "Poslední opakování": { date: { start: "2026-10-26" } },
    });
    expect(props).not.toHaveProperty("Termín");
  });
});

describe("fetchAllTopics when nothing loads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws one error instead of six per-subject ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "unauthorized", message: "API token is invalid." }), { status: 401 })),
    );
    await expect(fetchAllTopics("tok")).rejects.toMatchObject({ status: 401 });
  });
});

describe("Milníky DB", () => {
  afterEach(() => vi.unstubAllGlobals());

  const rt = (text: string) => ({ type: "rich_text", rich_text: [{ plain_text: text }] });
  const milnik = {
    object: "page" as const,
    id: "m1",
    url: "https://www.notion.so/m1",
    properties: {
      Název: { type: "title", title: [{ plain_text: "Zápočtový test 2" }] },
      Předmět: { type: "select", select: { name: "Matematika" } },
      Typ: { type: "select", select: { name: "test" } },
      Datum: { type: "date", date: { start: "2026-12-05" } },
      Čas: rt("08:45"),
      Místo: rt("MI"),
      "Soft text": { type: "rich_text", rich_text: [] },
      "Konflikt data": { type: "rich_text", rich_text: [] },
      Aktivní: { type: "checkbox", checkbox: true },
      Poznámka: rt("Stejný slot: opravný test 1"),
      "Progress témata": rt("Inverzní funkce\nAsymptoty"),
      Pořadí: { type: "number", number: null },
      "Link plán": { type: "url", url: "https://example.com/plan" },
    },
  };

  it("maps a Milníky page to a row", () => {
    expect(pageToMilnikyRow(milnik)).toEqual({
      id: "m1",
      url: "https://www.notion.so/m1",
      nazev: "Zápočtový test 2",
      predmet: "Matematika",
      typ: "test",
      datum: "2026-12-05",
      cas: "08:45",
      misto: "MI",
      softText: null,
      konfliktData: null,
      aktivni: true,
      poznamka: "Stejný slot: opravný test 1",
      progressTemata: "Inverzní funkce\nAsymptoty",
      poradi: null,
      linkPlan: "https://example.com/plan",
    });
  });

  it("a missing Aktivní property counts as active", () => {
    const { Aktivní: _, ...rest } = milnik.properties;
    expect(pageToMilnikyRow({ ...milnik, properties: rest }).aktivni).toBe(true);
  });

  it("without a configured ID: no request, a clear Czech error", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchMilniky("tok", null)).toEqual({
      source: "unconfigured",
      rows: [],
      error: "Chybí Milníky DB v config, DEKAN doplní ID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries the configured DB by block ID; a failure is reported, not replaced by invented dates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("milniky-db")
          ? new Response(JSON.stringify({ results: [milnik], has_more: false, next_cursor: null }))
          : new Response(JSON.stringify({ message: "nope" }), { status: 404 }),
      ),
    );
    const ok = await fetchMilniky("tok", "milniky-db");
    expect(ok).toMatchObject({ source: "notion", error: null });
    expect(ok.rows).toHaveLength(1);

    const bad = await fetchMilniky("tok", "other-db");
    expect(bad).toEqual({ source: "notion", rows: [], error: "Milníky se nenačetly: nope" });
  });

  it("fetchAllTopics includes Milníky in the same pass", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ results: url.includes("milniky-db") ? [milnik] : [page], has_more: false, next_cursor: null })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchAllTopics("tok", undefined, "milniky-db", null);
    expect(res.milniky.rows.map((r) => r.nazev)).toEqual(["Zápočtový test 2"]);
    expect(res.topics).toHaveLength(SUBJECTS.length);
    expect(fetchMock).toHaveBeenCalledTimes(SUBJECTS.length + 1);
  });
});

describe("Tréninky DB (Fáze 6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const now = new Date("2026-10-26T10:00:00Z");
  const topicId = "11111111-2222-3333-4444-555555555555";
  const inChemie = { ...page, id: topicId, parent: { type: "database_id", database_id: chemie.databaseId } };
  const sessionPage = (over: Record<string, unknown> = {}) => ({
    object: "page" as const,
    id: "sess-1",
    url: "https://www.notion.so/sess-1",
    parent: { type: "database_id", database_id: "trenink-db" },
    properties: {
      Název: { type: "title", title: [{ plain_text: "2026-10-26 · Flashcards · Redoxní reakce" }] },
      Datum: { type: "date", date: { start: "2026-10-26" } },
      Metoda: { type: "select", select: { name: "flashcards" } },
      Skóre: { type: "number", number: 4 },
      Předmět: { type: "select", select: { name: "Chemie" } },
      Téma: { type: "rich_text", rich_text: [{ plain_text: "Redoxní reakce" }] },
      "Téma page ID": { type: "rich_text", rich_text: [{ plain_text: topicId }] },
      "Posunul gap": { type: "checkbox", checkbox: true },
      Zdroj: { type: "select", select: { name: "app" } },
    },
    ...over,
  });

  it("maps a Tréninky page to a session", () => {
    expect(pageToSession(sessionPage())).toEqual({
      id: "sess-1",
      topicPageId: topicId,
      subject: "CH",
      topicTitle: "Redoxní reakce",
      date: "2026-10-26",
      method: "flashcards",
      score: 4,
      advancedGap: true,
    });
  });

  it("logSession with Posunout gap: creates the row, then advances Hotovo; undo info covers both", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json(sessionPage());
      if (init?.method === "PATCH") {
        return json({
          ...inChemie,
          properties: {
            ...inChemie.properties,
            Hotovo: { type: "select", select: { name: "5 dní" } },
            "Poslední opakování": { type: "date", date: { start: "2026-10-26" } },
          },
        });
      }
      return json(inChemie);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await logSession("tok", "trenink-db", topicId, { method: "flashcards", score: 4, advanceGap: true });

    expect(fetchMock.mock.calls.map(([url, init]) => [init?.method, url])).toEqual([
      ["GET", `https://api.notion.com/v1/pages/${topicId}`],
      ["POST", "https://api.notion.com/v1/pages"],
      ["PATCH", `https://api.notion.com/v1/pages/${topicId}`],
    ]);
    const created = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(created.parent).toEqual({ database_id: "trenink-db" });
    expect(created.properties).toMatchObject({
      Metoda: { select: { name: "flashcards" } },
      Skóre: { number: 4 },
      Datum: { date: { start: "2026-10-26" } },
      Předmět: { select: { name: "Chemie" } },
      "Téma page ID": { rich_text: [{ text: { content: topicId } }] },
      "Posunul gap": { checkbox: true },
      Zdroj: { select: { name: "app" } },
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toEqual({
      properties: { Hotovo: { select: { name: "5 dní" } }, "Poslední opakování": { date: { start: "2026-10-26" } } },
    });
    expect(res.topic.hotovo).toBe("5 dní");
    expect(res.undo).toEqual({
      previous: { hotovo: "2 dny", posledni: "2026-10-18" },
      written: { hotovo: "5 dní", posledni: "2026-10-26" },
      sessionId: "sess-1",
    });
  });

  it("logSession without Posunout gap: only the row, Hotovo and Poslední untouched", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      json(init?.method === "POST" ? sessionPage() : inChemie),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await logSession("tok", "trenink-db", topicId, { method: "quizlet", score: 2, advanceGap: false });

    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST"]);
    const created = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(created.properties["Posunul gap"]).toEqual({ checkbox: false });
    expect(created.properties.Metoda).toEqual({ select: { name: "quizlet" } });
    expect(res.topic).toMatchObject({ hotovo: "2 dny", posledni: "2026-10-18" });
    expect(res.undo).toEqual({ previous: {}, written: {}, sessionId: "sess-1" });
  });

  it("archives the new row again when the topic write fails", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json(sessionPage());
      if (init?.method === "PATCH" && url.endsWith(topicId)) return json({ message: "no access" }, 403);
      if (init?.method === "PATCH") return json({});
      return json(inChemie);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      logSession("tok", "trenink-db", topicId, { method: "flashcards", score: 3, advanceGap: true }),
    ).rejects.toMatchObject({ status: 403 });
    const last = fetchMock.mock.calls.at(-1)!;
    expect(last[0]).toBe("https://api.notion.com/v1/pages/sess-1");
    expect(JSON.parse(last[1]!.body as string)).toEqual({ archived: true });
  });

  it("rejects bad input and a missing DB before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(logSession("tok", "trenink-db", topicId, { method: "flashcards", score: 6, advanceGap: true })).rejects.toMatchObject({
      status: 400,
      message: "Skóre musí být 1 až 5",
    });
    await expect(logSession("tok", "trenink-db", topicId, { method: "anki", score: 3, advanceGap: true })).rejects.toMatchObject({ status: 400 });
    await expect(logSession("tok", null, topicId, { method: "flashcards", score: 3, advanceGap: true })).rejects.toMatchObject({
      status: 503,
      message: "Chybí Tréninky DB v config, DEKAN doplní ID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses Posunout gap on a topic that cannot advance (měsíc), without creating a row", async () => {
    const done = { ...inChemie, properties: { ...inChemie.properties, Hotovo: { type: "select", select: { name: "měsíc" } } } };
    const fetchMock = vi.fn(async () => json(done));
    vi.stubGlobal("fetch", fetchMock);
    await expect(logSession("tok", "trenink-db", topicId, { method: "brainDump", score: 5, advanceGap: true })).rejects.toMatchObject({
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetchSessions filters by Téma page ID, newest first, 10 rows", async () => {
    const fetchMock = vi.fn(async () => json({ results: [sessionPage()], has_more: true, next_cursor: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    const sessions = await fetchSessions("tok", "trenink-db", topicId.replace(/-/g, "").toUpperCase());

    expect(sessions.map((s) => s.id)).toEqual(["sess-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      page_size: 10,
      filter: { property: "Téma page ID", rich_text: { equals: topicId } },
      sorts: [
        { property: "Datum", direction: "descending" },
        { timestamp: "created_time", direction: "descending" },
      ],
    });
  });

  it("fetchTreninky: last skóre per topic; unconfigured or failing never throws", async () => {
    const older = sessionPage({ id: "sess-0" });
    older.properties.Datum = { type: "date", date: { start: "2026-10-20" } };
    older.properties.Skóre = { type: "number", number: 1 };
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [sessionPage(), older], has_more: false, next_cursor: null })));
    expect(await fetchTreninky("tok", "trenink-db")).toEqual({
      configured: true,
      last: { [topicId]: { date: "2026-10-26", method: "flashcards", score: 4 } },
      error: null,
    });

    expect(await fetchTreninky("tok", null)).toEqual({ configured: false, last: {}, error: "Chybí Tréninky DB v config, DEKAN doplní ID" });

    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Could not find database" }, 404)));
    expect(await fetchTreninky("tok", "trenink-db")).toMatchObject({ configured: true, error: "Tréninky se nenačetly: Could not find database" });
  });

  it("undoSession archives only a row of this topic in the Tréninky DB", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => json(init?.method === "PATCH" ? {} : sessionPage()));
    vi.stubGlobal("fetch", fetchMock);
    await undoSession("tok", "trenink-db", "sess-1", topicId);
    expect(fetchMock.mock.calls.map(([url, init]) => [init?.method, url])).toEqual([
      ["GET", "https://api.notion.com/v1/pages/sess-1"],
      ["PATCH", "https://api.notion.com/v1/pages/sess-1"],
    ]);

    fetchMock.mockClear();
    await expect(undoSession("tok", "trenink-db", "sess-1", "99999999-2222-3333-4444-555555555555")).rejects.toMatchObject({ status: 404 });
    await expect(undoSession("tok", "other-db", "sess-1", topicId)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
});

describe("checklist in the page body (Fáze 7 B)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const inChemie = { ...page, parent: { type: "database_id", database_id: chemie.databaseId.replace(/-/g, "") } };
  const text = (t: string) => ({ rich_text: [{ plain_text: t }] });
  const todo = (id: string, t: string, checked = false) => ({ object: "block", id, type: "to_do", to_do: { ...text(t), checked } });
  const children = (results: unknown[], next: string | null = null) => ({ results, has_more: next !== null, next_cursor: next });

  /** abc: "1. faze" list item (with a nested to_do), a loose to_do, then "3. Retrieval" over two pages. */
  function notion(patchStatus = 200) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/pages/abc")) return json(inChemie);
      if (url.includes("/blocks/abc/children") && !url.includes("start_cursor")) {
        return json(
          children(
            [
              todo("loose", "mimo sekci"),
              { object: "block", id: "num", type: "numbered_list_item", has_children: true, numbered_list_item: text("faze") },
              { object: "block", id: "tbl", type: "table", has_children: true, table: {} },
              { object: "block", id: "h3", type: "heading_3", heading_3: text("3. Retrieval") },
            ],
            "c2",
          ),
        );
      }
      if (url.includes("/blocks/abc/children")) return json(children([todo("flash", "flashcards")]));
      if (url.includes("/blocks/num/children")) return json(children([todo("nested", "read with understanding", true)]));
      if (init?.method === "PATCH") {
        if (patchStatus !== 200) return json({ message: "Insufficient permissions" }, patchStatus);
        return json(todo("flash", "flashcards", JSON.parse(init.body as string).to_do.checked));
      }
      throw new Error(`unexpected ${url}`);
    });
  }

  it("reads the allowlisted page, paginates, follows list children but not tables", async () => {
    const fetchMock = notion();
    vi.stubGlobal("fetch", fetchMock);

    const { sections } = await fetchChecklist("tok", "abc");

    expect(sections).toEqual([
      { kind: "encoding", heading: "1. faze", items: [{ blockId: "nested", text: "read with understanding", checked: true }] },
      { kind: "retrieval", heading: "3. Retrieval", items: [{ blockId: "flash", text: "flashcards", checked: false }] },
    ]);
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls[0]).toBe("https://api.notion.com/v1/pages/abc");
    expect(urls.some((u) => u.includes("/blocks/tbl/"))).toBe(false);
  });

  it("PATCHes only to_do.checked on an item under a known section", async () => {
    const fetchMock = notion();
    vi.stubGlobal("fetch", fetchMock);

    await expect(setChecklistItem("tok", "abc", "flash", { checked: true })).resolves.toEqual({ blockId: "flash", checked: true });
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0][0]).toBe("https://api.notion.com/v1/blocks/flash");
    expect(JSON.parse(patches[0][1]!.body as string)).toEqual({ to_do: { checked: true } });
    // Never a Tréninky row or any other POST.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("refuses a to_do outside the Fáze sections, a bad body and a page outside Témata", async () => {
    const fetchMock = notion();
    vi.stubGlobal("fetch", fetchMock);
    await expect(setChecklistItem("tok", "abc", "loose", { checked: true })).rejects.toMatchObject({ status: 404 });
    await expect(setChecklistItem("tok", "abc", "flash", { checked: "yes" })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => json({ ...page, parent: { type: "page_id" } })));
    await expect(fetchChecklist("tok", "abc")).rejects.toMatchObject({ status: 404 });
  });

  it("passes a Notion refusal on (the UI reverts the tick)", async () => {
    vi.stubGlobal("fetch", notion(403));
    await expect(setChecklistItem("tok", "abc", "flash", { checked: true })).rejects.toMatchObject({ status: 403 });
  });
});
