import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_PLUGIN, SKILL_NAME } from "../src/init/install-skill.js";

const SKILL_ENTRY = `skills/${SKILL_NAME}/SKILL.md`;
const FILES_THAT_NAME_THE_VERSION = ["package.json", ".claude-plugin/plugin.json", SKILL_ENTRY];

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const packageManifest = readJson("package.json");
const pluginManifest = readJson(".claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json");

function versionsNamedIn(folder: string) {
  const skillEntry = readFileSync(join(folder, SKILL_ENTRY), "utf8");

  return {
    package: readJson(join(folder, "package.json")).version,
    plugin: readJson(join(folder, ".claude-plugin/plugin.json")).version,
    skillCompatibility: /^compatibility: .*version (\S+) or later/m.exec(skillEntry)?.[1],
    skillWrittenFor: /This skill is written for astrolabe (\S+) or later\./.exec(skillEntry)?.[1],
  };
}

function setVersionInACopy(version: string) {
  const folder = mkdtempSync(join(tmpdir(), "astrolabe-version-"));

  for (const file of FILES_THAT_NAME_THE_VERSION) cpSync(file, join(folder, file));

  const run = spawnSync(
    process.execPath,
    ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("scripts/set-version.ts"), version],
    {
      cwd: folder,
      encoding: "utf8",
    },
  );

  return { folder, run };
}

const sameVersionEverywhere = (version: string) => ({
  package: version,
  plugin: version,
  skillCompatibility: version,
  skillWrittenFor: version,
});

describe("the release", () => {
  it("gives the package, the plugin and the version the skill asks for the same number", () => {
    expect(versionsNamedIn(".")).toEqual(sameVersionEverywhere(packageManifest.version));
  });

  it("sets that number everywhere with pnpm set-version, and refuses one that is not a version", () => {
    const released = setVersionInACopy("1.2.3");
    const refused = setVersionInACopy("v1.2");

    expect(released.run.status, released.run.stderr).toBe(0);
    expect(versionsNamedIn(released.folder)).toEqual(sameVersionEverywhere("1.2.3"));
    expect(refused.run.status).toBe(2);
    expect(versionsNamedIn(refused.folder)).toEqual(versionsNamedIn("."));
  });

  it("lists the plugin in this repository's marketplace, under the name and address astrolabe init prints", () => {
    const repository = /github\.com\/([^/]+\/[^/.]+)/.exec(packageManifest.repository.url)?.[1];

    expect(CLAUDE_CODE_PLUGIN.marketplace).toBe(repository);
    expect(pluginManifest.name).toBe(CLAUDE_CODE_PLUGIN.name);
    expect(pluginManifest.repository).toBe(packageManifest.homepage);
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: pluginManifest.name, source: { source: "npm", package: packageManifest.name } }),
    ]);
    expect(marketplace.plugins[0].version).toBeUndefined();
    expect(marketplace.plugins[0].description).toBe(pluginManifest.description);
  });

  it("publishes the plugin inside the npm package, with only the astrolabe skill in it", () => {
    expect(packageManifest.files).toEqual(expect.arrayContaining(["skills", ".claude-plugin/plugin.json"]));
    expect(readdirSync("skills")).toEqual([SKILL_NAME]);
  });
});
