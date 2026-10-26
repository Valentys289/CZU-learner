import { describe, expect, it } from "vitest";
import { isNewerVersion, pickDmgAsset } from "./update";

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
