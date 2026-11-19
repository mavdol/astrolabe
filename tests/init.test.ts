import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_PLUGIN, installSkill, PACKAGED_SKILL_FOLDER, SKILL_NAME } from "../src/init/install-skill.js";

const emptyFolder = () => mkdtempSync(join(tmpdir(), "astrolabe-init-"));
const packagedFiles = readdirSync(PACKAGED_SKILL_FOLDER, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());

describe("installing the skill", () => {
  it("copies every file of the packaged skill, byte for byte", () => {
    const skillsFolder = emptyFolder();
    const installation = installSkill(skillsFolder);

    expect(installation.state).toBe("installed");
    expect(installation.folder).toBe(join(skillsFolder, SKILL_NAME));
    expect(installation.filesWritten).toHaveLength(packagedFiles.length);
    expect(installation.filesWritten).toContain("measurement/time.md");

    for (const file of installation.filesWritten)
      expect(readFileSync(join(installation.folder, file))).toEqual(readFileSync(join(PACKAGED_SKILL_FOLDER, file)));
  });

  it("writes nothing over a copy that is already current", () => {
    const skillsFolder = emptyFolder();

    installSkill(skillsFolder);

    expect(installSkill(skillsFolder)).toMatchObject({ state: "already current", filesWritten: [], filesThatDiffer: [] });
  });

  it("keeps a copy that was changed, and names the files", () => {
    const skillsFolder = emptyFolder();
    const { folder } = installSkill(skillsFolder);

    appendFileSync(join(folder, "statistics.md"), "\nA note of ours.\n");

    expect(installSkill(skillsFolder)).toMatchObject({ state: "kept", filesWritten: [], filesThatDiffer: ["statistics.md"] });
    expect(readFileSync(join(folder, "statistics.md"), "utf8")).toContain("A note of ours.");
  });

  it("replaces changed files when asked, and leaves the files it does not know", () => {
    const skillsFolder = emptyFolder();
    const { folder } = installSkill(skillsFolder);

    appendFileSync(join(folder, "statistics.md"), "\nA note of ours.\n");
    writeFileSync(join(folder, "our-domain.md"), "Notes of the team.\n");

    const installation = installSkill(skillsFolder, { replaceChangedFiles: true });

    expect(installation).toMatchObject({ state: "updated", filesWritten: ["statistics.md"], filesOnlyInDestination: ["our-domain.md"] });
    expect(readFileSync(join(folder, "statistics.md"), "utf8")).not.toContain("A note of ours.");
    expect(existsSync(join(folder, "our-domain.md"))).toBe(true);
  });

  it("says so when the package holds no skill", () => {
    expect(() => installSkill(emptyFolder(), { packagedSkillFolder: emptyFolder() })).toThrow(/the skill is missing/);
  });
});

describe("astrolabe init", () => {
  const cliPath = resolve("src/cli/index.ts");
  const tsxPath = resolve("node_modules/tsx/dist/loader.mjs");
  const runInit = (project: string, ...options: string[]) =>
    spawnSync(process.execPath, ["--import", tsxPath, cliPath, "init", ...options], { cwd: project, encoding: "utf8", timeout: 60_000 });

  it("installs under .agents/skills of the current folder and says what to do next", () => {
    const project = emptyFolder();
    const init = runInit(project);

    expect(init.status).toBe(0);
    expect(init.stdout).toContain(`in ${join(".agents", "skills", SKILL_NAME)}`);
    expect(init.stdout).toContain("astrolabe-bench");
    expect(init.stdout).toContain(`claude plugin install ${CLAUDE_CODE_PLUGIN.name} --marketplace ${CLAUDE_CODE_PLUGIN.marketplace}`);
    expect(existsSync(join(project, ".agents", "skills", SKILL_NAME, "SKILL.md"))).toBe(true);
  });

  it("installs into the skills folder given, and refuses to overwrite a changed copy without --force", () => {
    const project = emptyFolder();
    const skillFile = join(project, "tools", "skills", SKILL_NAME, "SKILL.md");

    expect(runInit(project, "--dir", join("tools", "skills")).status).toBe(0);
    appendFileSync(skillFile, "\nChanged.\n");

    const refused = runInit(project, "--dir", join("tools", "skills"));

    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("SKILL.md");
    expect(refused.stderr).toContain("astrolabe init --force");
    expect(readFileSync(skillFile, "utf8")).toContain("Changed.");

    expect(runInit(project, "--dir", join("tools", "skills"), "--force").status).toBe(0);
    expect(readFileSync(skillFile, "utf8")).not.toContain("Changed.");
  });
});
