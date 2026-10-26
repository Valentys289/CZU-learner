import { describe, expect, it } from "vitest";
import type { Hotovo, SubjectCode, Topic } from "../types";
import type { MilnikyResponse, MilnikyRow } from "./types";
import {
  buildTimeline,
  daysUntil,
  groupOf,
  isLearned,
  matchProgressTopics,
  milnikyRowToMilestone,
  progressTitles,
  sortMilestones,
  studyPhase,
  subjectProgress,
} from "./milestones";

const TODAY = "2026-10-26";

let n = 0;
function topic(subject: SubjectCode, title: string, hotovo: Hotovo | null = null, nauceno: string | null = null, deadline: string | null = null): Topic {
  return {
    id: `t${++n}`,
    url: "https://www.notion.so/x",
    subject,
    title,
    hotovo,
    nauceno,
    posledni: null,
    deadline,
    stav: null,
    poradi: null,
    odkaz: null,
    termin: null,
    dueState: "none",
  };
}

function row(r: Partial<MilnikyRow> & Pick<MilnikyRow, "nazev">): MilnikyRow {
  return {
    id: `r${++n}`,
    url: "https://www.notion.so/milnik",
    predmet: "Matematika",
    typ: "test",
    datum: null,
    cas: null,
    misto: null,
    softText: null,
    konfliktData: null,
    aktivni: true,
    poznamka: null,
    progressTemata: null,
    poradi: null,
    linkPlan: null,
    ...r,
  };
}

const notion = (rows: MilnikyRow[]): MilnikyResponse => ({ source: "notion", rows, error: null });

describe("isLearned / subjectProgress", () => {
  it("learned = Naučeno set or Hotovo past Neučeno", () => {
    expect(isLearned({ hotovo: null, nauceno: null })).toBe(false);
    expect(isLearned({ hotovo: "Neučeno", nauceno: null })).toBe(false);
    expect(isLearned({ hotovo: "Neučeno", nauceno: TODAY })).toBe(true);
    expect(isLearned({ hotovo: "večer", nauceno: null })).toBe(true);
  });

  it("empty set is 0 %, not NaN", () => {
    expect(subjectProgress([]).pct).toBe(0);
  });
});

describe("milnikyRowToMilestone", () => {
  it("maps date, time, place, note and links (Matematika test 2)", () => {
    const m = milnikyRowToMilestone(
      row({
        nazev: "Zápočtový test 2",
        datum: "2026-12-05",
        cas: "08:45",
        misto: "MI",
        poznamka: "Stejný slot: opravný test 1",
        linkPlan: "https://example.com/plan",
      }),
    )!;
    expect(m).toMatchObject({
      subject: "M",
      title: "Zápočtový test 2",
      kind: "test",
      date: "2026-12-05",
      time: "08:45",
      place: "MI",
      note: "Stejný slot: opravný test 1",
      sources: ["notion-milniky"],
    });
    expect(m.linkOut.map((l) => l.label)).toEqual(["Otevřít plán", "Notion"]);
  });

  it("takes the time from a Notion datetime when Čas is empty", () => {
    const m = milnikyRowToMilestone(row({ nazev: "x", datum: "2027-01-04T13:00:00.000+01:00" }))!;
    expect(m).toMatchObject({ date: "2027-01-04", time: "13:00" });
  });

  it("Chemie: Konflikt data with 2 dates gives a conflict, both dates kept, nothing picked", () => {
    const m = milnikyRowToMilestone(
      row({ nazev: "Zápočtová písemka", predmet: "Chemie", typ: "zapocet", datum: "2027-01-05", konfliktData: "2027-01-06, 2027-01-05" }),
    )!;
    expect(m.conflictDates).toEqual(["2027-01-05", "2027-01-06"]);
    expect(m.sources).toContain("conflict");
  });

  it("a single date in Konflikt data is not a conflict", () => {
    const m = milnikyRowToMilestone(row({ nazev: "x", datum: "2027-01-05", konfliktData: "2027-01-05" }))!;
    expect(m.conflictDates).toBeUndefined();
    expect(m.sources).toEqual(["notion-milniky"]);
  });

  it("empty Datum + Soft text stays soft, never gets a day", () => {
    const m = milnikyRowToMilestone(row({ nazev: "Esej", predmet: "Informatika", typ: "soft", softText: "konec listopadu" }))!;
    expect(m).toMatchObject({ date: null, softText: "konec listopadu", kind: "soft" });
    expect(groupOf(m, TODAY)).toBe("soft");
  });

  it("inactive rows and unknown subjects are excluded", () => {
    expect(milnikyRowToMilestone(row({ nazev: "zrušeno", aktivni: false, datum: "2026-12-01" }))).toBeNull();
    expect(milnikyRowToMilestone(row({ nazev: "x", predmet: "Fyzika" }))).toBeNull();
    expect(milnikyRowToMilestone(row({ nazev: "x", predmet: null }))).toBeNull();
  });

  it("unknown Typ falls back to test when dated, soft when not", () => {
    expect(milnikyRowToMilestone(row({ nazev: "x", typ: "???", datum: "2026-12-01" }))!.kind).toBe("test");
    expect(milnikyRowToMilestone(row({ nazev: "x", typ: null }))!.kind).toBe("soft");
  });
});

