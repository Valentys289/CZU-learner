import { describe, expect, it } from "vitest";
import type { Topic } from "../types";
import { computeTermin, withTermin } from "./termin";
import { canPlan, parsePlanDate, planPatch, posledniFor } from "./plan";
import { dailyBlock, extraPractice } from "./block";
import { dumpBlocks, dumpPreview, parseSessionInput, sessionNote, sessionPatch, type LastSession } from "./sessions";

const TODAY = "2026-11-15";

let n = 0;
const topic = (over: Partial<Topic>): Topic =>
  withTermin(
    {
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
      termin: null,
      dueState: "none",
      ...over,
    },
    TODAY,
  );

describe("plan: next retrieval by hand", () => {
  it("posledniFor gives back the target for every step", () => {
    for (const step of ["večer", "2 dny", "5 dní", "12 dní"] as const) {
      for (const target of ["2026-11-20", "2026-12-01", "2027-01-31", "2027-03-15"]) {
        expect(computeTermin({ hotovo: step, nauceno: "2026-10-01", posledni: posledniFor(step, target) })).toBe(target);
      }
    }
  });
  it("month step: a month end no date reaches gets the closest earlier day", () => {
    const p = posledniFor("12 dní", "2027-03-31");
    expect(computeTermin({ hotovo: "12 dní", nauceno: null, posledni: p })).toBe("2027-03-28");
  });
  it("keeps the step and moves Poslední opakování", () => {
    expect(planPatch(topic({ hotovo: "5 dní" }), "2026-11-25")).toEqual({
      patch: { hotovo: "5 dní", posledni: "2026-11-13" },
      termin: "2026-11-25",
    });
  });
  it("first retrieval moves Naučeno", () => {
    expect(planPatch(topic({ hotovo: "Neučeno", nauceno: "2026-11-14", posledni: null }), "2026-11-17")).toEqual({
      patch: { hotovo: "Neučeno", nauceno: "2026-11-17" },
      termin: "2026-11-17",
    });
  });
  it("měsíc comes back at 12 dní", () => {
    const r = planPatch(topic({ hotovo: "měsíc" }), "2026-12-20");
    expect(r?.patch.hotovo).toBe("12 dní");
    expect(r?.termin).toBe("2026-12-20");
  });
  it("unlearned topics and úkoly cannot be planned", () => {
    expect(canPlan(topic({ hotovo: "Neučeno", nauceno: null }))).toBe(false);
    expect(planPatch(topic({ typ: "Úkol" }), "2026-11-20")).toBeNull();
  });
  it("parsePlanDate: after today, within a year", () => {
    expect(parsePlanDate("2026-11-16", TODAY)).toEqual({ ok: true, date: "2026-11-16" });
    expect(parsePlanDate(TODAY, TODAY)).toMatchObject({ ok: false });
    expect(parsePlanDate("2028-01-01", TODAY)).toMatchObject({ ok: false });
    expect(parsePlanDate("16. 11.", TODAY)).toMatchObject({ ok: false });
  });
});

describe("session with a hand-picked date", () => {
  const t = topic({ hotovo: "2 dny", posledni: "2026-11-10" });
  it("advance + date: next step, Termín on the picked day", () => {
    const r = sessionPatch(t, { gap: "advance", date: TODAY, termin: "2026-11-30" });
    expect(r?.patch.hotovo).toBe("5 dní");
    expect(r?.termin).toBe("2026-11-30");
  });
  it("Jen zápis + date: step stays, only the date moves", () => {
    const r = sessionPatch(t, { gap: "none", date: TODAY, termin: "2026-11-20" });
    expect(r?.patch.hotovo).toBe("2 dny");
    expect(r?.termin).toBe("2026-11-20");
  });
  it("first retrieval + advance + date", () => {
    const first = topic({ hotovo: "Neučeno", nauceno: TODAY, posledni: null });
    const r = sessionPatch(first, { gap: "advance", date: TODAY, termin: "2026-11-18" });
    expect(r?.patch).toMatchObject({ hotovo: "večer", stav: "Retrieval" });
    expect(r?.termin).toBe("2026-11-18");
  });
  it("note says the date was picked by hand", () => {
    const r = sessionPatch(t, { gap: "repeat", date: TODAY, termin: "2026-11-20" });
    expect(sessionNote("", t, r, { termin: "2026-11-20" })).toBe("Další opakování ručně na 2026-11-20");
  });
  it("parseSessionInput: termin and dump", () => {
    expect(parseSessionInput({ method: "brainDump", score: 4, gap: "advance", termin: "2026-11-20", dump: "  a\nb  " }, TODAY)).toMatchObject({
      ok: true,
      input: { termin: "2026-11-20", dump: "a\nb" },
    });
    expect(parseSessionInput({ method: "brainDump", score: 4, gap: "advance", termin: TODAY }, TODAY)).toMatchObject({ ok: false });
    expect(parseSessionInput({ method: "brainDump", score: 4, gap: "advance", dump: 3 }, TODAY)).toMatchObject({ ok: false });
  });
});

