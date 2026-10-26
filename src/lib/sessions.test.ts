import { describe, expect, it } from "vitest";
import type { Topic } from "../types";
import { afterHotovoClick } from "./hotovo";
import {
  buildSessionRow,
  defaultAdvanceGap,
  lastSessionByTopic,
  METHODS,
  normalizeScore,
  orderedMethods,
  parseSessionInput,
  PREFERRED_METHODS,
  preferredMethodsFor,
  sessionPatch,
  toPageId,
  type TrainingSession,
} from "./sessions";

const TODAY = "2026-10-26";

const topic: Pick<Topic, "id" | "subject" | "title" | "hotovo" | "nauceno" | "posledni"> = {
  id: "11111111222233334444555555555555",
  subject: "M",
  title: "Limity a spojitost (Bolzano, Weierstrass)",
  hotovo: "2 dny",
  nauceno: "2026-10-15",
  posledni: "2026-10-18",
};

describe("normalizeScore", () => {
  it.each([1, 2, 3, 4, 5, "4"])("%s is valid", (n) => {
    expect(normalizeScore(n)).toBe(Number(n));
  });
  it.each([0, 6, 2.5, -1, NaN, null, undefined, "", "x", "3.5"])("%s is rejected", (n) => {
    expect(normalizeScore(n)).toBeNull();
  });
});

describe("defaultAdvanceGap", () => {
  it("on for due or overdue topics that can still advance", () => {
    expect(defaultAdvanceGap({ ...topic, dueState: "overdue" })).toBe(true);
    expect(defaultAdvanceGap({ ...topic, dueState: "today" })).toBe(true);
  });
  it("off for extra practice (not due) and for finished or unlearned topics", () => {
    expect(defaultAdvanceGap({ ...topic, dueState: "upcoming" })).toBe(false);
    expect(defaultAdvanceGap({ ...topic, dueState: "done", hotovo: "měsíc" })).toBe(false);
    expect(defaultAdvanceGap({ ...topic, dueState: "today", hotovo: "Neučeno", nauceno: null })).toBe(false);
  });
});

describe("sessionPatch", () => {
  it("Posunout gap on = exactly the Fáze 2 Hotovo advance", () => {
    expect(sessionPatch(topic, { advanceGap: true, date: TODAY })).toEqual(afterHotovoClick({ ...topic, today: TODAY }));
    expect(sessionPatch(topic, { advanceGap: true, date: TODAY })?.patch).toEqual({ hotovo: "5 dní", posledni: TODAY });
  });
  it("uses the session day as Poslední opakování when back-dated", () => {
    expect(sessionPatch(topic, { advanceGap: true, date: "2026-10-25" })).toEqual({
      patch: { hotovo: "5 dní", posledni: "2026-10-25" },
      termin: "2026-11-06",
    });
  });
  it("Posunout gap off = no change to Hotovo / Poslední", () => {
    expect(sessionPatch(topic, { advanceGap: false, date: TODAY })).toBeNull();
  });
  it("cannot advance měsíc", () => {
    expect(sessionPatch({ ...topic, hotovo: "měsíc" }, { advanceGap: true, date: TODAY })).toBeNull();
  });
});

describe("parseSessionInput", () => {
  it("defaults the date to today", () => {
    expect(parseSessionInput({ method: "flashcards", score: 3, advanceGap: true }, TODAY)).toEqual({
      ok: true,
      input: { method: "flashcards", score: 3, date: TODAY, advanceGap: true },
    });
  });
  it.each([
    [{ method: "anki", score: 3, advanceGap: true }, "Vyber metodu"],
    [{ method: "flashcards", score: 0, advanceGap: true }, "Skóre musí být 1 až 5"],
    [{ method: "flashcards", score: 3, date: "2026-10-27", advanceGap: true }, "Datum tréninku nemůže být v budoucnu"],
    [{ method: "flashcards", score: 3, date: "26. 10.", advanceGap: true }, "Neplatné datum"],
    [{ method: "flashcards", score: 3 }, "Chybí volba Posunout gap"],
    [null, "Neplatná data tréninku"],
  ])("%o is rejected: %s", (body, error) => {
    expect(parseSessionInput(body, TODAY)).toEqual({ ok: false, error });
  });
});

