/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { notionApi } from "./src/server/notionApi";

export default defineConfig(({ mode }) => {
  // Empty prefix loads all .env vars for the server plugin only; nothing here is exposed to the client.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), notionApi(env)],
    server: { host: true },
    test: { environment: "node" },
  };
});
