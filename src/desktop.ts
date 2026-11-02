/** Bridge exposed by electron/preload.ts. Undefined in the browser (`npm run dev`). */
export type DesktopBridge = {
  /** Path of an existing .env.local with NOTION_TOKEN that may be imported, or null. */
  envCandidate: () => Promise<string | null>;
  importEnvToken: () => Promise<{ ok: boolean; error?: string }>;
  saveToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
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
