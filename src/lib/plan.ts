// Fáze 12: control over the schedule. Termín is not stored anywhere: it follows from
// Hotovo + Poslední opakování (or Naučeno on the first retrieval), both in the app
// (computeTermin) and in the Notion formula. So "next retrieval on day X" is written
// as the Poslední opakování that gives X for the topic's step. The real history of
// what was practised when stays in Tréninky.
import type { Hotovo, Topic, TopicType } from "../types";
import type { ActionResult, TopicPatch } from "./hotovo";
import { addDays, addMonths, computeTermin, daysBetween, isNeuceno } from "./termin";
import { isTask } from "./phase";

type PlanFields = Pick<Topic, "hotovo" | "nauceno" | "posledni"> & { typ?: TopicType };

/** Step used when a finished (měsíc) topic is brought back into the queue. */
export const RETURN_STEP: Hotovo = "12 dní";

const DAYS: Partial<Record<Hotovo, number>> = { večer: 2, "2 dny": 5, "5 dní": 12 };

/**
 * The Poslední opakování that makes `termin` the next due date for `step`.
 * For the month step (12 dní) a target at a month end that no date reaches
 * (31 March: 28 Feb + 1 month = 28 March) gets the closest earlier one.
 */
export function posledniFor(step: Exclude<Hotovo, "Neučeno" | "měsíc">, termin: string): string {
  const days = DAYS[step];
  if (days !== undefined) return addDays(termin, -days);
  const base = addMonths(termin, -1);
  let best: string | null = null;
  for (let d = 3; d >= -3; d--) {
    const p = addDays(base, d);
    const t = addMonths(p, 1);
    if (t === termin) return p;
    if (t < termin && best === null) best = p;
  }
  return best ?? base;
}

/** Whether a topic's next retrieval can be planned by hand: a learned Téma (měsíc too). */
export function canPlan(t: PlanFields): boolean {
  return !isTask(t) && !(isNeuceno(t) && !t.nauceno);
}

/**
 * Patch that moves the next retrieval to `termin`, keeping the step.
 * - first retrieval (Hotovo Neučeno with Naučeno): Termín is Naučeno, so Naučeno moves
 * - měsíc: back into the queue at the 12 dní step
 * - otherwise: Poslední opakování = termin minus the step's gap
 * Returns null for topics that cannot be planned.
 */
export function planPatch(topic: PlanFields, termin: string): ActionResult | null {
  if (!canPlan(topic)) return null;
  let patch: TopicPatch;
  if (isNeuceno(topic)) patch = { hotovo: "Neučeno", nauceno: termin };
  else if (topic.hotovo === "měsíc") patch = { hotovo: RETURN_STEP, posledni: posledniFor("12 dní", termin) };
  else patch = { hotovo: topic.hotovo as Hotovo, posledni: posledniFor(topic.hotovo as Exclude<Hotovo, "Neučeno" | "měsíc">, termin) };
  const merged = { ...topic, ...patch };
  return { patch, termin: computeTermin(merged) };
}

/** Quick picks for the date: tomorrow, in 3 days, in a week, in 2 weeks. */
export function quickDates(today: string): { label: string; date: string }[] {
  return [
    { label: "Zítra", date: addDays(today, 1) },
    { label: "Za 3 dny", date: addDays(today, 3) },
    { label: "Za týden", date: addDays(today, 7) },
    { label: "Za 2 týdny", date: addDays(today, 14) },
  ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Furthest a hand-picked date may be (a typo like 2062 is refused). */
export const PLAN_MAX_DAYS = 366;

/** Validate a hand-picked next date: a real date, after today, within a year. */
export function parsePlanDate(value: unknown, today: string): { ok: true; date: string } | { ok: false; error: string } {
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: "Neplatné datum dalšího opakování" };
  }
  if (value <= today) return { ok: false, error: "Další opakování musí být nejdřív zítra" };
  if (daysBetween(today, value) > PLAN_MAX_DAYS) return { ok: false, error: "Další opakování nejdéle za rok" };
  return { ok: true, date: value };
}
