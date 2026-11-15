import type { SubjectCode, Topic } from "../types";
import { SUBJECTS, TRENINKY_PROP } from "../notion/config";
import { afterHotovoClick, canMarkHotovo, nextHotovo, type ActionResult } from "./hotovo";
import { computeTermin, isNeuceno } from "./termin";
import { parsePlanDate, planPatch } from "./plan";

/** Retrieval methods. Keys are stored in Notion (Tréninky › Metoda); labels are UI only. */
export const METHODS = ["flashcards", "generatedQs", "brainDump", "quizlet", "other"] as const;
export type RetrievalMethod = (typeof METHODS)[number];

export const METHOD_LABEL: Record<RetrievalMethod, string> = {
  flashcards: "Flashcards",
  generatedQs: "Generated Qs",
  brainDump: "Brain dump",
  quizlet: "Quizlet",
  other: "Jiné",
};

export const SCORES = [1, 2, 3, 4, 5] as const;

/**
 * Preferred retrieval methods per subject (app config, no Notion property).
 * The session sheet lists these first and preselects the first one. Every key
 * must be one of METHODS; the rest of METHODS stay available after them.
 */
export const PREFERRED_METHODS: Record<SubjectCode, RetrievalMethod[]> = {
  M: ["generatedQs", "brainDump", "flashcards"],
  CH: ["flashcards", "quizlet", "generatedQs"],
  ICT: ["flashcards", "generatedQs", "other"],
  TD: ["brainDump", "other", "flashcards"],
  UE: ["flashcards", "other"],
  AJ: ["quizlet", "flashcards", "generatedQs"],
};

/** The subject's preferred methods (valid keys only, no duplicates); all METHODS for an unknown subject. */
export function preferredMethodsFor(subject: string): RetrievalMethod[] {
  const list = PREFERRED_METHODS[subject as SubjectCode];
  if (!list) return [...METHODS];
  return [...new Set(list.filter(isMethod))];
}

/** Sheet order: preferred first, then every other method once. */
export function orderedMethods(subject: string): RetrievalMethod[] {
  const preferred = preferredMethodsFor(subject);
  return [...preferred, ...METHODS.filter((m) => !preferred.includes(m))];
}

/** Skóre at or below this shows a short tip to try another method next time (no effect on gaps). */
export const LOW_SCORE = 2;

/** One Tréninky row as the app reads it. */
export type TrainingSession = {
  id: string;
  topicPageId: string;
  subject: SubjectCode | null;
  topicTitle: string;
  /** YYYY-MM-DD */
  date: string | null;
  method: RetrievalMethod | null;
  score: number | null;
  advancedGap: boolean;
  /** Tréninky › Poznámka (Fáze 10 reflection), null when empty. */
  note: string | null;
};

/**
 * Fáze 10: what a session does to the topic's interval.
 * - advance: the Fáze 2 Hotovo advance (next, longer gap)
 * - repeat: same step again (Hotovo stays, Poslední = session day, same gap from today)
 * - reset: back to večer (Hotovo = večer, Poslední = session day, next in 2 days)
 * - none: log only, Hotovo and Poslední untouched
 */
export const GAP_MODES = ["advance", "repeat", "reset", "none"] as const;
export type GapMode = (typeof GAP_MODES)[number];

export const GAP_LABEL: Record<GapMode, string> = {
  advance: "Posunout",
  repeat: "Zopakovat krok",
  reset: "Od začátku",
  none: "Jen zápis",
};

export function isGapMode(value: unknown): value is GapMode {
  return typeof value === "string" && (GAP_MODES as readonly string[]).includes(value);
}

export type SessionWriteInput = {
  method: RetrievalMethod;
  score: number;
  /** YYYY-MM-DD, Europe/Prague. Defaults to today. */
  date?: string;
  gap: GapMode;
  /** Fáze 10: optional reflection, written to Tréninky › Poznámka. Empty = nothing written. */
  note?: string;
  /** Fáze 12: next retrieval picked by hand (YYYY-MM-DD, after today). Overrides the interval's date, keeps its step. */
  termin?: string | null;
  /** Fáze 12: brain dump text, written into the body of the Tréninky row. Empty = nothing written. */
  dump?: string;
};

/** A session body after validation. */
export type ParsedSession = Required<Omit<SessionWriteInput, "termin">> & { termin: string | null };

/** Longest brain dump the app writes (Notion takes 100 blocks of 2000 characters per request). */
export const DUMP_MAX = 20_000;

/** Last session per topic, for the skóre chip on rows. */
export type LastSession = Pick<TrainingSession, "date" | "method" | "score">;

/** What GET /api/topics returns about Tréninky. */
export type TreninkyResponse = {
  configured: boolean;
  /** Topic page ID (dashed, lower case) → newest session among the most recent rows. */
  last: Record<string, LastSession>;
  /** Czech message when Tréninky is missing or could not be read. */
  error: string | null;
};

