import type { SubjectCode } from "../types";
import { SUBJECTS } from "../notion/config";

/**
 * Fáze 9 C: subjects hidden in Dnes › Učím nové. A pure list filter: global counts
 * (Po termínu, Dnes, tab badge, notifications) never look at it.
 */
export const HIDDEN_KEY = "ucimNove.hidden";

const CODES: ReadonlySet<string> = new Set(SUBJECTS.map((s) => s.code));

/** Stored JSON → subject codes. Invalid JSON, a non-array or unknown codes mean nothing hidden. */
export function parseHidden(raw: string | null | undefined): SubjectCode[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((c): c is SubjectCode => typeof c === "string" && CODES.has(c)))];
  } catch {
    return [];
  }
}

export function serializeHidden(hidden: Iterable<SubjectCode>): string {
  return JSON.stringify([...new Set(hidden)]);
}

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

export function loadHidden(storage: ReadStorage | undefined): SubjectCode[] {
  try {
    return parseHidden(storage?.getItem(HIDDEN_KEY));
  } catch {
    return [];
  }
}

export function saveHidden(storage: WriteStorage | undefined, hidden: Iterable<SubjectCode>): void {
  try {
    storage?.setItem(HIDDEN_KEY, serializeHidden(hidden));
  } catch {
    // Storage full or blocked: the choice just won't persist.
  }
}

export function filterHidden<T extends { subject: SubjectCode }>(topics: T[], hidden: Iterable<SubjectCode>): T[] {
  const set = new Set(hidden);
  return set.size === 0 ? topics : topics.filter((t) => !set.has(t.subject));
}

/** Subjects that have at least one topic in the list, in the usual SUBJECTS order. */
export function subjectsIn(topics: { subject: SubjectCode }[]): SubjectCode[] {
  const present = new Set(topics.map((t) => t.subject));
  return SUBJECTS.map((s) => s.code).filter((c) => present.has(c));
}
