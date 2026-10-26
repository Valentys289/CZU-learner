// Desktop shell (Fáze 4). Runs a local server on 127.0.0.1 that serves the built
// UI and the same /api/topics routes as `npm run dev`, so the React app and the
// Notion client stay unchanged. The token never reaches the renderer.
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell, type IpcMainInvokeEvent } from "electron";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { API_PREFIX, createApiHandler } from "../src/server/notionApi";
import { MILNIKY } from "../src/notion/config";
import { checkForUpdates } from "./update";

const APP_TITLE = "ČZU Study Dashboard";
const isDev = !app.isPackaged;
const appRoot = app.getAppPath();
const distDir = join(appRoot, "dist");
const tokenFile = () => join(app.getPath("userData"), "notion-token.bin");

// ---------- token ----------

let cachedToken: string | undefined;

function envValue(path: string, key: string): string | undefined {
  try {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*["']?([^\\s"'#]+)`, "m").exec(readFileSync(path, "utf8"));
    return m?.[1];
  } catch {
    return undefined;
  }
}

const tokenFromEnvFile = (path: string) => envValue(path, "NOTION_TOKEN");

/** Dev only: NOTION_MILNIKY_DB from the clone's .env.local, to try a Milníky DB before its ID is in config. */
function milnikyOverride(): string | null {
  if (!isDev) return null;
  for (const name of [".env.local", ".env"]) {
    const v = envValue(join(appRoot, name), "NOTION_MILNIKY_DB");
    if (v) return v;
  }
  return null;
}

/** The only .env files we ever look at: the clone we run from (dev) and ~/CZU-learner. */
function envCandidates(): string[] {
  const paths = [join(homedir(), "CZU-learner", ".env.local")];
  if (isDev) paths.unshift(join(appRoot, ".env.local"), join(appRoot, ".env"));
  return paths.filter((p) => existsSync(p) && tokenFromEnvFile(p));
}

function readStoredToken(): string | undefined {
  try {
    if (!existsSync(tokenFile()) || !safeStorage.isEncryptionAvailable()) return undefined;
    return safeStorage.decryptString(readFileSync(tokenFile()));
  } catch {
    return undefined;
  }
}

/** Stored (encrypted) token first; when running from a clone, fall back to its .env.local. */
function getToken(): string | undefined {
  cachedToken ??= readStoredToken();
  if (cachedToken) return cachedToken;
  if (isDev) {
    const local = envCandidates().find((p) => p.startsWith(appRoot));
    return local ? tokenFromEnvFile(local) : undefined;
  }
  return undefined;
}

function saveToken(token: string): { ok: boolean; error?: string } {
  if (!/^(ntn_|secret_)[A-Za-z0-9]{20,}$/.test(token)) return { ok: false, error: "Tohle nevypadá jako Notion token (ntn_...)." };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: "Šifrované úložiště není dostupné." };
  writeFileSync(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
  cachedToken = token;
  return { ok: true };
}

function forgetToken() {
  rmSync(tokenFile(), { force: true });
  cachedToken = undefined;
}

// ---------- local server ----------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

async function serveStatic(urlPath: string, res: ServerResponse) {
  const rel = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^([/\\])+/, "");
  let file = join(distDir, rel);
  if (!file.startsWith(distDir + sep) || !existsSync(file) || extname(file) === "") file = join(distDir, "index.html");
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

async function startServer(): Promise<{ server: Server; origin: string }> {
  const api = createApiHandler(getToken, undefined, milnikyOverride() ?? MILNIKY.databaseId);
  let origin = "";
  let vite: { middlewares: (req: IncomingMessage, res: ServerResponse, next: () => void) => void } | undefined;

  const server = createServer((req, res) => {
    // Only this app talks to the server: reject other Host headers (DNS rebinding).
    if (req.headers.host !== new URL(origin).host) {
      res.statusCode = 403;
      return res.end();
    }
    const url = req.url ?? "/";
    if (url === API_PREFIX || url.startsWith(`${API_PREFIX}/`) || url.startsWith(`${API_PREFIX}?`)) {
      return void api(req, res, url.slice(API_PREFIX.length) || "/");
    }
    if (vite) return vite.middlewares(req, res, () => void serveStatic(url, res));
    void serveStatic(url, res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  origin = `http://127.0.0.1:${port}`;

  if (isDev) {
    // Dev: Vite in middleware mode on the same server, with HMR. Not bundled into the .app.
    const { createServer: createVite } = await import("vite");
    vite = await createVite({
      root: appRoot,
      configFile: join(appRoot, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
  }
  return { server, origin };
}

// ---------- window ----------

let mainWindow: BrowserWindow | null = null;
let origin = "";

function isOurs(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame?.url.startsWith(`${origin}/`) ?? false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    title: APP_TITLE,
    backgroundColor: "#f6f5f2",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Notion and plan links open in the default browser, never inside the app.
  const openOutside = (url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${origin}/`)) {
      event.preventDefault();
      openOutside(url);
    }
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, description) => {
    if (code === -3) return; // aborted by a reload
    void mainWindow?.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="font-family:system-ui;padding:24px"><h3>Aplikaci se nepodařilo načíst</h3><p>${description}</p></body>`,
      )}`,
    );
  });

  void mainWindow.loadURL(`${origin}/`);
  mainWindow.on("closed", () => (mainWindow = null));
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { label: "Zkontrolovat aktualizace…", click: () => void checkForUpdates(mainWindow, false) },
        { type: "separator" },
        {
          label: "Změnit Notion token…",
          click: async () => {
            const { response } = await dialog.showMessageBox({
              type: "question",
              buttons: ["Změnit", "Zrušit"],
              defaultId: 0,
              cancelId: 1,
              message: "Smazat uložený Notion token a vložit nový?",
            });
            if (response !== 0) return;
            forgetToken();
            mainWindow?.reload();
          },
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Zobrazení",
      submenu: [{ role: "reload", label: "Obnovit" }, ...(isDev ? [{ role: "toggleDevTools" } as const] : []), { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("czu:envCandidate", (event) => (isOurs(event) ? envCandidates()[0] ?? null : null));
ipcMain.handle("czu:importEnvToken", (event) => {
  if (!isOurs(event)) return { ok: false };
  const path = envCandidates()[0];
  const token = path ? tokenFromEnvFile(path) : undefined;
  return token ? saveToken(token) : { ok: false, error: "Soubor s tokenem nenalezen." };
});
ipcMain.handle("czu:saveToken", (event, token: unknown) =>
  isOurs(event) && typeof token === "string" ? saveToken(token.trim()) : { ok: false },
);

app.setName(APP_TITLE);

app.whenReady().then(async () => {
  try {
    ({ origin } = await startServer());
  } catch (err) {
    dialog.showErrorBox(APP_TITLE, `Lokální server se nespustil: ${err instanceof Error ? err.message : String(err)}`);
    app.quit();
    return;
  }
  buildMenu();
  createWindow();
  // Quiet check on launch; only speaks up when a newer release exists.
  if (!isDev) setTimeout(() => void checkForUpdates(mainWindow, true), 5000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
