import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "astrolabe-benchmark";

/** The Claude Code plugin that holds the skill, and the GitHub repository that serves as its marketplace. */
export const CLAUDE_CODE_PLUGIN = { name: "astrolabe", marketplace: "mavdol/astrolabe" };

/** Where agents that follow the Agent Skills format look for the skills of a project. */
export const SHARED_SKILLS_FOLDER = join(".agents", "skills");

/** The skill shipped with this package: two folders up from this file, in the sources and in the built package alike. */
export const PACKAGED_SKILL_FOLDER = fileURLToPath(new URL(`../../plugin/skills/${SKILL_NAME}`, import.meta.url));

export interface SkillInstallation {
  folder: string;
  state: "installed" | "updated" | "already current" | "kept";
  filesWritten: string[];
  /** Files of an existing copy that are not those of the packaged skill: changed since, or absent. */
  filesThatDiffer: string[];
  /** Files in the destination that the packaged skill does not have. */
  filesOnlyInDestination: string[];
}

function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];

  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

/**
 * Copies the packaged skill into a skills folder. A copy that was changed since it was installed
 * is left alone unless the caller asks to replace it; files the package does not have are never removed.
 */
export function installSkill(
  skillsFolder: string,
  options: { replaceChangedFiles?: boolean; packagedSkillFolder?: string } = {},
): SkillInstallation {
  const source = options.packagedSkillFolder ?? PACKAGED_SKILL_FOLDER;
  const folder = join(skillsFolder, SKILL_NAME);
  const packagedFiles = filesUnder(source);

  if (packagedFiles.length === 0) throw new Error(`the skill is missing from this installation of astrolabe (looked in ${source})`);

  const installedFiles = new Set(filesUnder(folder));
  const sameContent = (file: string) => readFileSync(join(source, file)).equals(readFileSync(join(folder, file)));
  const filesThatDiffer = packagedFiles.filter((file) => !installedFiles.has(file) || !sameContent(file));
  const filesOnlyInDestination = [...installedFiles].filter((file) => !packagedFiles.includes(file));
  const isFirstInstallation = installedFiles.size === 0;
  const found = { folder, filesThatDiffer: isFirstInstallation ? [] : filesThatDiffer, filesOnlyInDestination };

  if (filesThatDiffer.length === 0) return { ...found, state: "already current", filesWritten: [] };

  if (!isFirstInstallation && !options.replaceChangedFiles) return { ...found, state: "kept", filesWritten: [] };

  for (const file of filesThatDiffer) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), readFileSync(join(source, file)));
  }

  return { ...found, state: isFirstInstallation ? "installed" : "updated", filesWritten: filesThatDiffer };
}
