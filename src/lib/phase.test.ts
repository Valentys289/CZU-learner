import { describe, expect, it } from "vitest";
import type { Hotovo, Topic } from "../types";
import { dnesList, withTermin } from "./termin";
import {
  compareEncoding,
  dueCounts,
  encodingDueSoon,
  encodingDueState,
  encodingOverdueDays,
  ENCODING_HORIZON_DAYS,
  isEncodingTopic,
  isRetrievalTopic,
} from "./phase";
import { pluralDny, pluralNovychTemat } from "./format";

const TODAY = "2026-10-26";

describe("isEncodingTopic / isRetrievalTopic", () => {
  it.each<[string, string | null, Hotovo | null, string | null, "encoding" | "retrieval"]>([
    ["Neučeno, no Naučeno", null, "Neučeno", null, "encoding"],
    ["empty Hotovo, no Naučeno", null, null, null, "encoding"],
    ["Priming, empty Hotovo (most live topics)", "Priming", null, null, "encoding"],
    ["Encoding, Neučeno", "Encoding", "Neučeno", null, "encoding"],
    ["Stav Retrieval but still true Neučeno: encoding wins", "Retrieval", null, null, "encoding"],
    ["Neučeno with Naučeno (evening retrieval due)", null, "Neučeno", "2026-10-26", "retrieval"],
    ["večer", "Retrieval", "večer", "2026-10-20", "retrieval"],
    ["Stable, měsíc", "Stable", "měsíc", "2026-09-01", "retrieval"],
    ["ambiguous: Encoding + Naučeno set", "Encoding", "Neučeno", "2026-10-25", "retrieval"],
    ["ambiguous: Priming + Hotovo 5 dní, no Naučeno (live data)", "Priming", "5 dní", null, "retrieval"],
  ])("%s", (_name, stav, hotovo, nauceno, bucket) => {
    const t = { stav, hotovo, nauceno };
    expect(isEncodingTopic(t)).toBe(bucket === "encoding");
    expect(isRetrievalTopic(t)).toBe(bucket === "retrieval");
  });
});

describe("encodingDueSoon", () => {
  let n = 0;
  const topic = (title: string, deadline: string | null, extra: Partial<Topic> = {}): Topic =>
    withTermin(
      {
        id: `t${++n}`,
        url: "",
        subject: "M",
        title,
        hotovo: null,
        nauceno: null,
        posledni: null,
        deadline,
        stav: "Priming",
        poradi: null,
        odkaz: null,
        ...extra,
      },
      TODAY,
    );

  it("encoding topics with a Deadline within the horizon (or past), soonest first", () => {
    const list = [
      topic("Inverzní funkce", "2026-11-07"),
      topic("Logaritmy", "2026-10-30"),
      topic("Taylorův rozvoj", "2026-12-14"),
      topic("Bez deadline", null),
      topic("Po deadline", "2026-10-20"),
      topic("Goniometrie", "2026-10-26", { hotovo: "večer", nauceno: "2026-10-26", stav: "Retrieval" }),
    ];
    expect(encodingDueSoon(list, TODAY).map((t) => t.title)).toEqual(["Po deadline", "Logaritmy", "Inverzní funkce"]);
  });

  it("horizon edge is inclusive", () => {
    expect(ENCODING_HORIZON_DAYS).toBe(14);
    expect(encodingDueSoon([topic("Edge", "2026-11-09"), topic("Over", "2026-11-10")], TODAY).map((t) => t.title)).toEqual(["Edge"]);
  });

  it("encoding-only topics never land in the due retrieval list", () => {
    // True Neučeno topics have no Termín, so dnesList never shows them, even with an overdue Deadline.
    const enc = [topic("Po deadline", "2026-10-01"), topic("Dnes deadline", TODAY)];
    expect(dnesList(enc)).toEqual([]);
    expect(enc.every(isEncodingTopic)).toBe(true);
  });
});

