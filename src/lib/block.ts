// Fáze 11: Blok = a guided run through topics, one after another (spaced, interleaved
// retrieval). Pure helpers: which topics, in which order, with which method.
import type { Topic, TopicType } from "../types";
import type { Milestone } from "../timeline/types";
import { addDays, daysBetween, dnesList } from "./termin";
import { isRetrievalTopic } from "./phase";
import { orderedMethods, toPageId, type LastSession, type RetrievalMethod } from "./sessions";

/**
 * Interleave by subject: always take from the longest remaining subject that is
 * not the one just used, keeping each subject's own order. Two topics of one
 * subject only end up next to each other when no other subject is left.
 */
export function interleave<T extends Pick<Topic, "subject">>(topics: T[]): T[] {
  const queues = new Map<string, T[]>();
  for (const t of topics) {
    const q = queues.get(t.subject);
    if (q) q.push(t);
    else queues.set(t.subject, [t]);
  }
  const out: T[] = [];
  let last: string | null = null;
  while (out.length < topics.length) {
    // Longest queue first (so one big subject is spread out), never the subject just used if another is left.
    const candidates = [...queues.entries()].filter(([, q]) => q.length > 0);
    const pick =
      candidates.filter(([s]) => s !== last).sort((a, b) => b[1].length - a[1].length)[0] ?? candidates[0];
    out.push(pick[1].shift() as T);
    last = pick[0];
  }
  return out;
}

/** Dnešní blok: everything due for retrieval (Po termínu, then Dnes), interleaved by subject. */
export function dueBlock<T extends Pick<Topic, "termin" | "dueState" | "subject" | "poradi" | "title"> & { typ?: TopicType }>(
  topics: T[],
): T[] {
  return interleave(dnesList(topics));
}

/** Choices for how many learned topics (not due yet) a Dnešní blok adds. */
export const EXTRA_OPTIONS = [0, 3, 5, 10] as const;
export const DEFAULT_EXTRA = 5;
/** Topics due within this many days are left out of the extras: they come soon anyway. */
export const EXTRA_SKIP_SOON_DAYS = 2;

type ExtraFields = ReviewFields & Pick<Topic, "posledni" | "termin" | "dueState">;

/** Last time a topic was in front of you: the newest of the last session, Poslední opakování and Naučeno. */
export function lastSeen(t: Pick<Topic, "id" | "posledni" | "nauceno">, last: Record<string, LastSession>): string {
  return [last[toPageId(t.id)]?.date ?? "", t.posledni ?? "", t.nauceno ?? ""].reduce((a, b) => (b > a ? b : a), "");
}

/**
 * Spaced retrieval of learned topics that are not due: the extras of Dnešní blok.
 * Learned topics (měsíc included) not due today or in the next EXTRA_SKIP_SOON_DAYS
 * days and not seen today. Weak ones first (last skóre 1 to 2), then the ones seen
 * longest ago, so everything learned keeps coming back.
 */
export function extraPractice<T extends ExtraFields>(
  topics: T[],
  last: Record<string, LastSession>,
  today: string,
  count: number,
): T[] {
  if (count <= 0) return [];
  const soon = addDays(today, EXTRA_SKIP_SOON_DAYS);
  const weak = (t: T) => ((last[toPageId(t.id)]?.score ?? 5) <= 2 ? 0 : 1);
  return topics
    .filter(
      (t) =>
        isRetrievalTopic(t) &&
        t.dueState !== "overdue" &&
        t.dueState !== "today" &&
        !(t.termin !== null && t.termin <= soon && t.dueState === "upcoming") &&
        lastSeen(t, last) < today,
    )
    .sort((a, b) => weak(a) - weak(b) || lastSeen(a, last).localeCompare(lastSeen(b, last)) || a.title.localeCompare(b.title, "cs"))
    .slice(0, count);
}

/**
 * Fáze 12 Dnešní blok: everything due (Po termínu, Dnes) plus `extra` learned topics
 * from extraPractice, minus the ones left out by hand, interleaved by subject.
 * Within a subject the due ones come first, so stopping early leaves the extras.
 */
export function dailyBlock<T extends ExtraFields & Pick<Topic, "subject" | "poradi">>(
  topics: T[],
  last: Record<string, LastSession>,
  today: string,
  extra: number,
  excluded: ReadonlySet<string> = new Set(),
): { due: T[]; extras: T[]; all: T[] } {
  const due = dnesList(topics).filter((t) => !excluded.has(t.id));
  const extras = extraPractice(
    topics.filter((t) => !excluded.has(t.id)),
    last,
    today,
    extra,
  );
  return { due, extras, all: interleave([...due, ...extras]) };
}

/**
 * Method for a topic in a block: the subject's first preferred method that is not
 * the one used last time, so the material is seen from more than one angle.
 */
export function suggestMethod(subject: string, lastMethod: RetrievalMethod | null | undefined): RetrievalMethod {
  const methods = orderedMethods(subject);
  return methods.find((m) => m !== lastMethod) ?? methods[0];
}

type ReviewFields = Pick<Topic, "id" | "subject" | "title" | "hotovo" | "nauceno" | "stav" | "poradi"> & { typ?: TopicType };

