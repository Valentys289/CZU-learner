/** Pure helpers for the desktop app's update check (electron/update.ts). */

function parts(v: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? m.slice(1).map(Number) : null;
}

/** True when `latest` (a release tag like "v0.6.0") is newer than `current` ("0.5.0"). */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export type ReleaseAsset = { name: string; browser_download_url: string };

/** The .dmg for this Mac's architecture, else any .dmg. */
export function pickDmgAsset(assets: ReleaseAsset[], arch: string): ReleaseAsset | null {
  const dmgs = assets.filter((a) => a.name.toLowerCase().endsWith(".dmg"));
  return dmgs.find((a) => a.name.includes(arch)) ?? dmgs[0] ?? null;
}

/** The .zip for this Mac's architecture (the in-place update payload), else any mac .zip. */
export function pickZipAsset(assets: ReleaseAsset[], arch: string): ReleaseAsset | null {
  const zips = assets.filter((a) => a.name.toLowerCase().endsWith(".zip"));
  return zips.find((a) => a.name.includes(arch)) ?? zips[0] ?? null;
}

/** "v0.7.0" → "0.7.0". */
export function versionOf(tag: string): string {
  return tag.trim().replace(/^v/, "");
}

/**
 * The .app bundle the running app lives in, from process.execPath
 * (…/X.app/Contents/MacOS/X). null when not inside a bundle (dev, Linux).
 */
export function appBundlePath(execPath: string): string | null {
  const m = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath);
  return m ? m[1] : null;
}

/**
 * Why the app cannot replace itself, or null when it can. Running straight from
 * the mounted .dmg or from macOS App Translocation (a quarantined app opened
 * outside Applications) gives a read-only or temporary path.
 */
export function selfUpdateBlocker(bundle: string | null): string | null {
  if (!bundle) return "Aplikace neběží ze složky .app.";
  if (bundle.startsWith("/Volumes/")) return "Aplikace běží přímo z instalačního .dmg. Přetáhni ji nejdřív do Applications.";
  if (bundle.includes("/AppTranslocation/")) {
    return "macOS spustil aplikaci z dočasné kopie. Přesuň ji do Applications a spusť znovu odtamtud.";
  }
  return null;
}

/**
 * Shell script run detached after the app quits: waits for the old process to
 * exit, swaps the bundle (keeping the old one until the new one is in place,
 * and putting it back if the swap fails), then starts the app again.
 * Arguments: $1 pid, $2 installed .app, $3 new .app.
 */
export const SWAP_SCRIPT = `#!/bin/sh
PID="$1"; OLD="$2"; NEW="$3"; BACKUP="$OLD.previous"
i=0
while kill -0 "$PID" 2>/dev/null && [ $i -lt 300 ]; do sleep 0.2; i=$((i+1)); done
rm -rf "$BACKUP"
if mv "$OLD" "$BACKUP"; then
  if mv "$NEW" "$OLD"; then
    rm -rf "$BACKUP"
  else
    mv "$BACKUP" "$OLD"
  fi
fi
open "$OLD"
`;

export type ReleaseInfo = { tag_name: string; html_url: string; draft?: boolean; prerelease?: boolean; assets: ReleaseAsset[] };

/**
 * The newest published release, with the assets of every release that carries
 * the same tag merged in. electron-builder sometimes creates two releases for
 * one tag (the .dmg and the .zip upload race), and GitHub's "latest" can then
 * point at the one that holds only a .blockmap.
 */
export function newestRelease(releases: ReleaseInfo[]): ReleaseInfo | null {
  const published = releases.filter((r) => !r.draft && !r.prerelease && parts(r.tag_name));
  let best: ReleaseInfo | null = null;
  for (const r of published) if (!best || isNewerVersion(r.tag_name, versionOf(best.tag_name))) best = r;
  if (!best) return null;
  const tag = best.tag_name;
  const same = published.filter((r) => r.tag_name === tag);
  const seen = new Set<string>();
  const assets = same.flatMap((r) => r.assets).filter((a) => !seen.has(a.name) && seen.add(a.name));
  const withFiles = same.find((r) => r.assets.some((a) => /\.(dmg|zip)$/i.test(a.name))) ?? best;
  return { ...withFiles, assets };
}
