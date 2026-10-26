import type { DueState, Hotovo, Topic } from "../types";

/** Interval to the next retrieval, keyed by the last finished step. */
const NEXT_INTERVAL: Record<Exclude<Hotovo, "Neučeno" | "měsíc">, { days?: number; months?: number }> = {
  večer: { days: 2 },
  "2 dny": { days: 5 },
  "5 dní": { days: 12 },
  "12 dní": { months: 1 },
};

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Normalise a Notion date `start` to a calendar date. Date-only values pass
 * through; datetimes keep the date in the offset Notion returned them in.
 */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : null;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Calendar month add, clamped to the last day of the target month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return format(ty, tm, Math.min(d, lastDay));
}

type TerminInput = Pick<Topic, "hotovo" | "nauceno" | "posledni">;

/** Next due date per the DEKAN rules, or null when not in the retrieval queue. */
export function computeTermin({ hotovo, nauceno, posledni }: TerminInput): string | null {
  // An empty Hotovo is treated as Neučeno.
  if (hotovo === null || hotovo === "Neučeno") return nauceno;
  if (hotovo === "měsíc") return null;

  const baseline = posledni ?? nauceno;
  if (!baseline) return null;

  const step = NEXT_INTERVAL[hotovo];
  if (!step) return null;
  return step.months ? addMonths(baseline, step.months) : addDays(baseline, step.days ?? 0);
}

export function computeDueState(topic: TerminInput, termin: string | null, today: string): DueState {
  if (topic.hotovo === "měsíc") return "done";
  if (!termin) return "none";
  if (termin < today) return "overdue";
  if (termin === today) return "today";
  return "upcoming";
}

export function withTermin<T extends TerminInput>(topic: T, today: string): T & Pick<Topic, "termin" | "dueState"> {
  const termin = computeTermin(topic);
  return { ...topic, termin, dueState: computeDueState(topic, termin, today) };
}

export function isNeuceno(topic: Pick<Topic, "hotovo">): boolean {
  return topic.hotovo === null || topic.hotovo === "Neučeno";
}

/** Dnes list: Termín <= today. Overdue first (oldest Termín), then due today. */
export function dnesList<T extends Pick<Topic, "termin" | "dueState" | "subject" | "poradi" | "title">>(topics: T[]): T[] {
  return topics
    .filter((t) => t.dueState === "overdue" || t.dueState === "today")
    .sort(
      (a, b) =>
        (a.termin ?? "").localeCompare(b.termin ?? "") ||
        a.subject.localeCompare(b.subject) ||
        (a.poradi ?? Infinity) - (b.poradi ?? Infinity) ||
        a.title.localeCompare(b.title, "cs"),
    );
}

/** Calendar-day difference b - a. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
