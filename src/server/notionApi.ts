import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchAllTopics } from "../notion/client";
import { DEFAULT_TIME_ZONE } from "../notion/config";

/**
 * Serves GET /api/topics from the Vite dev/preview server so the Notion token
 * stays server-side (the Notion API also does not allow browser CORS calls).
 */
export function notionApi(env: Record<string, string>): Plugin {
  const token = env.NOTION_TOKEN;
  const timeZone = env.TZ || DEFAULT_TIME_ZONE;

  async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Chybí NOTION_TOKEN v .env" }));
      return;
    }
    try {
      res.end(JSON.stringify(await fetchAllTopics(token, timeZone)));
    } catch (err) {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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
