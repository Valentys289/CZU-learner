import type { Hotovo, Topic } from "../types";
import { computeTermin, isNeuceno } from "./termin";

/** Stav value for topics in the spaced retrieval queue. */
export const STAV_RETRIEVAL = "Retrieval";

const STEPS: readonly Hotovo[] = ["Neučeno", "večer", "2 dny", "5 dní", "12 dní", "měsíc"];

/** The step after the current one. Empty counts as Neučeno; měsíc is final (null). */
export function nextHotovo(current: Hotovo | null): Hotovo | null {
  const i = STEPS.indexOf(current ?? "Neučeno");
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

type ScheduleFields = Pick<Topic, "hotovo" | "nauceno" | "posledni">;

/** Properties a write action sets in Notion. Omitted fields are left as they are. */
export type TopicPatch = {
  hotovo: Hotovo;
  posledni: string;
  nauceno?: string;
  stav?: string;
};

export type ActionResult = { patch: TopicPatch; termin: string | null };

function result(current: ScheduleFields, patch: TopicPatch): ActionResult {
  const termin = computeTermin({
    hotovo: patch.hotovo,
    nauceno: patch.nauceno ?? current.nauceno,
    posledni: patch.posledni,
  });
  return { patch, termin };
}

/**
 * "Hotovo": the step that was due is finished. Advances Hotovo one step and sets
 * Poslední opakování to today. Leaving Neučeno also sets Stav = Retrieval (and
 * Naučeno, if it was somehow still empty). Returns null on měsíc (nothing left).
 */
export function afterHotovoClick(input: ScheduleFields & { today: string }): ActionResult | null {
  const next = nextHotovo(input.hotovo);
  if (!next) return null;
  const patch: TopicPatch = { hotovo: next, posledni: input.today };
  if (isNeuceno(input)) {
    patch.stav = STAV_RETRIEVAL;
    if (!input.nauceno) patch.nauceno = input.today;
  }
  return result(input, patch);
}

/**
 * "Naučeno dnes": first learn plus that evening's first retrieval in one tap
 * (DEKAN, Fáze 2). Next Termín is today + 2 days.
 */
export function afterNaucenoClick({ today }: { today: string }): ActionResult {
  return result(
    { hotovo: null, nauceno: null, posledni: null },
    { hotovo: "večer", posledni: today, nauceno: today, stav: STAV_RETRIEVAL },
  );
}

/** Hotovo button: anything in the retrieval queue that is not finished. */
export function canMarkHotovo(t: ScheduleFields): boolean {
  return t.hotovo !== "měsíc" && !(isNeuceno(t) && !t.nauceno);
}

/** Naučeno dnes button: the true Neučeno queue (no Naučeno date yet). */
export function canMarkNauceno(t: ScheduleFields): boolean {
  return isNeuceno(t) && !t.nauceno;
}

export type TopicAction = "hotovo" | "nauceno";

export function applyAction(action: TopicAction, t: ScheduleFields, today: string): ActionResult | null {
  if (action === "hotovo") return canMarkHotovo(t) ? afterHotovoClick({ ...t, today }) : null;
  return canMarkNauceno(t) ? afterNaucenoClick({ today }) : null;
}
