import { describe, expect, it } from "vitest";
import type { Hotovo, Topic } from "../types";
import { dnesList, withTermin } from "./termin";
import { encodingDueSoon, ENCODING_HORIZON_DAYS, isEncodingTopic, isRetrievalTopic } from "./phase";

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
