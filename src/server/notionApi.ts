import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchAllTopics, NotionError, updateTopic } from "../notion/client";
import type { TopicAction } from "../lib/hotovo";
import { DEFAULT_TIME_ZONE } from "../notion/config";

/**
 * Serves GET /api/topics from the Vite dev/preview server so the Notion token
 * stays server-side (the Notion API also does not allow browser CORS calls).
 * POST /api/topics/{pageId}/hotovo and /nauceno write one topic (Fáze 2).
 */
export function notionApi(env: Record<string, string>): Plugin {
  const token = env.NOTION_TOKEN;
  const timeZone = env.TZ || DEFAULT_TIME_ZONE;

  function send(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    // Mounted on /api/topics, so req.url is the rest of the path.
    const path = (req.url ?? "/").split("?")[0];
    const write = /^\/([0-9a-fA-F-]{32,36})\/(hotovo|nauceno)$/.exec(path);
    const isRead = path === "/" || path === "";

    if (!(isRead && req.method === "GET") && !(write && req.method === "POST")) {
      return send(res, isRead || write ? 405 : 404, { error: "Neplatný požadavek" });
    }
    if (!token) return send(res, 500, { error: "Chybí NOTION_TOKEN v .env" });

    try {
      if (write) {
        const topic = await updateTopic(token, write[1], write[2] as TopicAction, timeZone);
        return send(res, 200, { topic });
      }
      send(res, 200, await fetchAllTopics(token, timeZone));
    } catch (err) {
      send(res, err instanceof NotionError && err.status < 500 ? err.status : 502, { error: errorMessage(err, Boolean(write)) });
    }
  }
  return {
    name: "notion-api",
    configureServer(server) {
      server.middlewares.use("/api/topics", (req, res) => void handler(req, res));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/topics", (req, res) => void handler(req, res));
    },
  };
}

function errorMessage(err: unknown, write: boolean): string {
  if (write && err instanceof NotionError && err.status === 403) {
    return "Integrace nemá oprávnění Update content. Zapni ho v Notionu u připojení ČZU Study Dashboard.";
  }
  return err instanceof Error ? err.message : String(err);
}