describe("Po termínu for encoding (Fáze 8)", () => {
  const NOW = "2026-11-02";
  let n = 0;
  const topic = (title: string, deadline: string | null, extra: Partial<Topic> = {}): Topic =>
    withTermin(
      {
        id: `e${++n}`,
        url: "",
        subject: "M",
        title,
        hotovo: null,
        nauceno: null,
        posledni: null,
        deadline,
        stav: "Priming",
        poradi: null,
        odkaz: null,
        ...extra,
      },
      NOW,
    );
  // Retrieval: Hotovo večer, Naučeno 2026-10-28 -> Termín 2026-10-30 (overdue on NOW).
  const retrievalOverdue = (title: string) =>
    topic(title, null, { hotovo: "večer", nauceno: "2026-10-28", stav: "Retrieval" });
  // Neučeno with Naučeno today -> Termín today.
  const retrievalToday = (title: string) => topic(title, null, { hotovo: "Neučeno", nauceno: NOW, stav: "Encoding" });

  it("deadline yesterday: overdue, 1 den, counted once", () => {
    const t = topic("Včera", "2026-11-01");
    expect(encodingDueState(t, NOW)).toBe("overdue");
    expect(encodingOverdueDays(t, NOW)).toBe(1);
    expect(pluralDny(encodingOverdueDays(t, NOW))).toBe("1 den");
    expect(dueCounts([t], NOW)).toEqual({ overdue: 1, today: 0, encodingOverdue: 1, encodingToday: 0 });
  });

  it("acceptance: Logaritmy, Deadline 30. 10., today 2. 11.: Po termínu (3 dny)", () => {
    const t = topic("Logaritmy a exponenciály", "2026-10-30");
    expect(t.dueState).toBe("none");
    expect(encodingDueState(t, NOW)).toBe("overdue");
    expect(encodingOverdueDays(t, NOW)).toBe(3);
    expect(pluralDny(3)).toBe("3 dny");
    expect(dueCounts([t], NOW).overdue).toBe(1);
  });

  it("5 dní plural", () => {
    const t = topic("Pět", "2026-10-28");
    expect(pluralDny(encodingOverdueDays(t, NOW))).toBe("5 dní");
  });

  it("deadline today: today, not overdue", () => {
    const t = topic("Dnes", NOW);
    expect(encodingDueState(t, NOW)).toBe("today");
    expect(encodingOverdueDays(t, NOW)).toBe(0);
    expect(dueCounts([t], NOW)).toEqual({ overdue: 0, today: 1, encodingOverdue: 0, encodingToday: 1 });
  });

  it("future deadline or no deadline: not counted", () => {
    const list = [topic("Zítra", "2026-11-03"), topic("Bez", null)];
    expect(list.map((t) => encodingDueState(t, NOW))).toEqual(["upcoming", "none"]);
    expect(dueCounts(list, NOW)).toEqual({ overdue: 0, today: 0, encodingOverdue: 0, encodingToday: 0 });
  });

  it("retrieval topics ignore Deadline: counts equal dnesList", () => {
    const list = [
      retrievalOverdue("R po termínu"),
      retrievalToday("R dnes"),
      // Retrieval topic with an old Deadline but a future Termín: not due, Deadline ignored.
      topic("R budoucí", "2026-10-01", { hotovo: "5 dní", nauceno: "2026-10-01", posledni: "2026-10-30", stav: "Retrieval" }),
    ];
    expect(encodingDueState(list[2], NOW)).toBe("none");
    const due = dnesList(list);
    expect(dueCounts(list, NOW)).toEqual({
      overdue: due.filter((t) => t.dueState === "overdue").length,
      today: due.filter((t) => t.dueState === "today").length,
      encodingOverdue: 0,
      encodingToday: 0,
    });
    expect(dueCounts(list, NOW)).toMatchObject({ overdue: 1, today: 1 });
  });

  it("mix: no double counting, Učím nové orders overdue first (oldest on top)", () => {
    const list = [
      topic("Za týden", "2026-11-09"),
      retrievalOverdue("R po termínu"),
      topic("Dnes", NOW),
      topic("Logaritmy", "2026-10-30"),
      retrievalToday("R dnes"),
      topic("Nejstarší", "2026-10-20"),
      topic("Bez deadline", null),
    ];
    expect(dueCounts(list, NOW)).toEqual({ overdue: 3, today: 2, encodingOverdue: 2, encodingToday: 1 });
    // dnesList unchanged: retrieval only.
    expect(dnesList(list).map((t) => t.title)).toEqual(["R po termínu", "R dnes"]);
    expect(encodingDueSoon(list, NOW).map((t) => t.title)).toEqual(["Nejstarší", "Logaritmy", "Dnes", "Za týden"]);
    const predmety = list.filter(isEncodingTopic).sort((a, b) => compareEncoding(a, b, NOW));
    expect(predmety.map((t) => t.title)).toEqual(["Nejstarší", "Logaritmy", "Dnes", "Za týden", "Bez deadline"]);
  });

  it("Naučeno dnes moves the topic out of encoding Po termínu", () => {
    const learned = topic("Logaritmy", "2026-10-30", { hotovo: "Neučeno", nauceno: NOW, stav: "Encoding" });
    expect(encodingDueState(learned, NOW)).toBe("none");
    // It now counts once, as retrieval due today (evening review).
    expect(dueCounts([learned], NOW)).toEqual({ overdue: 0, today: 1, encodingOverdue: 0, encodingToday: 0 });
  });

  it("pluralNovychTemat", () => {
    expect([1, 2, 4, 5].map(pluralNovychTemat)).toEqual(["1 nové téma", "2 nová témata", "4 nová témata", "5 nových témat"]);
  });
});
