import type { SubjectCode, Topic } from "../types";
import { SUBJECTS } from "../notion/config";
import { daysBetween, isNeuceno, toDateOnly } from "../lib/termin";
import { PHASE_RULES } from "./config";
import type { Milestone, MilestoneKind, MilnikyResponse, MilnikyRow, Progress, ProgressItem } from "./types";

/** Learned: has a Naučeno date or Hotovo is past Neučeno. */
export function isLearned(t: Pick<Topic, "hotovo" | "nauceno">): boolean {
  return t.nauceno !== null || !isNeuceno(t);
}

function progressOf(done: number, total: number): Progress {
  return { total, done, pct: total === 0 ? 0 : done / total };
}

export function subjectProgress(topics: Pick<Topic, "hotovo" | "nauceno">[]): Progress {
  return progressOf(topics.filter(isLearned).length, topics.length);
}

/** Calendar days from today to date (negative when past). Both are Prague dates. */
export function daysUntil(date: string, today: string): number {
  return daysBetween(today, date);
}

const norm = (s: string) => s.toLocaleLowerCase("cs").replace(/\s+/g, " ").trim();

/**
 * Progress over the topic titles listed in a milestone's `Progress témata`
 * (one per line), matched against the already loaded topics of that subject:
 * exact title first, then a topic title containing the listed text, then the
 * other way round. Unmatched titles count as not done.
 */
export function matchProgressTopics(
  titles: string[],
  topics: Pick<Topic, "id" | "title" | "hotovo" | "nauceno">[],
): Progress & { items: ProgressItem[] } {
  const items = titles.map((title): ProgressItem => {
    const want = norm(title);
    const topic =
      topics.find((t) => norm(t.title) === want) ??
      topics.find((t) => norm(t.title).includes(want)) ??
      topics.find((t) => norm(t.title).length >= 4 && want.includes(norm(t.title)));
    return { title, topicId: topic?.id ?? null, done: topic ? isLearned(topic) : false };
  });
  return { ...progressOf(items.filter((i) => i.done).length, items.length), items };
}

