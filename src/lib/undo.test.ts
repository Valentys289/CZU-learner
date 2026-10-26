import { describe, expect, it } from "vitest";
import { afterHotovoClick, afterNaucenoClick, applyUndo, buildUndoSnapshot, isUndoActive, parseWriteProps, UNDO_MS } from "./hotovo";

const TODAY = "2026-10-26";
const NOW = 1_800_000_000_000;

describe("buildUndoSnapshot / applyUndo", () => {
  it("Hotovo from 2 dny: snapshot holds only Hotovo + Poslední, and undo restores them exactly", () => {
    const before = { id: "p1", hotovo: "2 dny" as const, posledni: "2026-10-18", nauceno: "2026-10-15", stav: "Retrieval" };
    const { patch } = afterHotovoClick({ ...before, today: TODAY })!;
    const snap = buildUndoSnapshot(before, patch, "Hotovo uloženo", NOW);

    expect(snap).toEqual({
      pageId: "p1",
      previous: { hotovo: "2 dny", posledni: "2026-10-18" },
      written: { hotovo: "5 dní", posledni: TODAY },
      label: "Hotovo uloženo",
      expiresAt: NOW + UNDO_MS,
    });
    const after = { ...before, ...patch };
    expect(applyUndo(after, snap)).toEqual(before);
  });

  it("Naučeno dnes: restores empty Naučeno, Poslední, Hotovo and Stav (nulls, not omitted)", () => {
    const before = { id: "p2", hotovo: null, posledni: null, nauceno: null, stav: "Neučeno" };
    const { patch } = afterNaucenoClick({ today: TODAY });
    const snap = buildUndoSnapshot(before, patch, "Naučeno dnes", NOW);

    expect(snap.previous).toEqual({ hotovo: null, posledni: null, nauceno: null, stav: "Neučeno" });
    expect(applyUndo({ ...before, ...patch }, snap)).toEqual(before);
  });

  it("leaves fields the write did not touch alone", () => {
    const before = { id: "p3", hotovo: "večer" as const, posledni: "2026-10-20", nauceno: "2026-10-19", stav: "Retrieval" };
    const snap = buildUndoSnapshot(before, afterHotovoClick({ ...before, today: TODAY })!.patch, "x", NOW);
    expect(Object.keys(snap.previous).sort()).toEqual(["hotovo", "posledni"]);
  });
});

describe("isUndoActive", () => {
  it("only within 5 s", () => {
    const snap = { expiresAt: NOW + UNDO_MS };
    expect(isUndoActive(snap, NOW)).toBe(true);
    expect(isUndoActive(snap, NOW + UNDO_MS - 1)).toBe(true);
    expect(isUndoActive(snap, NOW + UNDO_MS)).toBe(false);
    expect(isUndoActive(null, NOW)).toBe(false);
  });
});

describe("parseWriteProps", () => {
  it("accepts the 4 write fields with valid values and nulls", () => {
    expect(parseWriteProps({ hotovo: "2 dny", posledni: null, nauceno: "2026-10-01", stav: "Retrieval" })).toEqual({
      hotovo: "2 dny",
      posledni: null,
      nauceno: "2026-10-01",
      stav: "Retrieval",
    });
  });

  it.each([
    [{ Termín: "2026-10-01" }],
    [{ hotovo: "hotovo" }],
    [{ posledni: "26. 10." }],
    [{ stav: 5 }],
    [{}],
    [null],
    [["hotovo"]],
  ])("rejects %j", (input) => {
    expect(parseWriteProps(input)).toBeNull();
  });
});
