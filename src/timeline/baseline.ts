import type { SubjectCode } from "../types";
import type { MilestoneKind, MilestoneSource } from "./types";

/**
 * Which topics count toward a milestone's progress:
 * - "subject": every topic of the subject
 * - "math-test-2": the 4 Matematika test 2 bundles (see progress.ts)
 * - null: no progress bar
 */
export type ProgressRule = "subject" | "math-test-2" | null;

export type BaselineMilestone = {
  id: string;
  subject: SubjectCode;
  title: string;
  kind: MilestoneKind;
  date: string | null;
  time?: string;
  place?: string;
  /** Soft rows: the only "when" we have. Dated rows: a short note. */
  text?: string;
  /** Dates from different sources that disagree. The milestone shows all of them. */
  conflictDates?: string[];
  sources: MilestoneSource[];
  /**
   * Topic titles that carry this milestone's date in their Notion `Deadline`.
   * A live Deadline that differs from `date` is flagged as a conflict.
   */
  deadlineMatch?: RegExp;
  /** Show only when a matching topic still has a Deadline in Notion (date then comes from Notion). */
  requireNotion?: boolean;
  progress: ProgressRule;
  linkOut?: { label: string; href: string }[];
};

export const MATH_TEST_2_PLAN_URL =
  "https://cursor.com/canvas/store-dfeb3461-eb69-4497-b353-2632ad43e351/f152da4e-5582-42b3-95ee-e2c6b6e925b5";

/** Matematika test 2 Fáze A ends on this day; afterwards it is Fáze B (retrieval, praxe, slabiny). */
export const MATH_TEST_2_PHASE_A_END = "2026-11-14";

/**
 * Verified milestones, baseline 2026-10-26 (Europe/Prague), from the Fáze 3 brief.
 * DEKAN owns this list: update it here when the sources change. Never add a day
 * the sources do not give; use a soft row (date null + text) instead.
 */
export const BASELINE: BaselineMilestone[] = [
  {
    id: "m-test-1",
    subject: "M",
    title: "Zápočtový test 1",
    kind: "test",
    date: "2026-10-25",
    time: "08:45",
    place: "MI",
    text: "Rovnice, nerovnice",
    sources: ["baseline"],
    progress: null,
  },
  {
    id: "m-test-2",
    subject: "M",
    title: "Zápočtový test 2",
    kind: "test",
    date: "2026-12-05",
    time: "08:45",
    place: "MI",
    text: "Definiční obor, inverzní funkce, limity, derivace",
    sources: ["baseline"],
    progress: "math-test-2",
    linkOut: [{ label: "Otevřít plán", href: MATH_TEST_2_PLAN_URL }],
  },
  {
    id: "m-test-3",
    subject: "M",
    title: "Zápočtový test 3",
    kind: "test",
    date: "2027-01-07",
    text: "Jen pokud je stále v programu",
    sources: ["baseline"],
    progress: null,
  },
  {
    id: "m-test-4",
    subject: "M",
    title: "Zápočtový test 4",
    kind: "test",
    date: "2027-01-08",
    text: "Jen pokud je stále v programu",
    sources: ["baseline"],
    progress: null,
  },
  {
    id: "ch-pisemka",
    subject: "CH",
    title: "Zápočtová písemka",
    kind: "zapocet",
    // Chemie page + 23. 10. lecture summary say út 5. 1.; Termíny ČZU says 6. 1. Not resolved on purpose.
    date: null,
    conflictDates: ["2027-01-05", "2027-01-06"],
    text: "Stránka Chemie a shrnutí přednášky: 5. 1. · Termíny ČZU: 6. 1.",
    sources: ["notion-page", "baseline", "conflict"],
    progress: "subject",
  },
  {
    id: "aj-zapocet",
    subject: "AJ",
    title: "Zápočet",
    kind: "zapocet",
    date: "2027-01-04",
    time: "13:00",
    sources: ["baseline"],
    progress: "subject",
  },
  {
    id: "ict-esej",
    subject: "ICT",
    title: "Esej",
    kind: "odevzdani",
    date: null,
    text: "Konec listopadu",
    sources: ["baseline"],
    progress: null,
  },
  {
    id: "ict-excel-1",
    subject: "ICT",
    title: "Excel, 1. pokus",
    kind: "test",
    date: null,
    text: "Začátek prosince",
    sources: ["baseline"],
    progress: null,
  },
  {
    id: "ict-excel-opravny",
    subject: "ICT",
    title: "Excel, opravný termín",
    kind: "test",
    date: "2027-01-06",
    sources: ["baseline"],
    deadlineMatch: /excel.*oprav/i,
    progress: null,
  },
  {
    id: "ict-uis",
    subject: "ICT",
    title: "Zápis zápočtu v UIS",
    kind: "zapocet",
    date: "2027-02-05",
    sources: ["baseline"],
    progress: null,
  },
  {
    id: "td-sp",
    subject: "TD",
    title: "Téma SP (Moodle)",
    kind: "odevzdani",
    date: null,
    sources: [],
    deadlineMatch: /\bSP\b|semestráln|moodle/i,
    requireNotion: true,
    progress: null,
  },
  {
    id: "ue-dochazka",
    subject: "UE",
    title: "Zápočet = docházka",
    kind: "dochazka",
    date: null,
    text: "Max 2 absence",
    sources: ["baseline"],
    progress: null,
  },
];
