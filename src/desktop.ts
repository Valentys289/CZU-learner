import type { NotifySettings } from "./lib/notify";

/** Fáze 9 A: what main sends with czu:navigate (notification click, tray, Cmd+,). */
export type DesktopSection = "dnes" | "nastaveni";

export type DesktopSettingsInfo = {
  settings: NotifySettings;
  notificationsSupported: boolean;
  /** False when running from a clone (`npm run electron:dev`): login item is not applied there. */
  packaged: boolean;
};

/** Bridge exposed by electron/preload.ts. Undefined in the browser (`npm run dev`). */
export type DesktopBridge = {
  /** Path of an existing .env.local with NOTION_TOKEN that may be imported, or null. */
  envCandidate: () => Promise<string | null>;
  importEnvToken: () => Promise<{ ok: boolean; error?: string }>;
  saveToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
  /** Fáze 9 A: settings in userData/settings.json. */
  getSettings: () => Promise<DesktopSettingsInfo | null>;
  saveSettings: (settings: NotifySettings) => Promise<NotifySettings | null>;
  /** Sends the morning summary now (also triggers the macOS permission prompt the first time). */
  testNotification: () => Promise<{ ok: boolean; error?: string }>;
  openNotificationSettings: () => Promise<void>;
  /** Po termínu + Dnes, for the menu bar line "Dnes: X témat". */
  reportDueCount: (n: number) => void;
  /** Subscribe to navigation from main; returns the unsubscribe function. */
  onNavigate: (cb: (section: DesktopSection) => void) => () => void;
  /**
   * Small UI preferences in userData/prefs.json. The app runs on a random localhost
   * port, so localStorage (per origin) does not survive a restart in the desktop app.
   */
  prefGet: (key: string) => Promise<string | null>;
  prefSet: (key: string, value: string) => Promise<void>;
};

declare global {
  interface Window {
    czuDesktop?: DesktopBridge;
  }
}

export const desktop = (): DesktopBridge | undefined => (typeof window === "undefined" ? undefined : window.czuDesktop);
