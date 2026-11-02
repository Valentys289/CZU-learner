import { describe, expect, it } from "vitest";
import type { SubjectCode, Topic } from "../types";
import { withTermin } from "./termin";
import { dueCounts, encodingDueSoon } from "./phase";
import { filterHidden, HIDDEN_KEY, loadHidden, parseHidden, saveHidden, serializeHidden, subjectsIn } from "./hidden";
import { pluralPredmetu, skrytoPredmetu } from "./format";

const TODAY = "2026-11-02";
let n = 0;
const topic = (subject: SubjectCode, extra: Partial<Topic> = {}): Topic =>
  withTermin(
    {
      id: `t${++n}`,
      url: "",
      subject,
      title: `Téma ${n}`,
      typ: "Téma",
      hotovo: null,
      nauceno: null,
      posledni: null,
      deadline: "2026-11-05",
      stav: "Priming",
      poradi: null,
      odkaz: null,
      ...extra,
    },
    TODAY,
  );

const memoryStorage = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("filterHidden", () => {
  const list = [topic("M"), topic("CH"), topic("TD"), topic("M")];

  it("nothing hidden returns the list unchanged", () => {
    expect(filterHidden(list, [])).toEqual(list);
  });

  it("drops topics of hidden subjects, keeps order", () => {
    expect(filterHidden(list, ["M"]).map((t) => t.subject)).toEqual(["CH", "TD"]);
    expect(filterHidden(list, ["M", "TD"]).map((t) => t.subject)).toEqual(["CH"]);
  });

  it("hiding a subject that is not in the list changes nothing", () => {
    expect(filterHidden(list, ["AJ"])).toEqual(list);
  });
});

describe("subjectsIn", () => {
  it("lists only subjects present, in the SUBJECTS order", () => {
    expect(subjectsIn([topic("TD"), topic("M"), topic("TD")])).toEqual(["M", "TD"]);
    expect(subjectsIn([])).toEqual([]);
  });
});

describe("hidden persistence", () => {
  it("round-trips through storage under ucimNove.hidden", () => {
    const s = memoryStorage();
    saveHidden(s, ["M", "TD"]);
    expect(s.data.get(HIDDEN_KEY)).toBe('["M","TD"]');
    expect(loadHidden(s)).toEqual(["M", "TD"]);
  });

  it.each([
    ["missing", undefined],
    ["invalid JSON", "{nope"],
    ["not an array", '{"M":true}'],
    ["empty string", ""],
  ])("%s means nothing hidden", (_name, raw) => {
    const s = memoryStorage(raw === undefined ? {} : { [HIDDEN_KEY]: raw });
    expect(loadHidden(s)).toEqual([]);
  });

  it("ignores unknown codes and duplicates", () => {
    expect(parseHidden('["M","XX",3,"M","CH"]')).toEqual(["M", "CH"]);
    expect(serializeHidden(["M", "M"])).toBe('["M"]');
  });

  it("no storage or throwing storage does not crash", () => {
    expect(loadHidden(undefined)).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadHidden(broken)).toEqual([]);
    expect(() => saveHidden(broken, ["M"])).not.toThrow();
  });
});

describe("pluralPredmetu / skrytoPredmetu", () => {
  it.each([
    [1, "1 předmět", "skryt 1 předmět"],
    [2, "2 předměty", "skryty 2 předměty"],
    [4, "4 předměty", "skryty 4 předměty"],
    [5, "5 předmětů", "skryto 5 předmětů"],
    [6, "6 předmětů", "skryto 6 předmětů"],
  ])("%i", (count, plural, skryto) => {
    expect(pluralPredmetu(count)).toBe(plural);
    expect(skrytoPredmetu(count)).toBe(skryto);
  });
});

describe("hiding does not change global counts", () => {
  it("dueCounts is the same with and without hidden subjects", () => {
    const topics = [
      topic("M", { deadline: "2026-10-30" }), // encoding overdue
      topic("CH", { deadline: TODAY }), // encoding today
      topic("TD", { deadline: "2026-11-10" }), // upcoming
      topic("M", { stav: "Retrieval", hotovo: "večer", nauceno: "2026-10-20", posledni: "2026-10-20" }),
    ];
    const before = dueCounts(topics, TODAY);
    const hidden: SubjectCode[] = ["M", "CH"];
    const visible = filterHidden(encodingDueSoon(topics, TODAY), hidden);
    expect(visible.map((t) => t.subject)).toEqual(["TD"]);
    // The Dnes tab always passes the full topic list to dueCounts.
    expect(dueCounts(topics, TODAY)).toEqual(before);
    expect(before.encodingOverdue).toBe(1);
    expect(before.encodingToday).toBe(1);
  });
});
