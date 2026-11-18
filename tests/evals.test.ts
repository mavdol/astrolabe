import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EVALS_FOLDER = "evals";
const GRADER_TYPES = ["regex", "tool_used", "file_exists", "llm"];

const caseNames = readdirSync(EVALS_FOLDER).filter((name) => existsSync(join(EVALS_FOLDER, name, "prompt.md")));
const read = (...path: string[]) => readFileSync(join(EVALS_FOLDER, ...path), "utf8");

function splitFrontmatter(text: string): { settings: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);

  if (!match) return { settings: {}, body: text };

  const settings = Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]),
  );

  return { settings, body: match[2].trim() };
}

const unquoted = (text: string) => text.replace(/^(['"])(.*)\1$/, "$2");
const gradersOf = (caseName: string) =>
  readdirSync(join(EVALS_FOLDER, caseName, "graders")).map((file) => ({ file, ...splitFrontmatter(read(caseName, "graders", file)) }));

describe("the evaluation cases", () => {
  it("are all there", () => {
    expect(caseNames.length).toBe(22);
  });

  it.each(caseNames)("%s has a request, its run settings and the files it starts from", (caseName) => {
    const { settings, body } = splitFrontmatter(read(caseName, "prompt.md"));
    const caseFile = read(caseName, "case.yaml");
    const scaffoldScript = /scaffold_script: (\S+)/.exec(caseFile)?.[1];

    expect(Object.keys(settings)).toEqual(expect.arrayContaining(["description", "tags", "max_turns", "timeout_seconds", "allowed_tools"]));
    expect(body.length).toBeGreaterThan(40);
    expect(/^name: (\S+)$/m.exec(caseFile)?.[1]).toBe(caseName);
    expect(caseFile).toMatch(/^expected_outcome: \|\n {2}\S/m);
    expect(scaffoldScript && statSync(join(EVALS_FOLDER, caseName, scaffoldScript)).isFile()).toBe(true);
  });

  it.each(caseNames)("%s has graders the runner can load", (caseName) => {
    const graders = gradersOf(caseName);

    expect(graders.length).toBeGreaterThan(0);

    for (const { file, settings, body } of graders) {
      expect(GRADER_TYPES, `${caseName}/${file}`).toContain(settings.type);

      if (settings.type === "llm") {
        expect(body, `${caseName}/${file}`).toMatch(/^PASS if\b/m);
        expect(body, `${caseName}/${file}`).toMatch(/^FAIL if\b/m);
      }

      for (const pattern of [settings.pattern, settings.input_match].filter((text) => text !== undefined)) {
        expect(() => new RegExp(unquoted(pattern), settings.flags), `${caseName}/${file}`).not.toThrow();
      }
    }
  });

  it("give the variables a case needs from the operator's shell as one NAME=value per line", () => {
    const malformed = caseNames
      .filter((caseName) => existsSync(join(EVALS_FOLDER, caseName, "operator.env")))
      .flatMap((caseName) =>
        read(caseName, "operator.env")
          .trimEnd()
          .split("\n")
          .map((line) => `${caseName}: ${line}`),
      )
      .filter((entry) => !/: [A-Z][A-Z0-9_]*=\S+$/.test(entry));

    expect(malformed).toEqual([]);
  });

  it("keep every file they start from in the repository, none of it ignored by git", () => {
    const ignored = spawnSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--", ":(glob)evals/*/files/**"], {
      encoding: "utf8",
    });

    expect(ignored.stdout.split("\n").filter(Boolean)).toEqual([]);
  });

  it("keep a short set for quick checks", () => {
    const quickCases = caseNames.filter((caseName) => /^\[quick\b/.test(splitFrontmatter(read(caseName, "prompt.md")).settings.tags));

    expect(quickCases.length).toBe(4);
  });
});

describe("the triggering test", () => {
  const TRIGGERING_FOLDER = "triggering";
  const triggeringCases = readdirSync(TRIGGERING_FOLDER).filter((name) => existsSync(join(TRIGGERING_FOLDER, name, "prompt.md")));
  const readCase = (...path: string[]) => readFileSync(join(TRIGGERING_FOLDER, ...path), "utf8");
  const expectsTheSkill = (caseName: string) => /\bshould-load\b/.test(splitFrontmatter(readCase(caseName, "prompt.md")).settings.tags);

  it("has requests on both sides: some that should load the skill and near misses that should not", () => {
    expect(triggeringCases.filter(expectsTheSkill).length).toBeGreaterThanOrEqual(10);
    expect(triggeringCases.filter((caseName) => !expectsTheSkill(caseName)).length).toBeGreaterThanOrEqual(8);
  });

  it.each(triggeringCases)("%s checks only whether the skill loads, as its tag says", (caseName) => {
    const { settings, body } = splitFrontmatter(readCase(caseName, "prompt.md"));
    const graders = readdirSync(join(TRIGGERING_FOLDER, caseName, "graders")).map(
      (file) => splitFrontmatter(readCase(caseName, "graders", file)).settings,
    );

    expect(settings.tags).toMatch(/^\[triggering, (should-load|should-not-load)\]$/);
    expect(body.length).toBeGreaterThan(20);
    expect(/^name: (\S+)$/m.exec(readCase(caseName, "case.yaml"))?.[1]).toBe(caseName);
    expect(graders).toEqual([
      expectsTheSkill(caseName)
        ? { type: "tool_used", tool: "Skill", input_match: "astrolabe-benchmark", min: "1", arm: "both" }
        : { type: "tool_used", tool: "Skill", input_match: "astrolabe-benchmark", min: "0", max: "0", arm: "both" },
    ]);
  });
});
