import { describe, expect, it } from "vitest";
import { hashSeed, LINK_PROMPTS, pickPrompt, PROMPTS } from "./prompts";

describe("pickPrompt", () => {
  it("without other topics only general questions", () => {
    for (let seed = 0; seed < 50; seed++) expect(PROMPTS).toContain(pickPrompt([], seed));
  });
  it("link questions name another topic", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) seen.add(pickPrompt(["Derivace", "Integrál"], seed));
    expect([...seen].some((q) => q.includes("„Derivace“"))).toBe(true);
    expect([...seen].some((q) => q.includes("„Integrál“"))).toBe(true);
    expect([...seen].every((q) => !q.includes("{other}"))).toBe(true);
    expect(LINK_PROMPTS.length).toBeGreaterThan(0);
  });
  it("same seed, same question; long titles are cut", () => {
    expect(pickPrompt(["A"], 7)).toBe(pickPrompt(["A"], 7));
    const long = "y".repeat(90);
    for (let seed = 0; seed < 20; seed++) expect(pickPrompt([long], seed).includes(long)).toBe(false);
  });
  it("hashSeed is stable and non-negative", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
    expect(hashSeed("x")).toBeGreaterThanOrEqual(0);
  });
});