export const TRENINKY_MISSING = "Chybí Tréninky DB v config, DEKAN doplní ID";

export function isMethod(value: unknown): value is RetrievalMethod {
  return typeof value === "string" && (METHODS as readonly string[]).includes(value);
}

/** Skóre must be a whole number 1 to 5; anything else is rejected (null). */
export function normalizeScore(n: unknown): number | null {
  const v = typeof n === "string" && n.trim() !== "" ? Number(n) : n;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
}

/** Posunout gap: on by default only when the topic is due today or overdue and can still advance. */
export function defaultAdvanceGap(t: Pick<Topic, "dueState" | "hotovo" | "nauceno" | "posledni">): boolean {
  return (t.dueState === "overdue" || t.dueState === "today") && canMarkHotovo(t);
}

/**
 * Fáze 10: the interval follows the skóre (confidence beats the answer sheet).
 * Only for a due topic that can still move; extra practice and finished topics
 * stay log only. Skóre 4 to 5 advance, 3 repeats the step, 1 to 2 start again
 * at večer. Without a skóre yet: advance (the old default).
 */
export function suggestedGap(t: Pick<Topic, "dueState" | "hotovo" | "nauceno" | "posledni">, score: number | null): GapMode {
  if (!defaultAdvanceGap(t)) return "none";
  if (score === null || score >= 4) return "advance";
  return score === 3 ? "repeat" : "reset";
}

/** Dashed lower-case UUID, the form Notion returns for page IDs. Used as the join key. */
export function toPageId(id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return id.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a session body from the browser. The date may not be in the future
 * (a session is something that happened) and defaults to today.
 */
export function parseSessionInput(
  body: unknown,
  today: string,
): { ok: true; input: ParsedSession } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Neplatná data tréninku" };
  const b = body as Record<string, unknown>;
  if (!isMethod(b.method)) return { ok: false, error: "Vyber metodu" };
  const score = normalizeScore(b.score);
  if (score === null) return { ok: false, error: "Skóre musí být 1 až 5" };
  const date = b.date === undefined || b.date === null || b.date === "" ? today : b.date;
  if (typeof date !== "string" || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    return { ok: false, error: "Neplatné datum" };
  }
  if (date > today) return { ok: false, error: "Datum tréninku nemůže být v budoucnu" };
  // `advanceGap` is the Fáze 6 body (an older open tab); `gap` wins when both are sent.
  const gap = isGapMode(b.gap) ? b.gap : typeof b.advanceGap === "boolean" ? (b.advanceGap ? "advance" : "none") : null;
  if (!gap) return { ok: false, error: "Chybí volba intervalu" };
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") return { ok: false, error: "Neplatná poznámka" };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, NOTE_MAX) : "";
  let termin: string | null = null;
  if (b.termin !== undefined && b.termin !== null && b.termin !== "") {
    const plan = parsePlanDate(b.termin, today);
    if (!plan.ok) return plan;
    termin = plan.date;
  }
  if (b.dump !== undefined && b.dump !== null && typeof b.dump !== "string") return { ok: false, error: "Neplatný brain dump" };
  const dump = typeof b.dump === "string" ? b.dump.trim() : "";
  if (dump.length > DUMP_MAX) return { ok: false, error: `Brain dump je moc dlouhý (nejvíc ${DUMP_MAX} znaků)` };
  return { ok: true, input: { method: b.method, score, date, gap, note, termin, dump } };
}

/** Longest Poznámka the app writes (Notion's rich text limit is 2000). */
export const NOTE_MAX = 500;

/**
 * The topic patch a session applies, with Poslední opakování = the session day,
 * or null for Jen zápis (and for topics that cannot move: unlearned or měsíc).
 * On the first retrieval (Hotovo Neučeno with a Naučeno date) every mode but
 * none is the advance to večer: that already is the shortest gap.
 */
export function sessionPatch(
  topic: Pick<Topic, "hotovo" | "nauceno" | "posledni">,
  input: Pick<SessionWriteInput, "gap" | "termin"> & { date: string },
): ActionResult | null {
  const base = gapPatch(topic, input);
  if (!input.termin) return base;
  // Fáze 12: the date picked by hand wins; the step is the one the interval choice left.
  const planned = planPatch({ ...topic, ...base?.patch }, input.termin);
  if (!planned) return base;
  return { patch: { ...base?.patch, ...planned.patch }, termin: planned.termin };
}

