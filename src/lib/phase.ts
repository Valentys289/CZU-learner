import type { Topic } from "../types";
import { addDays, isNeuceno } from "./termin";

/**
 * Stav options as they exist in the 6 Témata DBs (checked against live Notion).
 * Read and shown only; Part A never writes Stav.
 */
export const STAV_OPTIONS = ["Priming", "Encoding", "Retrieval", "Stable"] as const;

type PhaseFields = Pick<Topic, "stav" | "hotovo" | "nauceno">;

/**
 * Encoding (učím nové): the true Neučeno queue, i.e. Hotovo Neučeno or empty and
 * no Naučeno date, whatever Stav says. Most such topics carry Stav Priming.
 * Naučeno dnes is the action that finishes encoding.
 */
export function isEncodingTopic(t: PhaseFields): boolean {
  return isNeuceno(t) && !t.nauceno;
}

/**
 * Retrieval (opakuju): everything past first learn, i.e. a Naučeno date or Hotovo
 * past Neučeno. When Stav disagrees (Priming or Encoding on a topic that already
 * has Naučeno or a Hotovo step), the Hotovo queue wins: the topic is retrieval.
 */
export function isRetrievalTopic(t: PhaseFields): boolean {
  return !isEncodingTopic(t);
}

/** How far ahead Dnes looks for encoding work: Deadline within this many days (or already past). */
export const ENCODING_HORIZON_DAYS = 14;

/**
 * Dnes › Učím nové: encoding topics whose Deadline is on or before today + horizon
 * (overdue deadlines included), soonest Deadline first, then Pořadí. Topics without
 * a Deadline stay on Předměty only, so Dnes is not flooded.
 */
export function encodingDueSoon<T extends PhaseFields & Pick<Topic, "deadline" | "poradi" | "title" | "subject">>(
  topics: T[],
  today: string,
  horizonDays = ENCODING_HORIZON_DAYS,
): T[] {
  const until = addDays(today, horizonDays);
  return topics
    .filter((t) => isEncodingTopic(t) && t.deadline !== null && t.deadline <= until)
    .sort(
      (a, b) =>
        (a.deadline ?? "").localeCompare(b.deadline ?? "") ||
        (a.poradi ?? Infinity) - (b.poradi ?? Infinity) ||
        a.subject.localeCompare(b.subject) ||
        a.title.localeCompare(b.title, "cs"),
    );
}
