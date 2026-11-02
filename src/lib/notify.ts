// Fáze 9 A: native notifications. Pure helpers shared by the Electron main process
// (scheduler, tray) and the Nastavení tab, so they can be tested without Electron.
import type { Topic, TopicType } from "../types";
import { dnesList } from "./termin";
import { compareEncoding, type DueCounts, encodingDueState, isTask, openTasks, taskDueState } from "./phase";
import { pluralTemat } from "./format";

export type NotifyKind = "morning" | "evening";

export type Reminder = { enabled: boolean; time: string /* "HH:MM" */ };

/** Stored in userData/settings.json. */
export type NotifySettings = {
  openAtLogin: boolean;
  morning: Reminder;
  evening: Reminder;
};

export const DEFAULT_SETTINGS: NotifySettings = {
  openAtLogin: true,
  morning: { enabled: true, time: "07:30" },
  evening: { enabled: true, time: "20:00" },
};

/** Calendar date of the last notification of each kind (YYYY-MM-DD, Prague). */
export type SentLog = Partial<Record<NotifyKind, string>>;

/** A missed morning summary is still sent after wake-up, but only until 12:00. */
export const MORNING_CUTOFF_MIN = 12 * 60;
/** When the morning time itself is set at or after 12:00, it may be caught up for one hour. */
const LATE_MORNING_GRACE_MIN = 60;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}

/** "07:30" → 450. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function parseReminder(raw: unknown, fallback: Reminder): Reminder {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : fallback.enabled,
    time: isValidTime(r.time) ? r.time : fallback.time,
  };
}

/** Settings from settings.json (or from the renderer): unknown or invalid fields fall back to the defaults. */
export function parseSettings(raw: unknown): NotifySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    openAtLogin: typeof r.openAtLogin === "boolean" ? r.openAtLogin : DEFAULT_SETTINGS.openAtLogin,
    morning: parseReminder(r.morning, DEFAULT_SETTINGS.morning),
    evening: parseReminder(r.evening, DEFAULT_SETTINGS.evening),
  };
}

export function parseSentLog(raw: unknown): SentLog {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: SentLog = {};
  for (const k of ["morning", "evening"] as const) {
    if (typeof r[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r[k] as string)) out[k] = r[k] as string;
  }
  return out;
}

/** Wall clock in a timezone: the calendar date and minutes since midnight. */
export type LocalClock = { date: string; minutes: number };

export function localClock(timeZone: string, now: Date = new Date()): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Whether the reminder of `kind` is due now. Called every minute and after wake-up.
 * - never twice on the same day (`lastSent` holds the date it last went out);
 * - not before its time;
 * - morning: a missed one goes out after wake-up only until 12:00, never in the afternoon;
 * - evening: catches up until midnight of the same day; after midnight it is a new day
 *   and the time has not come yet, so nothing is sent for the day before.
 */
export function shouldFire(kind: NotifyKind, now: LocalClock, lastSent: SentLog, settings: NotifySettings): boolean {
  const r = settings[kind];
  if (!r.enabled || !isValidTime(r.time)) return false;
  if (lastSent[kind] === now.date) return false;
  const at = timeToMinutes(r.time);
  if (now.minutes < at) return false;
  if (kind === "morning") {
    const until = at < MORNING_CUTOFF_MIN ? MORNING_CUTOFF_MIN : at + LATE_MORNING_GRACE_MIN;
    if (now.minutes >= until) return false;
  }
  return true;
}

/** "Dnes 3 témata, 1 po termínu" (Dnes and Po termínu counts as on the Dnes tab). */
export function buildMorningText(counts: Pick<DueCounts, "overdue" | "today">): string {
  const { overdue, today } = counts;
  if (today === 0 && overdue === 0) return "Dnes nic k opakování ani k učení";
  if (overdue === 0) return `Dnes ${pluralTemat(today)}`;
  if (today === 0) return `${pluralTemat(overdue)} po termínu`;
  return `Dnes ${pluralTemat(today)}, ${overdue} po termínu`;
}

/** How many titles the evening reminder names before "a N dalších". */
export const EVENING_MAX_TITLES = 3;

/** "Zbývá 2: Logaritmy, Atomy"; "Dnes hotovo" when nothing is left. */
export function buildEveningText(left: string[]): string {
  if (left.length === 0) return "Dnes hotovo";
  const shown = left.slice(0, EVENING_MAX_TITLES).join(", ");
  const rest = left.length - EVENING_MAX_TITLES;
  return `Zbývá ${left.length}: ${shown}${rest > 0 ? ` a ${rest} ${rest === 1 ? "další" : "dalších"}` : ""}`;
}

/**
 * What is still unticked today: due retrieval (Po termínu + Dnes), open úkoly whose
 * Deadline is today or past, and encoding topics whose Deadline is today or past.
 * Same set as dueCounts, so the length matches overdue + today. Order as on Dnes:
 * retrieval, Úkoly, Učím nové.
 */
export function leftToday<
  T extends Pick<Topic, "termin" | "dueState" | "subject" | "poradi" | "title" | "stav" | "hotovo" | "nauceno" | "deadline"> & {
    typ?: TopicType;
  },
>(topics: T[], today: string): T[] {
  const retrieval = dnesList(topics.filter((t) => !isTask(t)));
  const tasks = openTasks(topics, today).filter((t) => {
    const s = taskDueState(t, today);
    return s === "overdue" || s === "today";
  });
  const encoding = topics
    .filter((t) => t.dueState !== "overdue" && t.dueState !== "today")
    .filter((t) => {
      const s = encodingDueState(t, today);
      return s === "overdue" || s === "today";
    })
    .sort((a, b) => compareEncoding(a, b, today));
  return [...retrieval, ...tasks, ...encoding];
}

/** Tray menu line: "Dnes: 3 témata". */
export function trayLabel(due: number | null): string {
  return due === null ? "Dnes: načítám…" : `Dnes: ${pluralTemat(due)}`;
}
