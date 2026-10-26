import { describe, expect, it } from "vitest";
import type { Hotovo, SubjectCode, Topic } from "../types";
import { BASELINE, type BaselineMilestone } from "./baseline";
import {
  buildTimeline,
  daysUntil,
  groupOf,
  isLearned,
  mathTest2Phase,
  mathTest2Progress,
  mergeMilestones,
  sortMilestones,
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

describe("isLearned / subjectProgress", () => {
  it("learned = Naučeno set or Hotovo past Neučeno", () => {
    expect(isLearned({ hotovo: null, nauceno: null })).toBe(false);
    expect(isLearned({ hotovo: "Neučeno", nauceno: null })).toBe(false);
    expect(isLearned({ hotovo: "Neučeno", nauceno: TODAY })).toBe(true);
    expect(isLearned({ hotovo: "večer", nauceno: null })).toBe(true);
  });

  it("counts done / total and pct", () => {
    const p = subjectProgress([
      { hotovo: "2 dny", nauceno: "2026-10-01" },
      { hotovo: null, nauceno: null },
      { hotovo: "Neučeno", nauceno: TODAY },
      { hotovo: "Neučeno", nauceno: null },
    ]);
    expect(p).toEqual({ total: 4, done: 2, pct: 0.5 });
  });

  it("empty set is 0 %, not NaN", () => {
    expect(subjectProgress([]).pct).toBe(0);
  });
});

describe("mathTest2Progress", () => {
  const math = () => [
    topic("M", "Reálné funkce jedné proměnné", "večer", "2026-10-20"),
    topic("M", "Inverzní funkce", "Neučeno", null),
    topic("M", "Limity a spojitost (Bolzano, Weierstrass)", "2 dny", "2026-10-10"),
    topic("M", "Asymptoty", "večer", "2026-10-22"),
    topic("M", "Výpočet derivací", "Neučeno", null),
    topic("CH", "Limity v chemii?", "měsíc", "2026-09-01"),
  ];

  it("counts 4 bundles; Derivace needs both Asymptoty and Výpočet derivací", () => {
    const p = mathTest2Progress(math());
    expect(p.bundles.map((b) => [b.name, b.done])).toEqual([
      ["Definiční obor", true],
      ["Inverzní funkce", false],
      ["Limity", true],
      ["Derivace", false],
    ]);
    expect(p).toMatchObject({ total: 4, done: 2, pct: 0.5 });
    expect(p.bundles[3].topicIds).toHaveLength(2);
  });

  it("all learned: 4/4", () => {
    const all = math().map((t) => ({ ...t, nauceno: t.nauceno ?? TODAY }));
    expect(mathTest2Progress(all)).toMatchObject({ done: 4, pct: 1 });
  });

  it("a bundle with no matching topic is not done and flagged not found", () => {
    const p = mathTest2Progress([topic("M", "Asymptoty", "měsíc", "2026-10-01")]);
    expect(p.bundles[3]).toMatchObject({ found: false, done: false });
    expect(p.done).toBe(0);
  });

  it("Fáze A until 14. 11., Fáze B after", () => {
    expect(mathTest2Phase("2026-11-14", 3)).toBe("A");
    expect(mathTest2Phase("2026-11-14", 4)).toBe("A-done");
    expect(mathTest2Phase("2026-11-15", 4)).toBe("B");
  });
});

describe("daysUntil", () => {
  it("Prague calendar days", () => {
    expect(daysUntil("2026-12-05", TODAY)).toBe(40);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
    expect(daysUntil("2026-10-25", TODAY)).toBe(-1);
    // Across the end of DST (25. 10. 2026) still whole days.
    expect(daysUntil("2026-10-26", "2026-10-24")).toBe(2);
  });
});

describe("mergeMilestones", () => {
  it("keeps the Chemie conflict: both dates, conflict source, no single date picked", () => {
    const ch = mergeMilestones(BASELINE, []).find((m) => m.id === "ch-pisemka")!;
    expect(ch.date).toBeNull();
    expect(ch.conflictDates).toEqual(["2027-01-05", "2027-01-06"]);
    expect(ch.sources).toContain("conflict");
  });

  it("a live Notion Deadline that disagrees with the baseline becomes a conflict, Notion shown", () => {
    const base: BaselineMilestone[] = [
      { id: "x", subject: "ICT", title: "Excel", kind: "test", date: "2027-01-06", sources: ["baseline"], deadlineMatch: /excel/i, progress: null },
    ];
    const [m] = mergeMilestones(base, [{ subject: "ICT", title: "Excel opravný", date: "2027-01-07", topicId: "p1" }]);
    expect(m).toMatchObject({ date: "2027-01-07", conflictDates: ["2027-01-06", "2027-01-07"], topicIds: ["p1"] });
    expect(m.sources).toEqual(expect.arrayContaining(["baseline", "notion-deadline", "conflict"]));
  });

  it("an agreeing Notion Deadline only adds the source", () => {
    const [m] = mergeMilestones(
      BASELINE.filter((b) => b.id === "ict-excel-opravny"),
      [{ subject: "ICT", title: "Excel opravný termín", date: "2027-01-06", topicId: "p1" }],
    );
    expect(m.date).toBe("2027-01-06");
    expect(m.conflictDates).toBeUndefined();
    expect(m.sources).toEqual(["baseline", "notion-deadline"]);
  });

  it("ignores Deadlines from another subject", () => {
    const [m] = mergeMilestones(
      BASELINE.filter((b) => b.id === "ict-excel-opravny"),
      [{ subject: "TD", title: "Excel opravný", date: "2027-01-09", topicId: "p1" }],
    );
    expect(m.date).toBe("2027-01-06");
  });

  it("TD Téma SP only appears while a topic still has the Deadline, dated from Notion", () => {
    expect(mergeMilestones(BASELINE, []).some((m) => m.id === "td-sp")).toBe(false);
    const sp = mergeMilestones(BASELINE, [{ subject: "TD", title: "Téma SP", date: "2026-11-01", topicId: "p1" }]).find(
      (m) => m.id === "td-sp",
    )!;
    expect(sp).toMatchObject({ date: "2026-11-01", sources: ["notion-deadline"] });
  });

  it("never gives soft rows a day", () => {
    for (const id of ["ict-esej", "ict-excel-1", "ue-dochazka"]) {
      expect(mergeMilestones(BASELINE, []).find((m) => m.id === id)?.date).toBeNull();
    }
  });
});

describe("sortMilestones", () => {
  const m = (title: string, date: string | null, conflictDates?: string[]) => ({ subject: "M" as const, title, date, conflictDates });

  it("upcoming soonest first, then soft, then past (most recent first)", () => {
    const sorted = sortMilestones(
      [m("past old", "2026-09-01"), m("soft", null), m("later", "2027-01-08"), m("past", "2026-10-25"), m("soon", "2026-12-05"), m("today", TODAY)],
      TODAY,
    );
    expect(sorted.map((x) => x.title)).toEqual(["today", "soon", "later", "soft", "past", "past old"]);
  });

  it("a conflict sorts by its earliest date and is past only when all dates are", () => {
    expect(groupOf(m("c", null, ["2026-10-25", "2026-10-27"]), TODAY)).toBe("upcoming");
    expect(groupOf(m("c", null, ["2026-10-24", "2026-10-25"]), TODAY)).toBe("past");
    const sorted = sortMilestones([m("b", "2027-01-06"), m("ch", null, ["2027-01-05", "2027-01-06"])], TODAY);
    expect(sorted[0].title).toBe("ch");
  });
});

describe("buildTimeline", () => {
  it("Matematika test 2 is the first upcoming milestone, with bundle progress and the plan link", () => {
    const tl = buildTimeline([topic("M", "Inverzní funkce", "večer", "2026-10-25")], TODAY);
    const first = tl[0];
    expect(first).toMatchObject({ id: "m-test-2", date: "2026-12-05", time: "08:45", place: "MI" });
    expect(first.progress).toEqual({ total: 4, done: 1, pct: 0.25 });
    expect(first.linkOut?.map((l) => l.label)).toEqual(["Otevřít plán", "Notion"]);
    expect(tl.at(-1)?.id).toBe("m-test-1");
  });
});