export function progressTitles(row: Pick<MilnikyRow, "progressTemata">): string[] {
  return (row.progressTemata ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const KINDS: readonly MilestoneKind[] = ["zapocet", "zkouska", "test", "odevzdani", "soft", "dochazka", "cviceni"];

function subjectCode(predmet: string | null): SubjectCode | null {
  if (!predmet) return null;
  const p = norm(predmet);
  return SUBJECTS.find((s) => norm(s.name) === p || norm(s.code) === p)?.code ?? null;
}

/** "08:45" from a Notion datetime start, when the date itself carries a time. */
function timeFromDatum(datum: string | null): string | null {
  const m = datum ? /T(\d{2}:\d{2})/.exec(datum) : null;
  return m ? m[1] : null;
}

function parseConflict(csv: string | null): string[] {
  const dates = (csv ?? "")
    .split(/[,;\s]+/)
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return [...new Set(dates)].sort();
}

/**
 * One Milníky row to a Timeline card. Returns null for inactive rows and rows
 * whose Předmět is not one of the 6 subjects. Never invents a date: an empty
 * Datum stays a soft row.
 */
export function milnikyRowToMilestone(row: MilnikyRow): Milestone | null {
  if (!row.aktivni) return null;
  const subject = subjectCode(row.predmet);
  if (!subject) return null;

  const date = toDateOnly(row.datum);
  const conflict = parseConflict(row.konfliktData);
  const hasConflict = conflict.length >= 2;

  return {
    id: row.id,
    subject,
    title: row.nazev.trim() || "(bez názvu)",
    kind: KINDS.includes(row.typ as MilestoneKind) ? (row.typ as MilestoneKind) : date ? "test" : "soft",
    date,
    time: row.cas?.trim() || timeFromDatum(row.datum),
    place: row.misto?.trim() || null,
    softText: row.softText?.trim() || null,
    note: row.poznamka?.trim() || null,
    sources: ["notion-milniky", ...(hasConflict ? (["conflict"] as const) : [])],
    ...(hasConflict ? { conflictDates: conflict } : {}),
    order: row.poradi,
    topicIds: [],
    linkOut: [
      ...(row.linkPlan ? [{ label: "Otevřít plán", href: row.linkPlan }] : []),
      ...(row.url ? [{ label: "Notion", href: row.url }] : []),
    ],
    progress: null,
  };
}

/** Dates a milestone may fall on: every conflicting one, or the date. */
function datesOf(m: Pick<Milestone, "date" | "conflictDates">): string[] {
  return m.conflictDates?.length ? m.conflictDates : m.date ? [m.date] : [];
}

export type MilestoneGroup = "upcoming" | "soft" | "past";

/** Past only when every possible date is before today, so a conflict never hides early. */
export function groupOf(m: Pick<Milestone, "date" | "conflictDates">, today: string): MilestoneGroup {
  const dates = datesOf(m);
  if (dates.length === 0) return "soft";
  return dates[dates.length - 1] < today ? "past" : "upcoming";
}

const GROUP_ORDER: Record<MilestoneGroup, number> = { upcoming: 0, soft: 1, past: 2 };

type Sortable = Pick<Milestone, "date" | "conflictDates" | "subject" | "title"> & { order?: number | null };

/** Upcoming (soonest first), then soft (no day), then past (most recent first). Pořadí breaks ties. */
export function sortMilestones<T extends Sortable>(list: T[], today: string): T[] {
  return [...list].sort((a, b) => {
    const ga = groupOf(a, today);
    const gb = groupOf(b, today);
    if (ga !== gb) return GROUP_ORDER[ga] - GROUP_ORDER[gb];
    const da = datesOf(a)[0] ?? "";
    const db = datesOf(b)[0] ?? "";
    const byDate = ga === "past" ? db.localeCompare(da) : da.localeCompare(db);
    return (
      byDate ||
      (a.order ?? Infinity) - (b.order ?? Infinity) ||
      a.subject.localeCompare(b.subject) ||
      a.title.localeCompare(b.title, "cs")
    );
  });
}

export type StudyPhase = "A" | "A-done" | "B";

/** Fáze A until the rule's cutover while titles are unlearned, "A-done" when all are, "B" afterwards. */
export function studyPhase(m: Pick<Milestone, "subject" | "title" | "progress">, today: string): StudyPhase | null {
  const rule = PHASE_RULES.find((r) => r.subject === m.subject && r.title.test(m.title));
  if (!rule) return null;
  if (today > rule.phaseAEnd) return "B";
  return m.progress && m.progress.total > 0 && m.progress.done === m.progress.total ? "A-done" : "A";
}

export type Timeline = {
  milestones: Milestone[];
  /** Rows skipped because Předmět is not one of the 6 subjects. */
  skipped: string[];
};

/**
 * Timeline cards from Notion Milníky, with progress from the already loaded topics. Topics never become
 * cards here: Témata Deadline is the study plan, not an exam.
 */
export function buildTimeline(topics: Topic[], milniky: MilnikyResponse, today: string): Timeline {
  const skipped: string[] = [];
  const milestones: Milestone[] = [];

  for (const row of milniky.rows) {
    const m = milnikyRowToMilestone(row);
    if (!m) {
      if (row.aktivni) skipped.push(row.nazev);
      continue;
    }
    const titles = progressTitles(row);
    if (titles.length > 0) {
      const progress = matchProgressTopics(
        titles,
        topics.filter((t) => t.subject === m.subject),
      );
      m.progress = progress;
      m.topicIds = progress.items.flatMap((i) => (i.topicId ? [i.topicId] : []));
    }
    milestones.push(m);
  }
  return { milestones: sortMilestones(milestones, today), skipped };
}
