import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_PLUGIN, SKILL_NAME } from "../src/init/install-skill.js";

const PLUGIN_FOLDER = "plugin";
const PLUGIN_MANIFEST = `${PLUGIN_FOLDER}/.claude-plugin/plugin.json`;
const SKILL_ENTRY = `${PLUGIN_FOLDER}/skills/${SKILL_NAME}/SKILL.md`;
const MARKETPLACE = ".claude-plugin/marketplace.json";
const FILES_THAT_NAME_THE_VERSION = ["package.json", PLUGIN_MANIFEST, MARKETPLACE, SKILL_ENTRY];

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const packageManifest = readJson("package.json");
const pluginManifest = readJson(PLUGIN_MANIFEST);
const marketplace = readJson(MARKETPLACE);

function versionsNamedIn(folder: string) {
  const skillEntry = readFileSync(join(folder, SKILL_ENTRY), "utf8");

  return {
    package: readJson(join(folder, "package.json")).version,
    plugin: readJson(join(folder, PLUGIN_MANIFEST)).version,
    marketplaceTag: readJson(join(folder, MARKETPLACE)).plugins[0].source.ref,
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
  marketplaceTag: `v${version}`,
  skillCompatibility: version,
  skillWrittenFor: version,
});

describe("the release", () => {
  it("gives the package, the plugin, the release the marketplace installs and the version the skill asks for the same number", () => {
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
      expect.objectContaining({
        name: pluginManifest.name,
        source: { source: "git-subdir", url: repository, path: PLUGIN_FOLDER, ref: `v${packageManifest.version}` },
      }),
    ]);
    expect(marketplace.plugins[0].version).toBeUndefined();
    expect(marketplace.plugins[0].description).toBe(pluginManifest.description);
  });

  it("ships in the npm package only the skill, for astrolabe init", () => {
    expect(packageManifest.files.filter((file: string) => file.startsWith(PLUGIN_FOLDER))).toEqual([`${PLUGIN_FOLDER}/skills`]);
  });

  it("keeps the plugin folder to what the plugin directory accepts from any publisher", () => {
    const files = readdirSync(PLUGIN_FOLDER, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
    const acceptedKinds = /\.(md|json|png)$|\/LICENSE$/;

    expect(readdirSync(join(PLUGIN_FOLDER, "skills"))).toEqual([SKILL_NAME]);
    expect(files.filter((file) => !acceptedKinds.test(file))).toEqual([]);
    expect(files.filter((file) => readFileSync(file, "utf8").startsWith("#!"))).toEqual([]);
    expect(readFileSync(join(PLUGIN_FOLDER, "LICENSE"), "utf8")).toBe(readFileSync("LICENSE", "utf8"));
    expect(pluginManifest.author?.name).toBeTruthy();
  });

  it("points npx skills add at the skill in the plugin folder", () => {
    expect(readJson("skills.sh.json").paths).toEqual([`./${PLUGIN_FOLDER}/skills`]);
  });
});
