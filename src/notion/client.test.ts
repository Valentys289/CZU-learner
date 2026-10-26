import { describe, expect, it } from "vitest";
import { pageToTopic } from "./client";
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
