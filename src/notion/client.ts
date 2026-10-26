// Server-side only: runs inside the Vite dev/preview server, never in the browser.
import { DEFAULT_TIME_ZONE, PROP, SUBJECTS, type SubjectConfig } from "./config";
import { toDateOnly, todayIn, withTermin } from "../lib/termin";
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

async function notionPost(token: string, version: string, path: string, body: unknown): Promise<QueryResponse> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": version,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
  if (!res.ok) throw new NotionError(json.message ?? `HTTP ${res.status}`, res.status, json.code);
  return json as QueryResponse;
}

async function queryAll(token: string, version: string, path: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  do {
    const res: QueryResponse = await notionPost(token, version, path, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...res.results.filter((p) => p.object === "page"));
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages;
}

/** Query a subject's Témata. Prefers the data source endpoint, falls back to legacy databases.query. */
async function querySubject(token: string, subject: SubjectConfig): Promise<NotionPage[]> {
  try {
    return await queryAll(token, DATA_SOURCE_VERSION, `/data_sources/${subject.dataSourceId}/query`);
  } catch (err) {
    if (err instanceof NotionError && (err.status === 400 || err.status === 404)) {
      return queryAll(token, LEGACY_VERSION, `/databases/${subject.databaseId}/query`);
    }
    throw err;
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
