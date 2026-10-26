import type { SubjectCode, Topic } from "../types";
import { SUBJECTS } from "../notion/config";
import { daysBetween, isNeuceno } from "../lib/termin";
import { BASELINE, MATH_TEST_2_PHASE_A_END, type BaselineMilestone } from "./baseline";
import type { Milestone, MilestoneSource, Progress } from "./types";

/** A topic's Notion `Deadline`, as a milestone candidate. */
export type NotionDeadline = { subject: SubjectCode; title: string; date: string; topicId: string };

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

// Matematika test 2: 4 bundles. A bundle is done when every part has a matching topic and all of them are learned.
const MATH_TEST_2_BUNDLES: { name: string; parts: RegExp[] }[] = [
  { name: "Definiční obor", parts: [/definiční|reálné funkce/i] },
  { name: "Inverzní funkce", parts: [/inverzní/i] },
  { name: "Limity", parts: [/limit/i] },
  { name: "Derivace", parts: [/asymptot/i, /derivac/i] },
];

export type BundleProgress = { name: string; done: boolean; found: boolean; topicIds: string[] };
export type MathTest2Progress = Progress & { bundles: BundleProgress[] };

export function mathTest2Progress(topics: Topic[]): MathTest2Progress {
  const math = topics.filter((t) => t.subject === "M");
  const bundles = MATH_TEST_2_BUNDLES.map(({ name, parts }) => {
    const perPart = parts.map((re) => math.filter((t) => re.test(t.title)));
    const matched = [...new Set(perPart.flat())];
    const found = perPart.every((m) => m.length > 0);
    return { name, found, done: found && matched.every(isLearned), topicIds: matched.map((t) => t.id) };
  });
  return { ...progressOf(bundles.filter((b) => b.done).length, bundles.length), bundles };
}

/** "A" until 14. 11. while bundles are missing, "A-done" when all 4 are learned by then, "B" afterwards. */
export function mathTest2Phase(today: string, done: number): "A" | "A-done" | "B" {
  if (today > MATH_TEST_2_PHASE_A_END) return "B";
  return done < MATH_TEST_2_BUNDLES.length ? "A" : "A-done";
}

export function notionDeadlines(topics: Topic[]): NotionDeadline[] {
  return topics
    .filter((t): t is Topic & { deadline: string } => t.deadline !== null)
    .map((t) => ({ subject: t.subject, title: t.title, date: t.deadline, topicId: t.id }));
}

const uniqSorted = (dates: string[]) => [...new Set(dates)].sort();

/**
 * Combine the baseline with live Notion Deadlines. A matching Deadline that
 * differs from the baseline date is kept as a conflict (both dates shown, the
 * Notion one displayed first), never silently resolved. Milestones that need a
 * Notion Deadline and have none are dropped. Progress is filled in later.
 */
export function mergeMilestones(baseline: BaselineMilestone[], deadlines: NotionDeadline[]): Milestone[] {
  const out: Milestone[] = [];
  for (const b of baseline) {
    const matches = b.deadlineMatch
      ? deadlines.filter((d) => d.subject === b.subject && b.deadlineMatch!.test(d.title))
      : [];
    if (b.requireNotion && matches.length === 0) continue;

    const sources = new Set<MilestoneSource>(b.sources);
    const notionDates = uniqSorted(matches.map((d) => d.date));
    let date = b.date;
    let conflictDates = b.conflictDates;

    if (notionDates.length > 0) {
      sources.add("notion-deadline");
      const all = uniqSorted([...(b.date ? [b.date] : []), ...(b.conflictDates ?? []), ...notionDates]);
      if (all.length > 1) {
        sources.add("conflict");
        conflictDates = all;
        date = b.conflictDates ? null : notionDates[0];
      } else {
        date = all[0];
      }
    }

    out.push({
      id: b.id,
      subject: b.subject,
      title: b.title,
      kind: b.kind,
      date,
      time: b.time ?? null,
      place: b.place ?? null,
      text: b.text ?? null,
      sources: [...sources],
      ...(conflictDates && conflictDates.length > 1 ? { conflictDates } : {}),
      topicIds: matches.map((d) => d.topicId),
      linkOut: b.linkOut,
      progress: null,
    });
  }
  return out;
}

/** Dates a milestone may fall on: the date, or every conflicting one. */
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

/** Upcoming (soonest first), then soft (no day), then past (most recent first). */
export function sortMilestones<T extends Pick<Milestone, "date" | "conflictDates" | "subject" | "title">>(
  list: T[],
  today: string,
): T[] {
  return [...list].sort((a, b) => {
    const ga = groupOf(a, today);
    const gb = groupOf(b, today);
    if (ga !== gb) return GROUP_ORDER[ga] - GROUP_ORDER[gb];
    const da = datesOf(a)[0] ?? "";
    const db = datesOf(b)[0] ?? "";
    const byDate = ga === "past" ? db.localeCompare(da) : da.localeCompare(db);
    return byDate || a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title, "cs");
  });
}

export function subjectPageUrl(subject: SubjectCode): string | null {
  const s = SUBJECTS.find((x) => x.code === subject);
  return s ? `https://www.notion.so/${s.pageId.replace(/-/g, "")}` : null;
}

export type TimelineEntry = Milestone & { math?: MathTest2Progress };

/** Baseline + live Deadlines, with progress and links, sorted. Read-only: no Notion calls. */
export function buildTimeline(topics: Topic[], today: string, baseline: BaselineMilestone[] = BASELINE): TimelineEntry[] {
  const rules = new Map(baseline.map((b) => [b.id, b.progress]));
  const entries = mergeMilestones(baseline, notionDeadlines(topics)).map((m): TimelineEntry => {
    const rule = rules.get(m.id);
    const notion = subjectPageUrl(m.subject);
    const linkOut = [...(m.linkOut ?? []), ...(notion ? [{ label: "Notion", href: notion }] : [])];

    if (rule === "math-test-2") {
      const math = mathTest2Progress(topics);
      const ids = [...new Set([...m.topicIds, ...math.bundles.flatMap((b) => b.topicIds)])];
      return { ...m, linkOut, topicIds: ids, progress: { total: math.total, done: math.done, pct: math.pct }, math };
    }
    if (rule === "subject") {
      const mine = topics.filter((t) => t.subject === m.subject);
      const ids = [...new Set([...m.topicIds, ...mine.map((t) => t.id)])];
      return { ...m, linkOut, topicIds: ids, progress: mine.length ? subjectProgress(mine) : null };
    }
    return { ...m, linkOut };
  });
  return sortMilestones(entries, today);
}
