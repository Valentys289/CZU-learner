import type { Topic, TopicType } from "../types";
import { addDays, daysBetween, dnesList, isNeuceno } from "./termin";

/**
 * Stav options as they exist in the 6 Témata DBs (checked against live Notion).
 * Read and shown only; Part A never writes Stav.
 */
export const STAV_OPTIONS = ["Priming", "Encoding", "Retrieval", "Stable"] as const;

/** `typ` is optional so older callers (and data without the Typ property) count as Téma. */
type PhaseFields = Pick<Topic, "stav" | "hotovo" | "nauceno"> & { typ?: TopicType };

/**
 * Fáze 9 B: an úkol (Typ = Úkol in Notion) is a to-do with a Deadline, not a topic
 * to learn: never encoding, never retrieval, no Termín, Trénink or Fáze checklist.
 * A missing or empty Typ means Téma.
 */
export function isTask(t: { typ?: TopicType }): boolean {
  return t.typ === "Úkol";
}

/** A finished úkol: Hotovo = měsíc (the app's "Hotovo" on a task writes that, plus Stav Stable). */
export function isTaskDone(t: { typ?: TopicType } & Pick<Topic, "hotovo">): boolean {
  return isTask(t) && t.hotovo === "měsíc";
}

/**
 * Encoding (učím nové): the true Neučeno queue, i.e. Hotovo Neučeno or empty and
 * no Naučeno date, whatever Stav says. Most such topics carry Stav Priming.
 * Naučeno dnes is the action that finishes encoding.
 */
export function isEncodingTopic(t: PhaseFields): boolean {
  return !isTask(t) && isNeuceno(t) && !t.nauceno;
}

/**
 * Retrieval (opakuju): everything past first learn, i.e. a Naučeno date or Hotovo
 * past Neučeno. When Stav disagrees (Priming or Encoding on a topic that already
 * has Naučeno or a Hotovo step), the Hotovo queue wins: the topic is retrieval.
 */
export function isRetrievalTopic(t: PhaseFields): boolean {
  return !isTask(t) && !isEncodingTopic(t);
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

/** Deadline state of an úkol: "done" once finished, "none" for témata or no Deadline. */
export type TaskDueState = "overdue" | "today" | "upcoming" | "none" | "done";

export function taskDueState(t: { typ?: TopicType } & Pick<Topic, "hotovo" | "deadline">, today: string): TaskDueState {
  if (!isTask(t)) return "none";
  if (isTaskDone(t)) return "done";
  if (!t.deadline) return "none";
  if (t.deadline < today) return "overdue";
  if (t.deadline === today) return "today";
  return "upcoming";
}

/** Whole days past an open úkol's Deadline; 0 when not overdue. */
export function taskOverdueDays(t: { typ?: TopicType } & Pick<Topic, "hotovo" | "deadline">, today: string): number {
  return taskDueState(t, today) === "overdue" && t.deadline ? daysBetween(t.deadline, today) : 0;
}

export interface DueCounts {
  /** Retrieval with Termín < today, encoding with Deadline < today, open úkoly with Deadline < today. */
  overdue: number;
  /** Same three, due today. */
  today: number;
  /** The encoding part of `overdue` (shown in Učím nové, counted in Po termínu). */
  encodingOverdue: number;
  /** The encoding part of `today`. */
  encodingToday: number;
  /** Fáze 9 B: the úkol part of `overdue` (shown in Úkoly). */
  taskOverdue: number;
  /** The úkol part of `today`. */
  taskToday: number;
}

/**
 * Po termínu / Dnes counts. Retrieval comes from dnesList (unchanged), encoding from
 * encodingDueState, úkoly from taskDueState (open ones only). The three sets are
 * disjoint (encoding topics and úkoly have dueState "none"), so each counts once.
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
  let taskOverdue = 0;
  let taskToday = 0;
  for (const t of topics) {
    if (isTask(t)) {
      const s = taskDueState(t, today);
      if (s === "overdue") taskOverdue++;
      else if (s === "today") taskToday++;
      continue;
    }
    // Guard: never count a topic dnesList already counted.
    if (t.dueState === "overdue" || t.dueState === "today") continue;
    const s = encodingDueState(t, today);
    if (s === "overdue") encodingOverdue++;
    else if (s === "today") encodingToday++;
  }
  return {
    overdue: rOverdue + encodingOverdue + taskOverdue,
    today: rToday + encodingToday + taskToday,
    encodingOverdue,
    encodingToday,
    taskOverdue,
    taskToday,
  };
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

const TASK_RANK: Record<TaskDueState, number> = { overdue: 0, today: 1, upcoming: 2, none: 3, done: 4 };

/**
 * Úkoly section (Dnes and Předměty): open úkoly only, overdue Deadline first (oldest
 * on top), then today, then upcoming by Deadline, úkoly without a Deadline last.
 */
export function openTasks<T extends { typ?: TopicType } & Pick<Topic, "hotovo" | "deadline" | "poradi" | "title" | "subject">>(
  topics: T[],
  today: string,
): T[] {
  return topics
    .filter((t) => isTask(t) && !isTaskDone(t))
    .sort(
      (a, b) =>
        TASK_RANK[taskDueState(a, today)] - TASK_RANK[taskDueState(b, today)] ||
        byDeadline(a.deadline, b.deadline) ||
        (a.poradi ?? Infinity) - (b.poradi ?? Infinity) ||
        a.subject.localeCompare(b.subject) ||
        a.title.localeCompare(b.title, "cs"),
    );
}