describe("buildSessionRow", () => {
  it("Notion properties for Tréninky: English method key, subject name, dashed page ID, Zdroj app", () => {
    expect(buildSessionRow(topic, { method: "generatedQs", score: 2, date: TODAY }, false)).toEqual({
      Název: { title: [{ type: "text", text: { content: "2026-10-26 · Generated Qs · Limity a spojitost (Bolzano, Weierstrass)" } }] },
      Datum: { date: { start: TODAY } },
      Metoda: { select: { name: "generatedQs" } },
      Skóre: { number: 2 },
      Předmět: { select: { name: "Matematika" } },
      Téma: { rich_text: [{ type: "text", text: { content: topic.title } }] },
      "Téma page ID": { rich_text: [{ type: "text", text: { content: "11111111-2222-3333-4444-555555555555" } }] },
      "Posunul gap": { checkbox: false },
      Zdroj: { select: { name: "app" } },
    });
  });
  it("shortens a long title in Název only", () => {
    const long = "x".repeat(80);
    const row = buildSessionRow({ ...topic, title: long }, { method: "other", score: 5, date: TODAY }, true) as Record<
      string,
      { title?: { text: { content: string } }[]; rich_text?: { text: { content: string } }[] }
    >;
    expect(row.Název.title![0].text.content).toMatch(/^2026-10-26 · Jiné · x{47}…$/);
    expect(row.Téma.rich_text![0].text.content).toBe(long);
  });
  it("never writes formula or topic properties", () => {
    const keys = Object.keys(buildSessionRow(topic, { method: "quizlet", score: 3, date: TODAY }, true));
    expect(keys).not.toContain("Termín");
    expect(keys).not.toContain("Hotovo");
  });
});

describe("toPageId / lastSessionByTopic", () => {
  it("normalizes page IDs to dashed lower case", () => {
    expect(toPageId("11111111222233334444AAAAAAAAAAAA")).toBe("11111111-2222-3333-4444-aaaaaaaaaaaa");
    expect(toPageId("11111111-2222-3333-4444-aaaaaaaaaaaa")).toBe("11111111-2222-3333-4444-aaaaaaaaaaaa");
  });
  it("keeps the newest session per topic", () => {
    const s = (id: string, topicPageId: string, date: string, score: number): TrainingSession => ({
      id,
      topicPageId,
      subject: "M",
      topicTitle: "",
      date,
      method: "flashcards",
      score,
      advancedGap: false,
    });
    const a = "11111111-2222-3333-4444-555555555555";
    expect(lastSessionByTopic([s("1", a, "2026-10-26", 4), s("2", a, "2026-10-20", 1), s("3", a, "2026-10-26", 2)])).toEqual({
      [a]: { date: "2026-10-26", method: "flashcards", score: 4 },
    });
  });
});

describe("preferred methods (Fáze 7 E)", () => {
  it("each subject's preferred list uses valid keys only", () => {
    for (const list of Object.values(PREFERRED_METHODS)) for (const m of list) expect(METHODS).toContain(m);
  });

  it("preferredMethodsFor returns the configured order; unknown subject falls back to all methods", () => {
    expect(preferredMethodsFor("M")).toEqual(["generatedQs", "brainDump", "flashcards"]);
    expect(preferredMethodsFor("CH")).toEqual(["flashcards", "quizlet", "generatedQs"]);
    expect(preferredMethodsFor("XX")).toEqual([...METHODS]);
  });

  it("orderedMethods: preferred first, no duplicates, every method still available", () => {
    for (const subject of [...Object.keys(PREFERRED_METHODS), "XX"]) {
      const order = orderedMethods(subject);
      expect(new Set(order).size).toBe(order.length);
      expect([...order].sort()).toEqual([...METHODS].sort());
      expect(order.slice(0, preferredMethodsFor(subject).length)).toEqual(preferredMethodsFor(subject));
    }
    expect(orderedMethods("M")).toEqual(["generatedQs", "brainDump", "flashcards", "quizlet", "other"]);
    expect(orderedMethods("AJ")[0]).toBe("quizlet");
  });

  it("Matematika and Chemie open with different defaults", () => {
    expect(orderedMethods("M")[0]).not.toBe(orderedMethods("CH")[0]);
  });

  it("the Quizlet save still validates skóre and the gap rule does not change", () => {
    expect(parseSessionInput({ method: "quizlet", score: 0, advanceGap: false }, TODAY)).toEqual({ ok: false, error: "Skóre musí být 1 až 5" });
    expect(parseSessionInput({ method: "quizlet", score: 2, advanceGap: false }, TODAY)).toMatchObject({ ok: true });
    expect(defaultAdvanceGap({ ...topic, dueState: "today" })).toBe(true);
  });
});
