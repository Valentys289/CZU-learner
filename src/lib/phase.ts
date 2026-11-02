import type { Topic } from "../types";
import { addDays, daysBetween, dnesList, isNeuceno } from "./termin";

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

/** Deadline state of an encoding topic; "none" for retrieval topics or no Deadline. */
export type EncodingDueState = "overdue" | "today" | "upcoming" | "none";

/**
 * Encoding topics have no Termín (dueState "none"), so their Deadline decides whether
 * they count as Po termínu (Deadline < today) or Dnes (Deadline === today).
 */
export function encodingDueState(t: PhaseFields & Pick<Topic, "deadline">, today: string): EncodingDueState {
  if (!isEncodingTopic(t) || !t.deadline) return "none";
  if (t.deadline < today) return "overdue";
  if (t.deadline === today) return "today";
  return "upcoming";
}

/** Whole days past the Deadline (today minus Deadline); 0 when not overdue. */
export function encodingOverdueDays(t: PhaseFields & Pick<Topic, "deadline">, today: string): number {
  return encodingDueState(t, today) === "overdue" && t.deadline ? daysBetween(t.deadline, today) : 0;
}

export interface DueCounts {
  /** Retrieval with Termín < today plus encoding with Deadline < today. */
  overdue: number;
  /** Retrieval with Termín === today plus encoding with Deadline === today. */
  today: number;
  /** The encoding part of `overdue` (shown in Učím nové, counted in Po termínu). */
  encodingOverdue: number;
  /** The encoding part of `today`. */
  encodingToday: number;
}

/**
 * Po termínu / Dnes counts. Retrieval comes from dnesList (unchanged), encoding from
 * encodingDueState. The two sets are disjoint (encoding topics have dueState "none"),
 * so each topic counts at most once.
 */
export function dueCounts<T extends PhaseFields & Pick<Topic, "deadline" | "termin" | "dueState" | "subject" | "poradi" | "title">>(
  topics: T[],
  today: string,
): DueCounts {
  const retrieval = dnesList(topics);
  const rOverdue = retrieval.filter((t) => t.dueState === "overdue").length;
  const rToday = retrieval.length - rOverdue;
  let encodingOverdue = 0;
  let encodingToday = 0;
  for (const t of topics) {
    // Guard: never count a topic dnesList already counted.
    if (t.dueState === "overdue" || t.dueState === "today") continue;
    const s = encodingDueState(t, today);
    if (s === "overdue") encodingOverdue++;
    else if (s === "today") encodingToday++;
  }
  return { overdue: rOverdue + encodingOverdue, today: rToday + encodingToday, encodingOverdue, encodingToday };
}

function byDeadline(a: string | null, b: string | null): number {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0;
  return a ? -1 : b ? 1 : 0;
}

const ENCODING_RANK: Record<EncodingDueState, number> = { overdue: 0, today: 1, upcoming: 2, none: 3 };

/**
 * Učím nové order: overdue Deadline first (oldest on top), then Deadline today, then
 * upcoming by Deadline, topics without a Deadline last (by Pořadí, then title).
 */
export function compareEncoding<T extends PhaseFields & Pick<Topic, "deadline" | "poradi" | "title" | "subject">>(
  a: T,
  b: T,
  today: string,
): number {
  return (
    ENCODING_RANK[encodingDueState(a, today)] - ENCODING_RANK[encodingDueState(b, today)] ||
    byDeadline(a.deadline, b.deadline) ||
    (a.poradi ?? Infinity) - (b.poradi ?? Infinity) ||
    a.subject.localeCompare(b.subject) ||
    a.title.localeCompare(b.title, "cs")
  );
}

/**
 * Dnes › Učím nové: encoding topics whose Deadline is on or before today + horizon
 * (overdue deadlines included), overdue first (oldest Deadline on top), then Pořadí.
 * Topics without a Deadline stay on Předměty only, so Dnes is not flooded.
 */
export function encodingDueSoon<T extends PhaseFields & Pick<Topic, "deadline" | "poradi" | "title" | "subject">>(
  topics: T[],
  today: string,
  horizonDays = ENCODING_HORIZON_DAYS,
): T[] {
  const until = addDays(today, horizonDays);
  return topics
    .filter((t) => isEncodingTopic(t) && t.deadline !== null && t.deadline <= until)
    .sort((a, b) => compareEncoding(a, b, today));
}
