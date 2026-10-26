// Server-side only: runs inside the Vite dev/preview server, never in the browser.
import { DEFAULT_TIME_ZONE, PROP, SUBJECTS, type SubjectConfig } from "./config";
import { toDateOnly, todayIn, withTermin } from "../lib/termin";
import { applyAction, type TopicAction, type TopicPatch } from "../lib/hotovo";
import type { Hotovo, SubjectError, Topic, TopicsResponse } from "../types";

const NOTION_API = "https://api.notion.com/v1";
const DATA_SOURCE_VERSION = "2025-09-03";
const LEGACY_VERSION = "2022-06-28";

const HOTOVO_VALUES: readonly Hotovo[] = ["Neučeno", "večer", "2 dny", "5 dní", "12 dní", "měsíc"];

// Minimal shapes of the Notion page property values we read.
type NotionProperty =
  | { type: "title"; title: { plain_text: string }[] }
  | { type: "select"; select: { name: string } | null }
  | { type: "date"; date: { start: string } | null }
  | { type: "number"; number: number | null }
  | { type: "url"; url: string | null }
  | { type: string; [key: string]: unknown };

type NotionPage = {
  object: "page";
  id: string;
  url: string;
  in_trash?: boolean;
  archived?: boolean;
  parent?: { type: string; database_id?: string };
  properties: Record<string, NotionProperty>;
};

type QueryResponse = { results: NotionPage[]; has_more: boolean; next_cursor: string | null };

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function notionRequest<T>(token: string, version: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": version,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!res.ok) throw new NotionError(json.message ?? `HTTP ${res.status}`, res.status, json.code);
  return json as T;
}

async function queryAll(token: string, version: string, path: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const res: QueryResponse = await notionRequest<QueryResponse>(token, version, "POST", path, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...res.results.filter((p) => p.object === "page"));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

/**
 * Query a subject's Témata by its database block ID. The internal collection IDs
 * from Notion URLs are not valid API data source IDs (they 404). If the legacy
 * endpoint refuses the database (e.g. it gained a second data source), resolve
 * the real data source ID via the 2025-09-03 API and query that instead.
 */
async function querySubject(token: string, subject: SubjectConfig): Promise<NotionPage[]> {
  try {
    return await queryAll(token, LEGACY_VERSION, `/databases/${subject.databaseId}/query`);
  } catch (err) {
    if (!(err instanceof NotionError && err.status === 400)) throw err;
    const db = await notionRequest<{ data_sources?: { id: string }[] }>(
      token,
      DATA_SOURCE_VERSION,
      "GET",
      `/databases/${subject.databaseId}`,
    );
    const dataSourceId = db.data_sources?.[0]?.id;
    if (!dataSourceId) throw err;
    return queryAll(token, DATA_SOURCE_VERSION, `/data_sources/${dataSourceId}/query`);
  }
}

function prop<T extends NotionProperty["type"]>(page: NotionPage, name: string, type: T) {
  const p = page.properties[name];
  return p && p.type === type ? (p as Extract<NotionProperty, { type: T }>) : undefined;
}

function readTitle(page: NotionPage): string {
  const p = prop(page, PROP.tema, "title") as { title: { plain_text: string }[] } | undefined;
  return p?.title.map((t) => t.plain_text).join("").trim() ?? "";
}

function readSelect(page: NotionPage, name: string): string | null {
  const p = prop(page, name, "select") as { select: { name: string } | null } | undefined;
  return p?.select?.name ?? null;
}

function readDate(page: NotionPage, name: string): string | null {
  const p = prop(page, name, "date") as { date: { start: string } | null } | undefined;
  return toDateOnly(p?.date?.start);
}

function readNumber(page: NotionPage, name: string): number | null {
  const p = prop(page, name, "number") as { number: number | null } | undefined;
  return p?.number ?? null;
}

function readUrl(page: NotionPage, name: string): string | null {
  const p = prop(page, name, "url") as { url: string | null } | undefined;
  return p?.url ?? null;
}

export function pageToTopic(page: NotionPage, subject: SubjectConfig, today: string): Topic {
  const hotovoRaw = readSelect(page, PROP.hotovo);
  const hotovo = HOTOVO_VALUES.includes(hotovoRaw as Hotovo) ? (hotovoRaw as Hotovo) : null;
  return withTermin(
    {
      id: page.id,
      url: page.url,
      subject: subject.code,
      title: readTitle(page) || "(bez názvu)",
      hotovo,
      nauceno: readDate(page, PROP.nauceno),
      posledni: readDate(page, PROP.posledni),
      deadline: readDate(page, PROP.deadline),
      stav: readSelect(page, PROP.stav),
      poradi: readNumber(page, PROP.poradi),
      odkaz: readUrl(page, PROP.odkaz),
    },
    today,
  );
}

export async function fetchAllTopics(token: string, timeZone = DEFAULT_TIME_ZONE): Promise<TopicsResponse> {
  const today = todayIn(timeZone);
  const topics: Topic[] = [];
  const errors: SubjectError[] = [];

  const results = await Promise.allSettled(SUBJECTS.map((s) => querySubject(token, s)));
  results.forEach((result, i) => {
    const subject = SUBJECTS[i];
    if (result.status === "fulfilled") {
      for (const page of result.value) {
        if (page.in_trash || page.archived) continue;
        topics.push(pageToTopic(page, subject, today));
      }
    } else {
      const err = result.reason;
      const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
      errors.push({ subject: subject.code, message: (err instanceof Error ? err.message : String(err)) + cause });
    }
  });

  return { today, timeZone, topics, errors };
}

const normalizeId = (id: string) => id.replace(/-/g, "").toLowerCase();

function subjectOf(page: NotionPage): SubjectConfig | undefined {
  const dbId = page.parent?.database_id;
  return dbId ? SUBJECTS.find((s) => normalizeId(s.databaseId) === normalizeId(dbId)) : undefined;
}

/** Notion property values for a patch. Formulas (Termín) are never written. */
export function patchToProperties(patch: TopicPatch): Record<string, unknown> {
  const date = (start: string) => ({ date: { start } });
  return {
    [PROP.hotovo]: { select: { name: patch.hotovo } },
    [PROP.posledni]: date(patch.posledni),
    ...(patch.nauceno ? { [PROP.nauceno]: date(patch.nauceno) } : {}),
    ...(patch.stav ? { [PROP.stav]: { select: { name: patch.stav } } } : {}),
  };
}

/**
 * Apply a Hotovo / Naučeno dnes action to one topic page. Reads the page first so
 * the step is computed from Notion's current values, not from a stale browser copy,
 * and only pages in the 6 Témata databases can be written.
 */
export async function updateTopic(
  token: string,
  pageId: string,
  action: TopicAction,
  timeZone = DEFAULT_TIME_ZONE,
): Promise<Topic> {
  const today = todayIn(timeZone);
  const page = await notionRequest<NotionPage>(token, LEGACY_VERSION, "GET", `/pages/${pageId}`);
  const subject = subjectOf(page);
  if (!subject || page.in_trash || page.archived) throw new NotionError("Stránka nepatří do žádné databáze Témata", 404);

  const result = applyAction(action, pageToTopic(page, subject, today), today);
  if (!result) throw new NotionError("Tohle téma už nejde posunout, obnov seznam", 409);

  const updated = await notionRequest<NotionPage>(token, LEGACY_VERSION, "PATCH", `/pages/${pageId}`, {
    properties: patchToProperties(result.patch),
  });
  return pageToTopic(updated, subject, today);
}
