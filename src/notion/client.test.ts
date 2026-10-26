import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllTopics, pageToTopic, updateTopic } from "./client";
import { SUBJECTS } from "./config";

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

  it("queries every subject by database block ID, never by collection ID", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...empty, results: [page] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchAllTopics("tok");
    const urls = fetchMock.mock.calls.map(([url]) => url);

    expect(res.errors).toEqual([]);
    expect(res.topics).toHaveLength(SUBJECTS.length);
    expect(urls).toEqual(SUBJECTS.map((s) => `https://api.notion.com/v1/databases/${s.databaseId}/query`));
    for (const s of SUBJECTS) expect(urls.join()).not.toContain(s.collectionId);
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

    const topic = await updateTopic("tok", "abc", "hotovo");

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
