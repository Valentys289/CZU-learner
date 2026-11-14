import { describe, expect, it } from "vitest";
import type { Topic } from "../types";
import { weekAhead, blockSummary, dueBlock, examPrep, interleave, learnedThisMonth, recentlyLearned, reviewDay, suggestMethod } from "./block";

const TODAY = "2026-11-14"; // Saturday

let n = 0;
const topic = (over: Partial<Topic>): Topic => ({
  id: `${String(++n).padStart(8, "0")}-0000-0000-0000-000000000000`,
  url: "",
  subject: "M",
  title: `T${n}`,
  typ: "Téma",
  hotovo: "2 dny",
  nauceno: "2026-11-01",
  posledni: "2026-11-05",
  deadline: null,
  stav: "Retrieval",
  poradi: null,
  odkaz: null,
  termin: TODAY,
  dueState: "today",
  ...over,
});

describe("interleave", () => {
  it("round robin, never two of a subject in a row while another is left", () => {
    const list = [..."MMMM"].map(() => topic({ subject: "M" })).concat([topic({ subject: "CH" }), topic({ subject: "CH" }), topic({ subject: "AJ" })]);
    const order = interleave(list).map((t) => t.subject);
    expect(order).toHaveLength(7);
    expect(order.join(" ")).toBe("M CH M CH M AJ M");
  });
  it("keeps each subject's own order and handles one subject", () => {
    const a = topic({ subject: "M", title: "a" });
    const b = topic({ subject: "M", title: "b" });
    expect(interleave([a, b])).toEqual([a, b]);
    expect(interleave([])).toEqual([]);
  });
});

describe("dueBlock", () => {
  it("only due retrieval topics, no úkoly, interleaved", () => {
    const list = [
      topic({ subject: "M", dueState: "overdue", termin: "2026-11-10" }),
      topic({ subject: "M", dueState: "today" }),
      topic({ subject: "CH", dueState: "today" }),
      topic({ subject: "CH", dueState: "upcoming", termin: "2026-11-20" }),
      topic({ subject: "AJ", typ: "Úkol", dueState: "none", termin: null }),
    ];
    expect(dueBlock(list).map((t) => t.subject)).toEqual(["M", "CH", "M"]);
  });
});

describe("suggestMethod", () => {
  it("first preferred method that is not the last one", () => {
    expect(suggestMethod("M", null)).toBe("generatedQs");
    expect(suggestMethod("M", "generatedQs")).toBe("brainDump");
    expect(suggestMethod("M", "quizlet")).toBe("generatedQs");
  });
});

describe("reviews", () => {
  it("recentlyLearned: Naučeno in the last 7 days, learned topics only", () => {
    const inWeek = topic({ nauceno: "2026-11-08" });
    const list = [inWeek, topic({ nauceno: "2026-11-07" }), topic({ nauceno: null, hotovo: "Neučeno" }), topic({ nauceno: "2026-11-14", typ: "Úkol" })];
    expect(recentlyLearned(list, TODAY)).toEqual([inWeek]);
  });
  it("learnedThisMonth: same calendar month", () => {
    const list = [topic({ nauceno: "2026-11-01" }), topic({ nauceno: "2026-10-31" })];
    expect(learnedThisMonth(list, TODAY)).toHaveLength(1);
  });
  it("reviewDay: Sunday and the last day of the month", () => {
    expect(reviewDay("2026-11-14")).toEqual({ weekly: false, monthly: false });
    expect(reviewDay("2026-11-15")).toEqual({ weekly: true, monthly: false });
    expect(reviewDay("2026-11-30")).toEqual({ weekly: false, monthly: true });
    expect(reviewDay("2026-02-28")).toEqual({ weekly: false, monthly: true });
  });
});

describe("examPrep", () => {
  const strong = topic({ title: "strong", posledni: "2026-10-20", hotovo: "měsíc", dueState: "done", termin: null });
  const weak = topic({ title: "weak", posledni: "2026-10-20" });
  const fresh = topic({ title: "fresh", posledni: "2026-11-12" });
  const logged = topic({ title: "logged", posledni: "2026-10-01" });
  const unlearned = topic({ title: "new", hotovo: "Neučeno", nauceno: null, posledni: null });
  const all = [strong, weak, fresh, logged, unlearned];
  const ms = (over: object = {}) => ({
    id: "m1",
    subject: "M" as const,
    title: "Test 2",
    date: "2026-11-20",
    kind: "test" as const,
    topicIds: all.map((t) => t.id),
    ...over,
  });
  const last = {
    [strong.id]: { date: "2026-10-20", method: null, score: 5 },
    [weak.id]: { date: "2026-10-20", method: null, score: 2 },
    [logged.id]: { date: "2026-11-10", method: null, score: 4 },
  };

  it("lists learned topics not trained in the window, weakest first, even měsíc", () => {
    const [p] = examPrep([ms()], all, last, TODAY);
    expect(p.daysLeft).toBe(6);
    expect(p.todo.map((t) => t.title)).toEqual(["weak", "strong"]);
    expect(p).toMatchObject({ reviewed: 2, learned: 4, unlearned: 1, perDay: 1 });
  });
  it("skips milestones out of the horizon, past, without topics or of another kind", () => {
    expect(examPrep([ms({ date: "2026-12-20" })], all, last, TODAY)).toEqual([]);
    expect(examPrep([ms({ date: "2026-11-13" })], all, last, TODAY)).toEqual([]);
    expect(examPrep([ms({ topicIds: [] })], all, last, TODAY)).toEqual([]);
    expect(examPrep([ms({ kind: "odevzdani" })], all, last, TODAY)).toEqual([]);
    expect(examPrep([ms({ date: null })], all, last, TODAY)).toEqual([]);
  });
  it("test today: everything left is for today", () => {
    const [p] = examPrep([ms({ date: TODAY })], all, {}, TODAY);
    expect(p.daysLeft).toBe(0);
    expect(p.perDay).toBe(p.todo.length);
  });
});

describe("weekAhead", () => {
  it("counts upcoming retrieval per day and names tests", () => {
    const list = [
      topic({ dueState: "upcoming", termin: "2026-11-15" }),
      topic({ dueState: "upcoming", termin: "2026-11-15" }),
      topic({ dueState: "upcoming", termin: "2026-11-21" }),
      topic({ dueState: "upcoming", termin: "2026-11-22" }),
      topic({ dueState: "today" }),
    ];
    const days = weekAhead(list, [{ title: "Test 2", date: "2026-11-16", kind: "test" }, { title: "Esej", date: "2026-11-16", kind: "odevzdani" }], TODAY);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.retrieval)).toEqual([2, 0, 0, 0, 0, 0, 1]);
    expect(days[1]).toEqual({ date: "2026-11-16", retrieval: 0, tests: ["Test 2"] });
  });
});

describe("blockSummary", () => {
  it("count, average to one decimal, weak = skóre 1 to 2", () => {
    expect(blockSummary([{ score: 5 }, { score: 2 }, { score: 4 }])).toEqual({ count: 3, average: 3.7, weak: 1 });
    expect(blockSummary([])).toEqual({ count: 0, average: null, weak: 0 });
  });
});
