import type { SubjectCode } from "../types";

/**
 * Non-date helpers only. Exam dates live in the Notion Milníky DB.
 * Study phase badge for a milestone (e.g. Matematika test 2: Fáze A until 14. 11., then Fáze B).
 */
export const PHASE_RULES: { subject: SubjectCode; title: RegExp; phaseAEnd: string }[] = [
  { subject: "M", title: /zápočtový test 2/i, phaseAEnd: "2026-11-14" },
];
