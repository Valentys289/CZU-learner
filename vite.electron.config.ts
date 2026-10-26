import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// Bundles electron/main.ts and electron/preload.ts (plus the shared Notion code) into dist-electron/*.cjs.
export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    target: "node22",
    ssr: true,
    minify: false,
    rollupOptions: {
      input: { main: "electron/main.ts", preload: "electron/preload.ts" },
      output: { format: "cjs", entryFileNames: "[name].cjs" },
      // vite is only imported in dev (unpackaged), never inside the built app.
      external: ["electron", "vite", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    },
  },
  ssr: { noExternal: true },
});
