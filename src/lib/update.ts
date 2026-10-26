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