describe("brain dump", () => {
  it("body: heading, one paragraph per block of lines, 2000-character pieces", () => {
    const blocks = dumpBlocks(`first\nline\n\nsecond\n\n${"x".repeat(2500)}`);
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toMatchObject({ type: "heading_3" });
    expect(blocks[1]).toMatchObject({ paragraph: { rich_text: [{ text: { content: "first\nline" } }] } });
    expect(blocks.map((b) => ((b as { paragraph?: { rich_text: { text: { content: string } }[] } }).paragraph?.rich_text[0].text.content.length ?? 0))).toEqual([
      0, 10, 6, 2000, 500,
    ]);
    expect(dumpBlocks("   ")).toEqual([]);
  });
  it("Poznámka gets a one-line preview", () => {
    expect(dumpPreview("a\n\nb   c")).toBe("a b c");
    expect(dumpPreview("y".repeat(300))).toHaveLength(120);
    expect(sessionNote("", topic({}), null, { dump: "limita\nfunkce" })).toBe("Brain dump: limita funkce");
  });
});

describe("Dnešní blok with learned topics", () => {
  const last: Record<string, LastSession> = {};
  const due = topic({ subject: "M", posledni: "2026-11-10" }); // 2 dny step: due 15. 11.
  const old = topic({ subject: "CH", hotovo: "měsíc", posledni: "2026-09-01" });
  const recent = topic({ subject: "AJ", hotovo: "12 dní", posledni: "2026-11-01" }); // due 1. 12.
  const soon = topic({ subject: "TD", hotovo: "5 dní", posledni: "2026-11-04" }); // due 16. 11.
  const weak = topic({ subject: "UE", hotovo: "12 dní", posledni: "2026-11-10" });
  const today = topic({ subject: "ICT", hotovo: "12 dní", posledni: "2026-11-02" });
  const unlearned = topic({ hotovo: "Neučeno", nauceno: null, posledni: null });
  last[today.id.toLowerCase()] = { date: TODAY, method: "flashcards", score: 4 };
  last[weak.id.toLowerCase()] = { date: "2026-11-10", method: "flashcards", score: 2 };
  const all = [due, old, recent, soon, weak, today, unlearned];

  it("extras: weak first, then seen longest ago; never due, due soon, seen today or unlearned", () => {
    expect(extraPractice(all, last, TODAY, 10).map((t) => t.id)).toEqual([weak.id, old.id, recent.id]);
    expect(extraPractice(all, last, TODAY, 1).map((t) => t.id)).toEqual([weak.id]);
    expect(extraPractice(all, last, TODAY, 0)).toEqual([]);
  });
  it("block = due + extras, interleaved; left out topics are replaced", () => {
    const b = dailyBlock(all, last, TODAY, 2);
    expect(b.due.map((t) => t.id)).toEqual([due.id]);
    expect(b.extras.map((t) => t.id)).toEqual([weak.id, old.id]);
    expect(new Set(b.all.map((t) => t.id))).toEqual(new Set([due.id, weak.id, old.id]));
    const without = dailyBlock(all, last, TODAY, 2, new Set([weak.id, due.id]));
    expect(without.due).toEqual([]);
    expect(without.extras.map((t) => t.id)).toEqual([old.id, recent.id]);
  });
});
