import { describe, expect, it } from "vitest";
import type { Topic } from "../types";
import { withTermin } from "./termin";
import { dueCounts } from "./phase";
import {
  buildEveningText,
  buildMorningText,
  DEFAULT_SETTINGS,
  leftToday,
  localClock,
  parseSentLog,
  parseSettings,
  shouldFire,
  timeToMinutes,
  trayLabel,
  type NotifySettings,
} from "./notify";

const TODAY = "2026-11-02";
const at = (time: string, date = TODAY) => ({ date, minutes: timeToMinutes(time) });

describe("buildMorningText", () => {
  it.each([
    [3, 1, "Dnes 3 témata, 1 po termínu"],
    [1, 0, "Dnes 1 téma"],
    [5, 0, "Dnes 5 témat"],
    [2, 7, "Dnes 2 témata, 7 po termínu"],
    [0, 1, "1 téma po termínu"],
    [0, 4, "4 témata po termínu"],
    [0, 0, "Dnes nic k opakování ani k učení"],
  ])("today %i, overdue %i", (today, overdue, text) => {
    expect(buildMorningText({ today, overdue })).toBe(text);
  });

  it("never uses an em dash", () => {
    expect(buildMorningText({ today: 2, overdue: 3 })).not.toContain("—");
  });
});

describe("buildEveningText", () => {
  it("nothing left", () => expect(buildEveningText([])).toBe("Dnes hotovo"));
  it("names what is left", () => expect(buildEveningText(["Logaritmy", "Atomy"])).toBe("Zbývá 2: Logaritmy, Atomy"));
  it("caps the list", () => {
    expect(buildEveningText(["A", "B", "C", "D"])).toBe("Zbývá 4: A, B, C a 1 další");
    expect(buildEveningText(["A", "B", "C", "D", "E", "F"])).toBe("Zbývá 6: A, B, C a 3 dalších");
  });
});

describe("shouldFire", () => {
  const s = DEFAULT_SETTINGS;

  it("morning: not before its time, then once", () => {
    expect(shouldFire("morning", at("07:29"), {}, s)).toBe(false);
    expect(shouldFire("morning", at("07:30"), {}, s)).toBe(true);
    expect(shouldFire("morning", at("07:31"), { morning: TODAY }, s)).toBe(false);
  });

  it("sent yesterday does not block today", () => {
    expect(shouldFire("morning", at("07:30"), { morning: "2026-11-01" }, s)).toBe(true);
  });

  it("wake-up after sleep: missed morning goes out until 12:00 only", () => {
    expect(shouldFire("morning", at("09:45"), { morning: "2026-11-01" }, s)).toBe(true);
    expect(shouldFire("morning", at("11:59"), {}, s)).toBe(true);
    expect(shouldFire("morning", at("12:00"), {}, s)).toBe(false);
    expect(shouldFire("morning", at("18:00"), {}, s)).toBe(false);
  });

  it("morning set at/after noon gets one hour of catch-up", () => {
    const late: NotifySettings = { ...s, morning: { enabled: true, time: "12:30" } };
    expect(shouldFire("morning", at("12:30"), {}, late)).toBe(true);
    expect(shouldFire("morning", at("13:29"), {}, late)).toBe(true);
    expect(shouldFire("morning", at("13:30"), {}, late)).toBe(false);
  });

  it("evening: from its time until midnight, once", () => {
    expect(shouldFire("evening", at("19:59"), {}, s)).toBe(false);
    expect(shouldFire("evening", at("20:00"), {}, s)).toBe(true);
    expect(shouldFire("evening", at("23:59"), {}, s)).toBe(true);
    expect(shouldFire("evening", at("21:00"), { evening: TODAY }, s)).toBe(false);
  });

  it("across midnight: nothing for the day before", () => {
    // Mac slept through 20:00 and woke at 00:10: new day, evening time not reached.
    expect(shouldFire("evening", at("00:10", "2026-11-03"), { evening: "2026-11-01" }, s)).toBe(false);
    expect(shouldFire("morning", at("00:10", "2026-11-03"), { morning: TODAY }, s)).toBe(false);
    const nearMidnight: NotifySettings = { ...s, evening: { enabled: true, time: "23:55" } };
    expect(shouldFire("evening", at("23:55"), {}, nearMidnight)).toBe(true);
    expect(shouldFire("evening", at("00:01", "2026-11-03"), { evening: "2026-11-01" }, nearMidnight)).toBe(false);
  });

  it("disabled never fires", () => {
    const off: NotifySettings = { ...s, morning: { enabled: false, time: "07:30" }, evening: { enabled: false, time: "20:00" } };
    expect(shouldFire("morning", at("08:00"), {}, off)).toBe(false);
    expect(shouldFire("evening", at("21:00"), {}, off)).toBe(false);
  });

  it("invalid time never fires", () => {
    const bad = { ...s, morning: { enabled: true, time: "7:30" } };
    expect(shouldFire("morning", at("08:00"), {}, bad)).toBe(false);
  });
});