describe("matchProgressTopics", () => {
  const math = () => [
    topic("M", "Reálné funkce jedné proměnné", "večer", "2026-10-20"),
    topic("M", "Inverzní funkce", "Neučeno", null),
    topic("M", "Limity a spojitost (Bolzano, Weierstrass)", "2 dny", "2026-10-10"),
    topic("M", "Asymptoty", "večer", "2026-10-22"),
    topic("M", "Výpočet derivací", "Neučeno", null),
  ];

  it("matches exact titles and stable substrings, counts learned", () => {
    const p = matchProgressTopics(
      ["Reálné funkce jedné proměnné", "inverzní funkce", "Limity a spojitost", "Asymptoty", "Výpočet derivací"],
      math(),
    );
    expect(p.items.map((i) => [i.title, i.done, i.topicId !== null])).toEqual([
      ["Reálné funkce jedné proměnné", true, true],
      ["inverzní funkce", false, true],
      ["Limity a spojitost", true, true],
      ["Asymptoty", true, true],
      ["Výpočet derivací", false, true],
    ]);
    expect(p).toMatchObject({ total: 5, done: 3, pct: 0.6 });
  });

  it("an unmatched title counts as not done", () => {
    const p = matchProgressTopics(["Integrály"], math());
    expect(p.items[0]).toEqual({ title: "Integrály", topicId: null, done: false });
    expect(p.done).toBe(0);
  });

  it("progressTitles splits lines and drops blanks", () => {
    expect(progressTitles({ progressTemata: "A\n\n  B  \r\nC" })).toEqual(["A", "B", "C"]);
    expect(progressTitles({ progressTemata: null })).toEqual([]);
  });
});

describe("daysUntil", () => {
  it("Prague calendar days", () => {
    expect(daysUntil("2026-12-05", TODAY)).toBe(40);
    expect(daysUntil("2026-10-25", TODAY)).toBe(-1);
    expect(daysUntil("2026-10-26", "2026-10-24")).toBe(2);
  });
});

describe("sortMilestones", () => {
  const m = (title: string, date: string | null, conflictDates?: string[], order: number | null = null) => ({
    subject: "M" as const,
    title,
    date,
    conflictDates,
    order,
  });

  it("upcoming soonest first, then soft, then past (most recent first)", () => {
    const sorted = sortMilestones(
      [m("past old", "2026-09-01"), m("soft", null), m("later", "2027-01-08"), m("past", "2026-10-25"), m("soon", "2026-12-05"), m("today", TODAY)],
      TODAY,
    );
    expect(sorted.map((x) => x.title)).toEqual(["today", "soon", "later", "soft", "past", "past old"]);
  });

  it("Pořadí breaks ties on the same day", () => {
    const sorted = sortMilestones([m("b", "2027-01-06", undefined, 2), m("a", "2027-01-06", undefined, 1)], TODAY);
    expect(sorted.map((x) => x.title)).toEqual(["a", "b"]);
  });

  it("a conflict is past only when all its dates are", () => {
    expect(groupOf(m("c", "2026-10-25", ["2026-10-25", "2026-10-27"]), TODAY)).toBe("upcoming");
    expect(groupOf(m("c", "2026-10-24", ["2026-10-24", "2026-10-25"]), TODAY)).toBe("past");
  });
});

