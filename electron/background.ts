// Fáze 9 A: running in the background. A menu bar icon (Tray), the Nastavení
// settings in userData/settings.json, and the morning / evening notifications
// (macOS Notification Center). All local: the data comes from the app's own
// /api/topics server (same Notion client as the window); when Notion cannot be
// reached the last good copy in userData/notify-cache.json is used.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, powerMonitor, shell, Tray, type IpcMainInvokeEvent } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Topic, TopicsResponse } from "../src/types";
import { DEFAULT_TIME_ZONE } from "../src/notion/config";
import { todayIn, withTermin } from "../src/lib/termin";
import { dueCounts } from "../src/lib/phase";
import {
  buildEveningText,
  buildMorningText,
  leftToday,
  localClock,
  parseSentLog,
  parseSettings,
  shouldFire,
  trayLabel,
  type NotifyKind,
  type NotifySettings,
  type SentLog,
} from "../src/lib/notify";
import { TRAY_ICON_1X, TRAY_ICON_2X } from "./trayIcon";

/** Where macOS lists the app's notification permission (System Settings › Notifications). */
const NOTIFICATION_PREFS = "x-apple.systempreferences:com.apple.preference.notifications";
const TICK_MS = 60_000;
/** The tray count refreshes from Notion this often while the app runs (the window also reports its own count). */
const TRAY_REFRESH_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;

export type Section = "dnes" | "nastaveni";

type Deps = {
  /** Local server origin, e.g. http://127.0.0.1:51234 (set once the server runs). */
  origin: () => string;
  /** Shows (or recreates) the main window and focuses it. */
  showWindow: () => BrowserWindow;
  isOurs: (event: IpcMainInvokeEvent) => boolean;
  isDev: boolean;
};

const file = (name: string) => join(app.getPath("userData"), name);

