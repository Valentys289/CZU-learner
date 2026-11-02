import { describe, expect, it } from "vitest";
import { afterHotovoClick, afterNaucenoClick, afterTaskDoneClick, applyAction, buildUndoSnapshot, canMarkHotovo, canMarkNauceno, canMarkTaskDone, nextHotovo } from "./hotovo";
import type { Hotovo } from "../types";

const TODAY = "2026-10-26";

describe("nextHotovo (advance table)", () => {
  it.each<[Hotovo | null, Hotovo | null]>([
    ["Neučeno", "večer"],
    [null, "večer"],
    ["večer", "2 dny"],
    ["2 dny", "5 dní"],
    ["5 dní", "12 dní"],
    ["12 dní", "měsíc"],
    ["měsíc", null],
  ])("%s -> %s", (current, next) => {
    expect(nextHotovo(current)).toBe(next);
  });
});

describe("afterHotovoClick", () => {
  it("Neučeno with Naučeno (evening retrieval): večer, Stav Retrieval, Termín today + 2", () => {
    expect(afterHotovoClick({ hotovo: "Neučeno", nauceno: "2026-10-20", posledni: null, today: TODAY })).toEqual({
      patch: { hotovo: "večer", posledni: TODAY, stav: "Retrieval" },
      termin: "2026-10-28",
    });
  });

  it("empty Hotovo is treated as Neučeno", () => {
    expect(afterHotovoClick({ hotovo: null, nauceno: "2026-10-20", posledni: null, today: TODAY })?.patch).toEqual({
      hotovo: "večer",
      posledni: TODAY,
      stav: "Retrieval",
    });
  });

  it("fills an empty Naučeno when leaving Neučeno", () => {
    expect(afterHotovoClick({ hotovo: "Neučeno", nauceno: null, posledni: null, today: TODAY })?.patch.nauceno).toBe(
      TODAY,
    );
  });

  it.each<[Hotovo, Hotovo, string | null]>([
    ["večer", "2 dny", "2026-10-31"],
    ["2 dny", "5 dní", "2026-11-07"],
    ["5 dní", "12 dní", "2026-11-26"],
    ["12 dní", "měsíc", null],
  ])("%s -> %s, Poslední = today, Termín %s, Stav untouched", (hotovo, next, termin) => {
    expect(afterHotovoClick({ hotovo, nauceno: "2026-10-01", posledni: "2026-10-10", today: TODAY })).toEqual({
      patch: { hotovo: next, posledni: TODAY },
      termin,
    });
  });

  it("5 dní -> 12 dní on 31. 1.: Termín clamps to the last day of February", () => {
    expect(afterHotovoClick({ hotovo: "5 dní", nauceno: null, posledni: null, today: "2027-01-31" })?.termin).toBe(
      "2027-02-28",
    );
  });

  it("měsíc is a no-op", () => {
    expect(afterHotovoClick({ hotovo: "měsíc", nauceno: "2026-09-01", posledni: "2026-10-01", today: TODAY })).toBeNull();
  });
});

describe("afterNaucenoClick", () => {
  it("sets Naučeno, Poslední, Hotovo večer and Stav Retrieval; Termín today + 2", () => {
    expect(afterNaucenoClick({ today: TODAY })).toEqual({
      patch: { hotovo: "večer", posledni: TODAY, nauceno: TODAY, stav: "Retrieval" },
      termin: "2026-10-28",
    });
  });
});

describe("which button a topic gets", () => {
  it("true Neučeno queue gets Naučeno dnes, not Hotovo", () => {
    const t = { hotovo: "Neučeno" as const, nauceno: null, posledni: null };
    expect(canMarkNauceno(t)).toBe(true);
    expect(canMarkHotovo(t)).toBe(false);
    expect(applyAction("hotovo", t, TODAY)).toBeNull();
  });

  it("learned topics get Hotovo, not Naučeno dnes", () => {
    const t = { hotovo: "Neučeno" as const, nauceno: TODAY, posledni: null };
    expect(canMarkHotovo(t)).toBe(true);
    expect(canMarkNauceno(t)).toBe(false);
    expect(applyAction("nauceno", t, TODAY)).toBeNull();
  });

  it("měsíc gets neither", () => {
    const t = { hotovo: "měsíc" as const, nauceno: "2026-09-01", posledni: "2026-10-01" };
    expect(canMarkHotovo(t)).toBe(false);
    expect(canMarkNauceno(t)).toBe(false);
  });
});

describe("úkol Hotovo (Fáze 9 B)", () => {
  const task = { typ: "Úkol" as const, hotovo: null, nauceno: null, posledni: null };

  it("writes only Hotovo = měsíc and Stav = Stable (no Poslední, no Naučeno)", () => {
    expect(afterTaskDoneClick()).toEqual({ patch: { hotovo: "měsíc", stav: "Stable" }, termin: null });
    expect(applyAction("ukol", task, TODAY)?.patch).toEqual({ hotovo: "měsíc", stav: "Stable" });
  });

  it("only on an open úkol; Hotovo / Naučeno dnes never on an úkol", () => {
    expect(canMarkTaskDone(task)).toBe(true);
    expect(canMarkTaskDone({ ...task, hotovo: "měsíc" })).toBe(false);
    expect(canMarkTaskDone({ hotovo: null, nauceno: null, posledni: null })).toBe(false);
    expect(canMarkHotovo({ ...task, hotovo: "večer", nauceno: TODAY })).toBe(false);
    expect(canMarkNauceno(task)).toBe(false);
    expect(applyAction("ukol", { ...task, hotovo: "měsíc" }, TODAY)).toBeNull();
    expect(applyAction("ukol", { typ: "Téma", hotovo: null, nauceno: null, posledni: null }, TODAY)).toBeNull();
    expect(applyAction("hotovo", { ...task, hotovo: "večer", nauceno: TODAY }, TODAY)).toBeNull();
    expect(applyAction("nauceno", task, TODAY)).toBeNull();
  });

  it("undo snapshot holds just Hotovo and Stav", () => {
    const snap = buildUndoSnapshot({ id: "u1", hotovo: null, posledni: null, nauceno: null, stav: "Priming" }, afterTaskDoneClick().patch, "", 0);
    expect(snap.previous).toEqual({ hotovo: null, stav: "Priming" });
    expect(snap.written).toEqual({ hotovo: "měsíc", stav: "Stable" });
  });
});
