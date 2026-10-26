// Update check for the desktop app. The app is not Apple-signed, so Squirrel.Mac /
// electron-updater cannot install updates in place. Instead the app installs the
// update itself: it downloads the release's .zip, unpacks it next to the temp
// files, checks it is this app, quits, and a small script swaps the .app in
// Applications and starts it again. No Finder, no .dmg, no second download.
// If the app cannot replace itself (running from the .dmg, translocated), it
// falls back to downloading the .dmg like before.
import { app, BrowserWindow, dialog, net, shell } from "electron";
import { execFile, spawn } from "node:child_process";
import { accessSync, constants, createWriteStream, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import {
  appBundlePath,
  isNewerVersion,
  newestRelease,
  pickDmgAsset,
  pickZipAsset,
  selfUpdateBlocker,
  SWAP_SCRIPT,
  versionOf,
  type ReleaseAsset,
  type ReleaseInfo,
} from "../src/lib/update";

const run = promisify(execFile);

/** Where releases are published (keep in sync with "build.publish" in package.json). */
export const RELEASES = { owner: "Valentys289", repo: "CZU-learner" };
const RELEASES_PAGE = `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/latest`;
const RELEASES_API = `https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases?per_page=20`;

/** Must match "build.appId": a downloaded bundle with another ID is never installed. */
const APP_ID = "cz.honza.czu-study-dashboard";

type Release = ReleaseInfo;

let busy = false;

async function latestRelease(): Promise<Release | null> {
  const res = await net.fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  // 404: the repo is private (the API needs a login for that).
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub odpověděl ${res.status}`);
  return newestRelease((await res.json()) as Release[]);
}

/** Download to a file, showing progress on the Dock icon. */
async function downloadTo(win: BrowserWindow | null, url: string, file: string) {
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error(`Stažení selhalo (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  let done = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  body.on("data", (chunk: Buffer) => {
    done += chunk.length;
    if (total && win && !win.isDestroyed()) win.setProgressBar(done / total);
  });
  try {
    await pipeline(body, createWriteStream(file));
  } finally {
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
  }
}

async function plistValue(bundle: string, key: string): Promise<string> {
  const { stdout } = await run("/usr/bin/plutil", ["-extract", key, "raw", join(bundle, "Contents", "Info.plist")]);
  return stdout.trim();
}

/**
 * Download + unpack the update, check it, then quit and let the swap script
 * replace `installed` and relaunch. Throws (with a Czech message) before
 * touching the installed app if anything does not fit.
 */
async function installInPlace(win: BrowserWindow | null, release: Release, zip: ReleaseAsset, installed: string) {
  const work = mkdtempSync(join(app.getPath("temp"), "czu-update-"));
  try {
    const zipFile = join(work, "update.zip");
    await downloadTo(win, zip.browser_download_url, zipFile);

    const unpacked = join(work, "app");
    // ditto keeps the bundle's symlinks, permissions and signature intact (unzip does not).
    await run("/usr/bin/ditto", ["-x", "-k", zipFile, unpacked]);
    const name = readdirSync(unpacked).find((f) => f.endsWith(".app"));
    if (!name) throw new Error("V balíčku aktualizace není aplikace.");
    const fresh = join(unpacked, name);

    if ((await plistValue(fresh, "CFBundleIdentifier")) !== APP_ID) throw new Error("Balíček aktualizace není tahle aplikace.");
    const version = await plistValue(fresh, "CFBundleShortVersionString");
    if (version !== versionOf(release.tag_name)) {
      throw new Error(`Balíček má verzi ${version}, čekal jsem ${versionOf(release.tag_name)}.`);
    }
    // The app downloaded it itself, but strip a quarantine flag just in case so Gatekeeper does not block the relaunch.
    await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", fresh]).catch(() => undefined);

    const script = join(work, "swap.sh");
    writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 });
    spawn("/bin/sh", [script, String(process.pid), installed, fresh], { detached: true, stdio: "ignore" }).unref();
  } catch (err) {
    rmSync(work, { recursive: true, force: true });
    throw err;
  }
  app.quit();
}

/** Fallback when the app cannot replace itself: the .dmg goes to Downloads and opens. */
function downloadDmg(win: BrowserWindow, asset: ReleaseAsset, reason: string) {
  const session = win.webContents.session;
  session.once("will-download", (_event, item) => {
    item.setSavePath(join(app.getPath("downloads"), asset.name));
    item.once("done", (_e, state) => {
      if (state !== "completed") {
        void dialog.showMessageBox(win, { type: "error", message: "Stažení aktualizace se nepovedlo.", detail: `Stav: ${state}` });
        return;
      }
      void shell.openPath(item.getSavePath());
      void dialog.showMessageBox(win, {
        type: "info",
        message: "Nová verze je stažená a otevřená.",
        detail:
          `${reason} Ukonči aplikaci (Cmd+Q), v otevřeném okně přetáhni CZU Study Dashboard do Applications a potvrď Nahradit. ` +
          "Další aktualizace už proběhnou samy.",
      });
    });
  });
  win.webContents.downloadURL(asset.browser_download_url);
}

/** silent: on launch, says nothing unless there is a new version. */
export async function checkForUpdates(win: BrowserWindow | null, silent: boolean) {
  if (busy) return;
  let release: Release | null;
  try {
    release = await latestRelease();
  } catch (err) {
    if (!silent) {
      void dialog.showMessageBox({
        type: "warning",
        message: "Aktualizace se nepodařilo zkontrolovat.",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (!release) {
    if (silent) return;
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Otevřít v prohlížeči", "Zavřít"],
      defaultId: 0,
      cancelId: 1,
      message: "Vydání se nepodařilo načíst přímo z aplikace.",
      detail: "Repo je soukromé nebo zatím nemá žádné vydání. Stránku vydání otevřu v prohlížeči, kde jsi přihlášený na GitHub.",
    });
    if (response === 0) void shell.openExternal(RELEASES_PAGE);
    return;
  }

  const current = app.getVersion();
  if (!isNewerVersion(release.tag_name, current)) {
    if (!silent) void dialog.showMessageBox({ type: "info", message: `Máš nejnovější verzi (${current}).` });
    return;
  }

  const installed = appBundlePath(process.execPath);
  let blocker = selfUpdateBlocker(installed);
  if (!blocker && installed) {
    try {
      accessSync(dirname(installed), constants.W_OK);
    } catch {
      blocker = "Do složky s aplikací nejde zapisovat.";
    }
  }
  const zip = pickZipAsset(release.assets, process.arch);
  if (!blocker && !zip) blocker = "Vydání nemá balíček pro aktualizaci (.zip).";
  const inPlace = !blocker && installed && zip;

  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Aktualizovat", "Později"],
    defaultId: 0,
    cancelId: 1,
    message: `Je dostupná verze ${versionOf(release.tag_name)} (máš ${current}).`,
    detail: inPlace
      ? "Stáhnu ji, aplikace se na chvíli zavře a sama se znovu spustí v nové verzi."
      : `${blocker} Stáhnu nový .dmg do Stažených souborů.`,
  });
  if (response !== 0) return;

  if (inPlace) {
    busy = true;
    try {
      await installInPlace(win, release, zip, installed);
    } catch (err) {
      busy = false;
      void dialog.showMessageBox({
        type: "error",
        message: "Aktualizace se nepovedla, aplikace zůstává ve verzi " + current + ".",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  const dmg = pickDmgAsset(release.assets, process.arch);
  if (dmg && win) downloadDmg(win, dmg, blocker ?? "");
  else void shell.openExternal(release.html_url);
}