describe("parseSettings / parseSentLog", () => {
  it("defaults", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.morning.time).toBe("07:30");
    expect(DEFAULT_SETTINGS.evening.time).toBe("20:00");
  });

  it("keeps valid fields, replaces invalid ones", () => {
    expect(
      parseSettings({ openAtLogin: false, morning: { enabled: false, time: "06:15" }, evening: { enabled: "yes", time: "25:00" } }),
    ).toEqual({ openAtLogin: false, morning: { enabled: false, time: "06:15" }, evening: { enabled: true, time: "20:00" } });
  });

  it("sent log keeps only dates", () => {
    expect(parseSentLog({ morning: "2026-11-02", evening: 5 })).toEqual({ morning: "2026-11-02" });
    expect(parseSentLog(null)).toEqual({});
  });
});

describe("localClock", () => {
  it("Prague wall clock, winter and summer time", () => {
    expect(localClock("Europe/Prague", new Date("2026-11-02T06:30:00Z"))).toEqual({ date: "2026-11-02", minutes: 7 * 60 + 30 });
    expect(localClock("Europe/Prague", new Date("2026-07-01T05:30:00Z"))).toEqual({ date: "2026-07-01", minutes: 7 * 60 + 30 });
  });

  it("date flips at Prague midnight, not UTC", () => {
    expect(localClock("Europe/Prague", new Date("2026-11-02T23:10:00Z"))).toEqual({ date: "2026-11-03", minutes: 10 });
  });
});

describe("leftToday", () => {
  let n = 0;
  const topic = (title: string, extra: Partial<Topic> = {}): Topic =>
    withTermin(
      {
        id: `t${++n}`,
        url: "",
        subject: "M",
        title,
        hotovo: null,
        nauceno: null,
        posledni: null,
        deadline: null,
        stav: "Priming",
        poradi: null,
        odkaz: null,
        ...extra,
      } as Topic,
      TODAY,
    );

  const topics = [
    topic("Retrieval po termínu", { hotovo: "večer", nauceno: "2026-10-20", posledni: "2026-10-20", stav: "Retrieval" }),
    topic("Retrieval dnes", { hotovo: "večer", nauceno: "2026-10-31", posledni: "2026-10-31", stav: "Retrieval" }),
    topic("Retrieval budoucí", { hotovo: "2 dny", nauceno: "2026-10-30", posledni: "2026-11-01", stav: "Retrieval" }),
    topic("Encoding po deadline", { deadline: "2026-10-30" }),
    topic("Encoding deadline dnes", { deadline: TODAY }),
    topic("Encoding později", { deadline: "2026-11-10" }),
    topic("Encoding bez deadline"),
    topic("Hotové", { hotovo: "měsíc", nauceno: "2026-09-01", posledni: "2026-10-01", stav: "Stable" }),
  ];

  it("lists due retrieval, then encoding at or past Deadline", () => {
    expect(leftToday(topics, TODAY).map((t) => t.title)).toEqual([
      "Retrieval po termínu",
      "Retrieval dnes",
      "Encoding po deadline",
      "Encoding deadline dnes",
    ]);
  });

  it("matches dueCounts, so the evening and the morning agree", () => {
    const c = dueCounts(topics, TODAY);
    expect(leftToday(topics, TODAY)).toHaveLength(c.overdue + c.today);
  });
});

describe("trayLabel", () => {
  it.each([
    [null, "Dnes: načítám…"],
    [0, "Dnes: 0 témat"],
    [1, "Dnes: 1 téma"],
    [3, "Dnes: 3 témata"],
  ])("%s", (due, label) => expect(trayLabel(due)).toBe(label));
});
