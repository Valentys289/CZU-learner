import { describe, expect, it } from "vitest";
import { appBundlePath, isNewerVersion, newestRelease, pickDmgAsset, pickZipAsset, selfUpdateBlocker, versionOf } from "./update";

describe("isNewerVersion", () => {
  it.each([
    ["v0.6.0", "0.5.0", true],
    ["v0.5.1", "0.5.0", true],
    ["v1.0.0", "0.9.9", true],
    ["v0.5.0", "0.5.0", false],
    ["v0.4.9", "0.5.0", false],
    ["0.10.0", "0.9.0", true],
    ["nightly", "0.5.0", false],
  ])("%s vs %s -> %s", (latest, current, expected) => {
    expect(isNewerVersion(latest, current)).toBe(expected);
  });
});

describe("pickDmgAsset", () => {
  const a = (name: string) => ({ name, browser_download_url: `https://x/${name}` });

  it("prefers the dmg for this architecture", () => {
    const assets = [a("latest-mac.yml"), a("CZU-0.6.0-x64.dmg"), a("CZU-0.6.0-arm64.dmg"), a("CZU-0.6.0-arm64-mac.zip")];
    expect(pickDmgAsset(assets, "arm64")?.name).toBe("CZU-0.6.0-arm64.dmg");
  });

  it("falls back to any dmg, or null", () => {
    expect(pickDmgAsset([a("CZU-0.6.0.dmg")], "arm64")?.name).toBe("CZU-0.6.0.dmg");
    expect(pickDmgAsset([a("CZU-0.6.0-arm64-mac.zip")], "arm64")).toBeNull();
  });
});

describe("in-place update helpers", () => {
  const a = (name: string) => ({ name, browser_download_url: `https://x/${name}` });

  it("pickZipAsset prefers this architecture's zip", () => {
    const assets = [a("CZU Study Dashboard-0.7.0-arm64.dmg"), a("CZU Study Dashboard-0.7.0-x64-mac.zip"), a("CZU Study Dashboard-0.7.0-arm64-mac.zip"), a("latest-mac.yml")];
    expect(pickZipAsset(assets, "arm64")?.name).toBe("CZU Study Dashboard-0.7.0-arm64-mac.zip");
    expect(pickZipAsset([a("x.dmg")], "arm64")).toBeNull();
  });

  it("versionOf strips the tag prefix", () => {
    expect(versionOf("v0.7.0")).toBe("0.7.0");
    expect(versionOf("0.7.0")).toBe("0.7.0");
  });

  it("appBundlePath finds the .app around the executable", () => {
    expect(appBundlePath("/Applications/CZU Study Dashboard.app/Contents/MacOS/CZU Study Dashboard")).toBe(
      "/Applications/CZU Study Dashboard.app",
    );
    expect(appBundlePath("/home/x/node_modules/electron/dist/electron")).toBeNull();
  });

  it("selfUpdateBlocker refuses the mounted dmg and App Translocation", () => {
    expect(selfUpdateBlocker("/Applications/CZU Study Dashboard.app")).toBeNull();
    expect(selfUpdateBlocker("/Users/h/Desktop/CZU Study Dashboard.app")).toBeNull();
    expect(selfUpdateBlocker("/Volumes/CZU Study Dashboard 0.6.0/CZU Study Dashboard.app")).toMatch(/dmg/);
    expect(selfUpdateBlocker("/private/var/folders/ab/T/AppTranslocation/123/d/CZU Study Dashboard.app")).toMatch(/Applications/);
    expect(selfUpdateBlocker(null)).not.toBeNull();
  });
});

describe("newestRelease", () => {
  const a = (name: string) => ({ name, browser_download_url: `https://x/${name}` });
  const r = (id: string, tag: string, names: string[], extra: object = {}) => ({ tag_name: tag, html_url: `https://gh/${id}`, assets: names.map(a), ...extra });

  it("merges the assets of duplicate releases for the newest tag (the v0.6.0 race)", () => {
    const res = newestRelease([
      r("b", "v0.6.0", ["CZU-Study-Dashboard-0.6.0-arm64.dmg.blockmap"]),
      r("a", "v0.6.0", ["CZU-Study-Dashboard-0.6.0-arm64-mac.zip", "CZU-Study-Dashboard-0.6.0-arm64.dmg", "latest-mac.yml"]),
      r("c", "v0.5.0", ["CZU-Study-Dashboard-0.5.0-arm64-mac.zip"]),
    ])!;
    expect(res.tag_name).toBe("v0.6.0");
    expect(res.html_url).toBe("https://gh/a");
    expect(res.assets.map((x) => x.name).sort()).toEqual([
      "CZU-Study-Dashboard-0.6.0-arm64-mac.zip",
      "CZU-Study-Dashboard-0.6.0-arm64.dmg",
      "CZU-Study-Dashboard-0.6.0-arm64.dmg.blockmap",
      "latest-mac.yml",
    ]);
    expect(pickZipAsset(res.assets, "arm64")?.name).toBe("CZU-Study-Dashboard-0.6.0-arm64-mac.zip");
  });

  it("ignores drafts and prereleases; null when nothing is published", () => {
    expect(newestRelease([r("d", "v0.7.0", ["x.zip"], { draft: true }), r("p", "v0.8.0", ["y.zip"], { prerelease: true }), r("a", "v0.6.0", ["z.zip"])])?.tag_name).toBe("v0.6.0");
    expect(newestRelease([])).toBeNull();
  });
});
