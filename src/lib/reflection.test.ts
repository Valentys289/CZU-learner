import { describe, expect, it } from "vitest";
import { reflectionNote, scoreTip } from "./reflection";

describe("reflectionNote", () => {
  it("empty reflection writes nothing", () => {
    expect(reflectionNote([], "")).toBe("");
    expect(reflectionNote([], "   ")).toBe("");
  });
  it("mistakes in list order, then Příště", () => {
    expect(reflectionNote(["method", "recall"], " nakreslit mapu ")).toBe("Chyba: nešlo si vybavit, metoda nesedí · Příště: nakreslit mapu");
    expect(reflectionNote(["careless"], "")).toBe("Chyba: z nepozornosti");
    expect(reflectionNote([], "Feynman")).toBe("Příště: Feynman");
  });
  it("drops unknown keys and cuts a long Příště", () => {
    expect(reflectionNote(["nope"], "")).toBe("");
    expect(reflectionNote([], "x".repeat(300))).toBe(`Příště: ${"x".repeat(200)}`);
  });
});

describe("scoreTip", () => {
  it("only for skóre 1 to 3", () => {
    expect(scoreTip(null)).toBeNull();
    expect(scoreTip(1)).toMatch(/Zatím/);
    expect(scoreTip(3)).toMatch(/ještě jednou/);
    expect(scoreTip(4)).toBeNull();
  });
});
