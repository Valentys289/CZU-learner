// Update check for the desktop app (Fáze 5b). The app is not Apple-signed, so
// Squirrel.Mac / electron-updater cannot install updates in place. Instead the
// app checks GitHub Releases, downloads the new .dmg to Downloads and opens it;
// Honza drags the app over the old one in Applications.
import { app, BrowserWindow, dialog, net, shell } from "electron";
import { join } from "node:path";
import { isNewerVersion, pickDmgAsset, type ReleaseAsset } from "../src/lib/update";

/** Where releases are published (keep in sync with "build.publish" in package.json). */
export const RELEASES = { owner: "Valentys289", repo: "CZU-learner" };
const RELEASES_PAGE = `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases/latest`;

type Release = { tag_name: string; html_url: string; assets: ReleaseAsset[] };

async function latestRelease(): Promise<Release | null> {
  const res = await net.fetch(LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
  // 404: no release yet, or the repo is private (the API needs a login for that).
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub odpověděl ${res.status}`);
  return (await res.json()) as Release;
}

function download(win: BrowserWindow, asset: ReleaseAsset) {
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
          "Ukonči aplikaci (Cmd+Q), v otevřeném okně přetáhni CZU Study Dashboard do Applications a potvrď Nahradit. " +
          "Pak ji znovu spusť. Kdyby ji macOS nechtěl otevřít: Nastavení, Soukromí a zabezpečení, Přesto otevřít.",
      });
    });
  });
  win.webContents.downloadURL(asset.browser_download_url);
}

/** silent: on launch, says nothing unless there is a new version. */
export async function checkForUpdates(win: BrowserWindow | null, silent: boolean) {
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

  const asset = pickDmgAsset(release.assets, process.arch);
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Stáhnout", "Později"],
    defaultId: 0,
    cancelId: 1,
    message: `Je dostupná verze ${release.tag_name.replace(/^v/, "")} (máš ${current}).`,
    detail: asset ? "Stáhnu nový .dmg do složky Stažené soubory a otevřu ho." : "Vydání nemá .dmg, otevřu stránku vydání.",
  });
  if (response !== 0) return;
  if (asset && win) download(win, asset);
  else void shell.openExternal(release.html_url);
}