function gapPatch(topic: Pick<Topic, "hotovo" | "nauceno" | "posledni">, input: Pick<SessionWriteInput, "gap"> & { date: string }): ActionResult | null {
  if (input.gap === "none" || !canMarkHotovo(topic)) return null;
  const advance = afterHotovoClick({ ...topic, today: input.date });
  if (input.gap === "advance" || isNeuceno(topic) || !topic.hotovo) return advance;
  const hotovo = input.gap === "reset" ? "večer" : topic.hotovo;
  const patch = { hotovo, posledni: input.date };
  return { patch, termin: computeTermin({ ...topic, ...patch }) };
}

const shortTitle = (title: string) => (title.length > 48 ? `${title.slice(0, 47).trimEnd()}…` : title);
const text = (content: string) => ({ rich_text: content ? [{ type: "text", text: { content: content.slice(0, 2000) } }] : [] });

/**
 * True when the patch moved Hotovo one step forward (the Tréninky "Posunul gap"
 * checkbox). Zopakovat krok and Od začátku are not an advance.
 */
export function isAdvance(topic: Pick<Topic, "hotovo">, result: ActionResult | null): boolean {
  return result !== null && result.patch.hotovo === nextHotovo(topic.hotovo);
}

/**
 * Poznámka for the Tréninky row: the reflection, plus the interval choice when it
 * was not an advance (so Notion shows why the gap did not move). Empty = none.
 */
export function sessionNote(
  note: string,
  topic: Pick<Topic, "hotovo">,
  result: ActionResult | null,
  extra: { termin?: string | null; dump?: string } = {},
): string {
  const parts = [note.trim()];
  if (result && !isAdvance(topic, result) && !extra.termin) {
    parts.push(result.patch.hotovo === topic.hotovo ? "Interval: zopakovat krok" : "Interval: od začátku");
  }
  if (extra.termin && result) parts.push(`Další opakování ručně na ${extra.termin}`);
  if (extra.dump) parts.push(`Brain dump: ${dumpPreview(extra.dump)}`);
  return parts.filter(Boolean).join(" · ").slice(0, NOTE_MAX + 200);
}

/** Notion properties for a new Tréninky row. `advancedGap` is what actually happened to the topic. */
export function buildSessionRow(
  topic: Pick<Topic, "id" | "subject" | "title">,
  input: Pick<SessionWriteInput, "method" | "score"> & { date: string; note?: string },
  advancedGap: boolean,
): Record<string, unknown> {
  const subject = SUBJECTS.find((s) => s.code === topic.subject);
  return {
    [TRENINKY_PROP.nazev]: {
      title: [{ type: "text", text: { content: `${input.date} · ${METHOD_LABEL[input.method]} · ${shortTitle(topic.title)}` } }],
    },
    [TRENINKY_PROP.datum]: { date: { start: input.date } },
    [TRENINKY_PROP.metoda]: { select: { name: input.method } },
    [TRENINKY_PROP.skore]: { number: input.score },
    ...(subject ? { [TRENINKY_PROP.predmet]: { select: { name: subject.name } } } : {}),
    [TRENINKY_PROP.tema]: text(topic.title),
    [TRENINKY_PROP.temaPageId]: text(toPageId(topic.id)),
    [TRENINKY_PROP.posunulGap]: { checkbox: advancedGap },
    [TRENINKY_PROP.zdroj]: { select: { name: "app" } },
    // Only when there is something to say, so a skipped reflection writes nothing.
    ...(input.note ? { [TRENINKY_PROP.poznamka]: text(input.note) } : {}),
  };
}

/** Newest first: by date, then by the order given (Notion returns newest created first within a day). */
export function lastSessionByTopic(sessions: TrainingSession[]): Record<string, LastSession> {
  const out: Record<string, LastSession> = {};
  for (const s of sessions) {
    const key = toPageId(s.topicPageId);
    const prev = out[key];
    if (!prev || (s.date ?? "") > (prev.date ?? "")) out[key] = { date: s.date, method: s.method, score: s.score };
  }
  return out;
}

/** First words of a brain dump on one line, for Poznámka (the full text is in the row's body). */
export function dumpPreview(dump: string, max = 120): string {
  const line = dump.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * Body of a Tréninky row with a brain dump: a "Brain dump" heading, then one
 * paragraph per line block (blank lines split), each cut into 2000-character pieces
 * (Notion's rich text limit), at most 99 paragraphs.
 */
export function dumpBlocks(dump: string): Record<string, unknown>[] {
  const text = dump.trim();
  if (!text) return [];
  const paragraphs: string[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const t = chunk.trim();
    for (let i = 0; i < t.length; i += 2000) paragraphs.push(t.slice(i, i + 2000));
  }
  const rich = (content: string) => [{ type: "text", text: { content } }];
  return [
    { object: "block", type: "heading_3", heading_3: { rich_text: rich("Brain dump") } },
    ...paragraphs.slice(0, 99).map((p) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich(p) } })),
  ];
}
