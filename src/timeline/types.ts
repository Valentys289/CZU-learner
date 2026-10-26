import type { SubjectCode } from "../types";

export type MilestoneKind = "zapocet" | "zkouska" | "test" | "odevzdani" | "soft" | "dochazka" | "cviceni";

export type MilestoneSource =
  | "notion-milniky"
  | "conflict";

/** One row of the Notion Milníky DB, as the server reads it. Property names in MILNIKY_PROP. */
export type MilnikyRow = {
  id: string;
  url: string | null;
  nazev: string;
  /** Subject name as in Předměty ("Matematika"). */
  predmet: string | null;
  typ: string | null;
  /** Notion date start: YYYY-MM-DD, or a datetime when a time was set on the date. */
  datum: string | null;
  cas: string | null;
  misto: string | null;
  softText: string | null;
  /** CSV of ISO dates when sources disagree. */
  konfliktData: string | null;
  aktivni: boolean;
  poznamka: string | null;
  /** One topic title per line. */
  progressTemata: string | null;
  poradi: number | null;
  linkPlan: string | null;
};

export type MilnikySource = "notion" | "unconfigured";

/** What GET /api/topics returns about milestones. */
export type MilnikyResponse = {
  source: MilnikySource;
  rows: MilnikyRow[];
  /** Czech message when Milníky could not be read (or are not configured). */
  error: string | null;
};

export type Progress = { total: number; done: number; pct: number };

export type ProgressItem = { title: string; topicId: string | null; done: boolean };

export type Milestone = {
  id: string;
  subject: SubjectCode;
  title: string;
  kind: MilestoneKind;
  /** YYYY-MM-DD when known; null for soft rows. */
  date: string | null;
  /** "08:45" or "13:00–14:15", local, optional. */
  time: string | null;
  place: string | null;
  /** Soft rows: the only "when" we have ("konec listopadu"). */
  softText: string | null;
  note: string | null;
  sources: MilestoneSource[];
  /** Every date the sources give when they disagree, sorted (2 or more). */
  conflictDates?: string[];
  order: number | null;
  /** Notion topic page ids contributing to progress. */
  topicIds: string[];
  linkOut: { label: string; href: string }[];
  progress: (Progress & { items: ProgressItem[] }) | null;
};
