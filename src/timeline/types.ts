import type { SubjectCode } from "../types";

export type MilestoneKind = "zapocet" | "zkouska" | "test" | "odevzdani" | "soft" | "dochazka";

export type MilestoneSource = "notion-deadline" | "notion-page" | "baseline" | "conflict";

export type Progress = { total: number; done: number; pct: number };

export type Milestone = {
  id: string;
  subject: SubjectCode;
  title: string;
  kind: MilestoneKind;
  /** YYYY-MM-DD when known; null for soft rows. */
  date: string | null;
  /** "08:45" local, optional. */
  time?: string | null;
  place?: string | null;
  /** Shown instead of a date on soft rows ("konec listopadu"), or as a note under dated ones. */
  text?: string | null;
  sources: MilestoneSource[];
  /** Every date the sources give when they disagree, sorted. */
  conflictDates?: string[];
  /** Notion pages contributing to progress. */
  topicIds: string[];
  linkOut?: { label: string; href: string }[];
  progress: Progress | null;
};
