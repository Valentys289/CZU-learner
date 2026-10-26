import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchAllTopics, NotionError, undoTopic, updateTopic } from "../notion/client";
import { parseWriteProps, type TopicAction } from "../lib/hotovo";
import { DEFAULT_TIME_ZONE, MILNIKY } from "../notion/config";

export const API_PREFIX = "/api/topics";
const MAX_BODY = 16 * 1024;

/** Error code the UI uses to offer the token form (desktop app). */
export const NO_TOKEN = "no-token";
export const BAD_TOKEN = "bad-token";

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error("Příliš velký požadavek"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        reject(new Error("Neplatný JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * The /api/topics routes, shared by the Vite dev/preview server and the desktop
 * app's local server. The Notion token stays server-side (the Notion API also
 * does not allow browser CORS calls).
 *
 *   GET  /api/topics                      all topics
 *   POST /api/topics/{pageId}/hotovo      Fáze 2 write
 *   POST /api/topics/{pageId}/nauceno     Fáze 2 write
 *   POST /api/topics/{pageId}/undo        { previous, written }: revert the last write
 *
 * `subpath` is the part after /api/topics.
 */
export function createApiHandler(
  getToken: () => string | undefined,
  timeZone = DEFAULT_TIME_ZONE,
  milnikyDatabaseId: string | null = MILNIKY.databaseId,
) {
  function send(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, subpath: string) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const path = subpath.split("?")[0];
    const write = /^\/([0-9a-fA-F-]{32,36})\/(hotovo|nauceno|undo)$/.exec(path);
    const isRead = path === "/" || path === "";

    if (!(isRead && req.method === "GET") && !(write && req.method === "POST")) {
      return send(res, isRead || write ? 405 : 404, { error: "Neplatný požadavek" });
    }
    const token = getToken();
    if (!token) return send(res, 500, { error: "Chybí NOTION_TOKEN", code: NO_TOKEN });

    try {
      if (write && write[2] === "undo") {
        const body = (await readJson(req)) as { previous?: unknown; written?: unknown } | null;
        const previous = parseWriteProps(body?.previous);
        const written = parseWriteProps(body?.written);
        if (!previous || !written) return send(res, 400, { error: "Neplatná data pro vrácení" });
        return send(res, 200, { topic: await undoTopic(token, write[1], previous, written, timeZone) });
      }
      if (write) {
        const { topic, previous, written } = await updateTopic(token, write[1], write[2] as TopicAction, timeZone);
        return send(res, 200, { topic, undo: { previous, written } });
      }
      send(res, 200, await fetchAllTopics(token, timeZone, milnikyDatabaseId));
    } catch (err) {
      send(res, err instanceof NotionError && err.status < 500 ? err.status : 502, {
        error: errorMessage(err, Boolean(write)),
        ...(err instanceof NotionError && err.status === 401 ? { code: BAD_TOKEN } : {}),
      });
    }
  };
}

/** Vite plugin: serves the API from `npm run dev` / `npm run preview` with the token from .env(.local). */
export function notionApi(env: Record<string, string>): Plugin {
  const handle = createApiHandler(
    () => env.NOTION_TOKEN,
    env.TZ || DEFAULT_TIME_ZONE,
    env.NOTION_MILNIKY_DB || MILNIKY.databaseId,
  );
  const mount = (server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void } }) =>
  {
    // Block body on purpose: a function returned from configureServer would be run as a post hook.
    server.middlewares.use(API_PREFIX, (req, res) => void handle(req, res, req.url ?? "/"));
  };

  return {
    name: "notion-api",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

function errorMessage(err: unknown, write: boolean): string {
  if (write && err instanceof NotionError && err.status === 403) {
    return "Integrace nemá oprávnění Update content. Zapni ho v Notionu u připojení ČZU Study Dashboard.";
  }
  if (err instanceof NotionError && err.status === 401) {
    return "Notion token je neplatný nebo zrušený. Vlož nový.";
  }
  if (err instanceof Error && /fetch failed/i.test(err.message)) {
    return "Notion není dostupný. Zkontroluj připojení k internetu.";
  }
  return err instanceof Error ? err.message : String(err);
}
