import type { SubjectCode, Topic } from "../types";
import { SUBJECTS, TRENINKY_PROP } from "../notion/config";
import { afterHotovoClick, canMarkHotovo, type ActionResult } from "./hotovo";

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
};

export type SessionWriteInput = {
  method: RetrievalMethod;
  score: number;
  /** YYYY-MM-DD, Europe/Prague. Defaults to today. */
  date?: string;
  advanceGap: boolean;
};

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
): { ok: true; input: Required<SessionWriteInput> } | { ok: false; error: string } {
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
  if (typeof b.advanceGap !== "boolean") return { ok: false, error: "Chybí volba Posunout gap" };
  return { ok: true, input: { method: b.method, score, date, advanceGap: b.advanceGap } };
}

/**
 * The topic patch a session applies: the Fáze 2 Hotovo advance with Poslední
 * opakování = the session day, or null when Posunout gap is off (log only).
 */
export function sessionPatch(
  topic: Pick<Topic, "hotovo" | "nauceno" | "posledni">,
  input: Pick<SessionWriteInput, "advanceGap"> & { date: string },
): ActionResult | null {
  if (!input.advanceGap || !canMarkHotovo(topic)) return null;
  return afterHotovoClick({ ...topic, today: input.date });
}

const shortTitle = (title: string) => (title.length > 48 ? `${title.slice(0, 47).trimEnd()}…` : title);
const text = (content: string) => ({ rich_text: content ? [{ type: "text", text: { content: content.slice(0, 2000) } }] : [] });

/** Notion properties for a new Tréninky row. `advancedGap` is what actually happened to the topic. */
export function buildSessionRow(
  topic: Pick<Topic, "id" | "subject" | "title">,
  input: Pick<SessionWriteInput, "method" | "score"> & { date: string },
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
