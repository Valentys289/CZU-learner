import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  computeDueState,
  computeTermin,
  dnesList,
  toDateOnly,
  todayIn,
  withTermin,
} from "./termin";
import type { Hotovo, SubjectCode } from "../types";

const t = (hotovo: Hotovo | null, nauceno: string | null, posledni: string | null) => ({ hotovo, nauceno, posledni });

describe("computeTermin (Hotovo table)", () => {
  it("Neučeno with Naučeno: Termín = Naučeno (evening retrieval)", () => {
    expect(computeTermin(t("Neučeno", "2026-10-26", null))).toBe("2026-10-26");
  });

  it("Neučeno without Naučeno: no Termín", () => {
    expect(computeTermin(t("Neučeno", null, null))).toBeNull();
  });

  it("empty Hotovo behaves like Neučeno", () => {
    expect(computeTermin(t(null, "2026-10-20", null))).toBe("2026-10-20");
    expect(computeTermin(t(null, null, null))).toBeNull();
  });

  it("večer: Poslední + 2 days", () => {
    expect(computeTermin(t("večer", "2026-10-01", "2026-10-20"))).toBe("2026-10-22");
  });

  it("2 dny: Poslední + 5 days", () => {
    expect(computeTermin(t("2 dny", "2026-10-01", "2026-10-20"))).toBe("2026-10-25");
  });

  it("5 dní: Poslední + 12 days", () => {
    expect(computeTermin(t("5 dní", "2026-10-01", "2026-10-20"))).toBe("2026-11-01");
  });

  it("12 dní: Poslední + 1 calendar month", () => {
    expect(computeTermin(t("12 dní", "2026-09-01", "2026-10-20"))).toBe("2026-11-20");
  });

  it("měsíc: done, no Termín", () => {
    expect(computeTermin(t("měsíc", "2026-09-01", "2026-10-20"))).toBeNull();
  });

  it("falls back to Naučeno when Poslední opakování is empty", () => {
    expect(computeTermin(t("večer", "2026-10-20", null))).toBe("2026-10-22");
    expect(computeTermin(t("12 dní", "2026-01-31", null))).toBe("2026-02-28");
  });

  it("no baseline at all: no Termín", () => {
    expect(computeTermin(t("2 dny", null, null))).toBeNull();
  });
});

describe("date helpers", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
    expect(addDays("2028-02-27", 2)).toBe("2028-02-29");
  });

  it("addDays is unaffected by DST (Prague switches on 2026-10-25)", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
  });

  it("addMonths clamps to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("toDateOnly keeps the calendar date of datetimes", () => {
    expect(toDateOnly("2026-10-26")).toBe("2026-10-26");
    expect(toDateOnly("2026-10-26T23:30:00.000+01:00")).toBe("2026-10-26");
    expect(toDateOnly(null)).toBeNull();
  });

  it("todayIn uses the Prague calendar date, not UTC", () => {
    // 23:30 UTC on 26 Oct is already 27 Oct 00:30 in Prague (CET, UTC+1).
    expect(todayIn("Europe/Prague", new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    expect(todayIn("UTC", new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-26");
  });
});

describe("computeDueState", () => {
  const today = "2026-10-26";
  it("classifies relative to today", () => {
    expect(computeDueState(t("večer", null, null), "2026-10-25", today)).toBe("overdue");
    expect(computeDueState(t("večer", null, null), "2026-10-26", today)).toBe("today");
    expect(computeDueState(t("večer", null, null), "2026-10-27", today)).toBe("upcoming");
    expect(computeDueState(t("Neučeno", null, null), null, today)).toBe("none");
    expect(computeDueState(t("měsíc", null, "2026-01-01"), null, today)).toBe("done");
  });
});

describe("dnesList", () => {
  const today = "2026-10-26";
  const mk = (subject: SubjectCode, title: string, hotovo: Hotovo, nauceno: string | null, posledni: string | null) =>
    withTermin({ subject, title, poradi: null, hotovo, nauceno, posledni }, today);

  it("keeps only Termín <= today, overdue first by oldest Termín", () => {
    const list = dnesList([
      mk("M", "today", "večer", null, "2026-10-24"), // 26.10.
      mk("CH", "old", "2 dny", null, "2026-10-10"), // 15.10.
      mk("CH", "future", "5 dní", null, "2026-10-20"), // 1.11.
      mk("M", "newer overdue", "večer", null, "2026-10-22"), // 24.10.
      mk("ICT", "evening", "Neučeno", "2026-10-26", null), // 26.10.
      mk("AJ", "not learned", "Neučeno", null, null),
      mk("TD", "done", "měsíc", null, "2026-01-01"),
    ]);
    expect(list.map((x) => x.title)).toEqual(["old", "newer overdue", "evening", "today"]);
    expect(list.map((x) => x.dueState)).toEqual(["overdue", "overdue", "today", "today"]);
  });
});