function readJson(name: string): unknown {
  try {
    return existsSync(file(name)) ? JSON.parse(readFileSync(file(name), "utf8")) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(name: string, value: unknown) {
  try {
    writeFileSync(file(name), JSON.stringify(value, null, 2));
  } catch {
    // A failed write only means a reminder may repeat or the cache is older; never crash.
  }
}

// ---------- settings ----------

let settings: NotifySettings = parseSettings(undefined);

export function loadSettings(): NotifySettings {
  const stored = readJson("settings.json");
  settings = parseSettings(stored);
  // First run: store the defaults so the file shows what is set.
  if (stored === undefined) writeJson("settings.json", settings);
  return settings;
}

function applyLoginItem(isDev: boolean) {
  // In dev this would register the bare Electron binary as a login item.
  if (isDev) return;
  try {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
  } catch {
    // Not fatal: the setting is stored and applied on the next launch.
  }
}

/** True when macOS started the app at login: then it stays in the menu bar without opening a window. */
export function openedAtLogin(): boolean {
  try {
    return process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin === true;
  } catch {
    return false;
  }
}

// ---------- data ----------

type Cache = { savedAt: string; timeZone: string; topics: Topic[] };

/** Fresh topics from the local server; on any failure the last cached ones. Null only with no cache at all. */
async function loadTopics(origin: string): Promise<{ today: string; topics: Topic[]; fromCache: boolean } | null> {
  try {
    if (!origin) throw new Error("server not ready");
    const res = await fetch(`${origin}/api/topics`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as TopicsResponse;
    writeJson("notify-cache.json", { savedAt: new Date().toISOString(), timeZone: data.timeZone, topics: data.topics } satisfies Cache);
    return { today: data.today, topics: data.topics, fromCache: false };
  } catch {
    const cache = readJson("notify-cache.json") as Cache | undefined;
    if (!cache || !Array.isArray(cache.topics)) return null;
    // Termín / dueState were computed for the day of the fetch: recompute them for today.
    const today = todayIn(cache.timeZone || DEFAULT_TIME_ZONE);
    return { today, topics: cache.topics.map((t) => withTermin(t, today)), fromCache: true };
  }
}

// ---------- tray ----------

let tray: Tray | null = null;
let trayDue: number | null = null;

function trayImage() {
  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 1, dataURL: TRAY_ICON_1X });
  img.addRepresentation({ scaleFactor: 2, dataURL: TRAY_ICON_2X });
  img.setTemplateImage(true);
  return img;
}

function updateTray(deps: Deps) {
  if (!tray) return;
  tray.setToolTip(`ČZU Study Dashboard · ${trayLabel(trayDue)}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Otevřít", click: () => void deps.showWindow() },
      { label: trayLabel(trayDue), click: () => navigate(deps, "dnes") },
      { type: "separator" },
      { label: "Nastavení…", click: () => navigate(deps, "nastaveni") },
      { type: "separator" },
      { label: "Ukončit", click: () => app.quit() },
    ]),
  );
}

function setTrayDue(deps: Deps, due: number) {
  if (due === trayDue) return;
  trayDue = due;
  updateTray(deps);
}

async function refreshTray(deps: Deps) {
  const data = await loadTopics(deps.origin());
  if (!data) return;
  const c = dueCounts(data.topics, data.today);
  setTrayDue(deps, c.overdue + c.today);
}

// ---------- navigation ----------

/** Show the window and switch the renderer to a section (IPC czu:navigate). */
export function navigate(deps: Deps, section: Section) {
  const win = deps.showWindow();
  const send = () => win.webContents.send("czu:navigate", section);
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

// ---------- notifications ----------

/** Keep a reference until the notification is gone, or its click handler may be garbage collected. */
const live = new Set<Notification>();

function notify(deps: Deps, title: string, body: string) {
  const n = new Notification({ title, body, silent: false });
  live.add(n);
  n.on("click", () => {
    live.delete(n);
    navigate(deps, "dnes");
  });
  n.on("close", () => live.delete(n));
  n.show();
}

const TITLES: Record<NotifyKind, string> = { morning: "Dnešní plán", evening: "Večerní připomínka" };

/** Builds and shows one reminder. "no-data": nothing fetched and no cache (the next tick tries again later). */
async function fire(deps: Deps, kind: NotifyKind): Promise<"sent" | "no-data" | "unsupported"> {
  if (!Notification.isSupported()) return "unsupported";
  const data = await loadTopics(deps.origin());
  if (!data) return "no-data";
  const c = dueCounts(data.topics, data.today);
  setTrayDue(deps, c.overdue + c.today);
  const body =
    kind === "morning" ? buildMorningText(c) : buildEveningText(leftToday(data.topics, data.today).map((t) => t.title));
  notify(deps, TITLES[kind], body);
  return "sent";
}

let sent: SentLog = {};
let ticking = false;
/** After a failed attempt (no data, no cache) wait this long instead of asking Notion every minute. */
const RETRY_MS = 10 * 60_000;
let retryAt = 0;

async function tick(deps: Deps) {
  if (ticking || !Notification.isSupported() || Date.now() < retryAt) return;
  ticking = true;
  try {
    for (const kind of ["morning", "evening"] as const) {
      const now = localClock(DEFAULT_TIME_ZONE);
      if (!shouldFire(kind, now, sent, settings)) continue;
      if ((await fire(deps, kind)) === "sent") {
        sent = { ...sent, [kind]: now.date };
        writeJson("notify-state.json", { lastSent: sent });
      } else {
        retryAt = Date.now() + RETRY_MS;
        return;
      }
    }
  } finally {
    ticking = false;
  }
}

// ---------- setup ----------

/** Call once in app.whenReady(), after the local server started. */
export function startBackground(deps: Deps) {
  loadSettings();
  applyLoginItem(deps.isDev);
  sent = parseSentLog((readJson("notify-state.json") as { lastSent?: unknown } | undefined)?.lastSent);

  tray = new Tray(trayImage());
  updateTray(deps);
  tray.on("click", () => tray?.popUpContextMenu());

  setTimeout(() => void refreshTray(deps), 15_000);
  setInterval(() => void refreshTray(deps), TRAY_REFRESH_MS);

  // Every minute, plus right after wake-up (a missed morning is caught up until 12:00).
  setInterval(() => void tick(deps), TICK_MS);
  powerMonitor.on("resume", () => setTimeout(() => void tick(deps), 5_000));
  setTimeout(() => void tick(deps), 10_000);

  ipcMain.handle("czu:getSettings", (event) =>
    deps.isOurs(event) ? { settings, notificationsSupported: Notification.isSupported(), packaged: !deps.isDev } : null,
  );
  ipcMain.handle("czu:saveSettings", (event, raw: unknown) => {
    if (!deps.isOurs(event)) return null;
    settings = parseSettings(raw);
    writeJson("settings.json", settings);
    retryAt = 0;
    applyLoginItem(deps.isDev);
    // A time moved to "now" or earlier today goes out at the next tick, not a minute later.
    void tick(deps);
    return settings;
  });
  ipcMain.handle("czu:testNotification", async (event) => {
    if (!deps.isOurs(event)) return { ok: false };
    const result = await fire(deps, "morning");
    if (result === "sent") return { ok: true };
    return { ok: false, error: result === "unsupported" ? "Notifikace tady nejsou podporované." : "Data z Notionu nejsou k dispozici." };
  });
  ipcMain.handle("czu:openNotificationSettings", (event) => {
    if (deps.isOurs(event)) void shell.openExternal(NOTIFICATION_PREFS);
  });
  ipcMain.on("czu:dueCount", (event, n: unknown) => {
    if (event.senderFrame?.url.startsWith(`${deps.origin()}/`) && Number.isInteger(n) && (n as number) >= 0) setTrayDue(deps, n as number);
  });
}
