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

/** The four properties the write buttons touch. null = empty in Notion. */
export type TopicWriteProps = {
  hotovo: Hotovo | null;
  posledni: string | null;
  nauceno: string | null;
  stav: string | null;
};

export const UNDO_MS = 5000;

/** Single-slot undo for the last successful write. */
export type UndoSnapshot = {
  pageId: string;
  /** Values before the write, only for the fields the write changed. */
  previous: Partial<TopicWriteProps>;
  /** Values the write set, to detect that Notion changed in between. */
  written: Partial<TopicWriteProps>;
  /** Fáze 6: the Tréninky row the write created, archived again on undo. */
  sessionId?: string;
  label: string;
  expiresAt: number;
};

const WRITE_KEYS = ["hotovo", "posledni", "nauceno", "stav"] as const;

/** Snapshot of the fields `patch` changes, taken from the topic before the write. */
export function buildUndoSnapshot(
  before: TopicWriteProps & { id: string },
  patch: TopicPatch,
  label: string,
  now: number,
): UndoSnapshot {
  const previous: Partial<TopicWriteProps> = {};
  const written: Partial<TopicWriteProps> = {};
  for (const key of WRITE_KEYS) {
    if (patch[key] === undefined) continue;
    (previous as Record<string, unknown>)[key] = before[key];
    (written as Record<string, unknown>)[key] = patch[key];
  }
  return { pageId: before.id, previous, written, label, expiresAt: now + UNDO_MS };
}

/** The topic with the snapshot's previous values put back (Termín is recomputed by the caller). */
export function applyUndo<T extends TopicWriteProps>(topic: T, snapshot: Pick<UndoSnapshot, "previous">): T {
  return { ...topic, ...snapshot.previous };
}

export function isUndoActive(snapshot: Pick<UndoSnapshot, "expiresAt"> | null, now: number): boolean {
  return snapshot !== null && now < snapshot.expiresAt;
}

const HOTOVO_SET: readonly string[] = ["Neučeno", "večer", "2 dny", "5 dní", "12 dní", "měsíc"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate an undo body from the browser: only the 4 write fields, sane values. */
export function parseWriteProps(input: unknown): Partial<TopicWriteProps> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Partial<TopicWriteProps> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(WRITE_KEYS as readonly string[]).includes(key)) return null;
    if (value === null) {
      (out as Record<string, unknown>)[key] = null;
    } else if (key === "hotovo") {
      if (typeof value !== "string" || !HOTOVO_SET.includes(value)) return null;
      out.hotovo = value as Hotovo;
    } else if (key === "stav") {
      if (typeof value !== "string" || value.length > 100) return null;
      out.stav = value;
    } else {
      if (typeof value !== "string" || !DATE_RE.test(value)) return null;
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