describe("buildTimeline", () => {
  const rows = () => [
    row({ nazev: "Zápočtový test 1", datum: "2026-10-25", cas: "08:45", misto: "MI" }),
    row({
      nazev: "Zápočtový test 2",
      datum: "2026-12-05",
      cas: "08:45",
      misto: "MI",
      poznamka: "Stejný slot: opravný test 1",
      progressTemata: "Inverzní funkce\nAsymptoty",
    }),
    row({ nazev: "Esej", predmet: "Informatika", typ: "soft", softText: "konec listopadu" }),
    row({ nazev: "Zrušený", datum: "2026-11-01", aktivni: false }),
  ];

  it("test 2 is the first upcoming card with progress from loaded topics; test 1 is past", () => {
    const topics = [topic("M", "Inverzní funkce", "večer", "2026-10-25"), topic("CH", "Inverzní funkce", "měsíc", "2026-09-01")];
    const tl = buildTimeline(topics, notion(rows()), TODAY);
    expect(tl.fallback).toBe(false);
    expect(tl.milestones.map((m) => [m.title, groupOf(m, TODAY)])).toEqual([
      ["Zápočtový test 2", "upcoming"],
      ["Esej", "soft"],
      ["Zápočtový test 1", "past"],
    ]);
    // Only Matematika topics count, so the CH topic with the same title is ignored.
    expect(tl.milestones[0].progress).toMatchObject({ total: 2, done: 1 });
    expect(tl.milestones[0].topicIds).toEqual([topics[0].id]);
  });

  it("topics with a Deadline never become Timeline cards", () => {
    const tl = buildTimeline([topic("ICT", "Excel opravný", null, null, "2027-01-06")], notion([]), TODAY);
    expect(tl.milestones).toEqual([]);
  });

  it("without a configured Milníky DB it falls back to the baseline, flagged", () => {
    const tl = buildTimeline([], { source: "baseline", rows: [], error: "Chybí Milníky DB v config" }, TODAY);
    expect(tl.fallback).toBe(true);
    expect(tl.milestones.every((m) => m.sources.includes("baseline-fallback"))).toBe(true);
    const test2 = tl.milestones.find((m) => m.title === "Zápočtový test 2")!;
    expect(test2).toMatchObject({ date: "2026-12-05", time: "08:45", place: "MI" });
    const ch = tl.milestones.find((m) => m.subject === "CH")!;
    expect(ch.conflictDates).toEqual(["2027-01-05", "2027-01-06"]);
    for (const title of ["Esej", "Excel 1. pokus", "Zápočet = docházka"]) {
      expect(tl.milestones.find((m) => m.title === title)?.date).toBeNull();
    }
  });

  it("reports active rows with an unknown subject", () => {
    expect(buildTimeline([], notion([row({ nazev: "Fyzika test", predmet: "Fyzika" })]), TODAY).skipped).toEqual(["Fyzika test"]);
  });
});

describe("studyPhase", () => {
  const test2 = (done: number) => ({ subject: "M" as const, title: "Zápočtový test 2", progress: { total: 5, done, pct: done / 5, items: [] } });

  it("Fáze A until 14. 11., A splněna when all learned, B after", () => {
    expect(studyPhase(test2(3), "2026-11-14")).toBe("A");
    expect(studyPhase(test2(5), "2026-11-14")).toBe("A-done");
    expect(studyPhase(test2(5), "2026-11-15")).toBe("B");
    expect(studyPhase({ ...test2(0), title: "Zápočtový test 3" }, TODAY)).toBeNull();
  });
});