/** Týdenní revize: learned topics with Naučeno in the last `days` days (today included). */
export function recentlyLearned<T extends ReviewFields>(topics: T[], today: string, days = 7): T[] {
  const from = addDays(today, -(days - 1));
  return interleave(
    topics
      .filter((t) => isRetrievalTopic(t) && t.nauceno !== null && t.nauceno >= from && t.nauceno <= today)
      .sort((a, b) => (a.nauceno ?? "").localeCompare(b.nauceno ?? "") || a.title.localeCompare(b.title, "cs")),
  );
}

/** Měsíční revize: learned topics with Naučeno in today's calendar month. */
export function learnedThisMonth<T extends ReviewFields>(topics: T[], today: string): T[] {
  const month = today.slice(0, 7);
  return interleave(
    topics
      .filter((t) => isRetrievalTopic(t) && t.nauceno !== null && t.nauceno.slice(0, 7) === month && t.nauceno <= today)
      .sort((a, b) => (a.nauceno ?? "").localeCompare(b.nauceno ?? "") || a.title.localeCompare(b.title, "cs")),
  );
}

/** Sunday, or the last day of the month: the days the review cards are highlighted. */
export function reviewDay(today: string): { weekly: boolean; monthly: boolean } {
  const [y, m, d] = today.split("-").map(Number);
  return {
    weekly: new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0,
    monthly: addDays(today, 1).slice(0, 7) !== today.slice(0, 7),
  };
}

/** How many days before a test its topics show up in Před testem. */
export const EXAM_HORIZON_DAYS = 14;
const EXAM_KINDS: readonly Milestone["kind"][] = ["test", "zapocet", "zkouska"];

export type ExamPrep<T> = {
  milestone: Pick<Milestone, "id" | "subject" | "title" | "date">;
  daysLeft: number;
  /** Learned topics of the milestone not trained since the window opened, weakest first. */
  todo: T[];
  /** Learned topics already trained in the window. */
  reviewed: number;
  /** Learned topics in total (todo + reviewed). */
  learned: number;
  /** Listed topics that are not learned yet (they belong to Učím nové). */
  unlearned: number;
  /** Suggested number of topics for today so the rest is spread evenly up to the day before the test. */
  perDay: number;
};

type PrepTopic = ReviewFields & Pick<Topic, "posledni">;

/**
 * Před testem: for every test / zápočet / zkouška in the next EXAM_HORIZON_DAYS days
 * with Progress témata, the learned topics that still need one retrieval before it.
 * "Reviewed" = a logged session or Poslední opakování on or after the window start
 * (test day minus horizon). Whatever the spacing step says, including měsíc.
 */
export function examPrep<T extends PrepTopic>(
  milestones: Pick<Milestone, "id" | "subject" | "title" | "date" | "kind" | "topicIds">[],
  topics: T[],
  last: Record<string, LastSession>,
  today: string,
  horizon = EXAM_HORIZON_DAYS,
): ExamPrep<T>[] {
  const byId = new Map(topics.map((t) => [toPageId(t.id), t]));
  const out: ExamPrep<T>[] = [];
  for (const m of milestones) {
    if (!m.date || !EXAM_KINDS.includes(m.kind) || m.topicIds.length === 0) continue;
    const daysLeft = daysBetween(today, m.date);
    if (daysLeft < 0 || daysLeft > horizon) continue;
    const windowStart = addDays(m.date, -horizon);
    const listed = m.topicIds.flatMap((id) => byId.get(toPageId(id)) ?? []);
    const learned = listed.filter(isRetrievalTopic);
    const score = (t: T) => last[toPageId(t.id)]?.score ?? 0; // never trained = weakest
    const isReviewed = (t: T) =>
      (last[toPageId(t.id)]?.date ?? "") >= windowStart || (t.posledni ?? "") >= windowStart;
    const todo = learned.filter((t) => !isReviewed(t)).sort((a, b) => score(a) - score(b) || a.title.localeCompare(b.title, "cs"));
    out.push({
      milestone: { id: m.id, subject: m.subject, title: m.title, date: m.date },
      daysLeft,
      todo,
      reviewed: learned.length - todo.length,
      learned: learned.length,
      unlearned: listed.length - learned.length,
      perDay: todo.length === 0 ? 0 : Math.ceil(todo.length / Math.max(1, daysLeft)),
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export type DayLoad = { date: string; retrieval: number; tests: string[] };

/**
 * Výhled: the next `days` days after today, with how many retrieval topics fall
 * due on each (by Termín as it stands now) and which tests are on that day.
 */
export function weekAhead(
  topics: (Pick<Topic, "termin" | "dueState"> & { typ?: TopicType })[],
  milestones: Pick<Milestone, "title" | "date" | "kind">[],
  today: string,
  days = 7,
): DayLoad[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i + 1);
    return {
      date,
      retrieval: topics.filter((t) => t.typ !== "Úkol" && t.dueState === "upcoming" && t.termin === date).length,
      tests: milestones.filter((m) => m.date === date && EXAM_KINDS.includes(m.kind)).map((m) => m.title),
    };
  });
}

/** Summary of a finished block. */
export function blockSummary(results: { score: number }[]): { count: number; average: number | null; weak: number } {
  const count = results.length;
  return {
    count,
    average: count === 0 ? null : Math.round((results.reduce((s, r) => s + r.score, 0) / count) * 10) / 10,
    weak: results.filter((r) => r.score <= 2).length,
  };
}
