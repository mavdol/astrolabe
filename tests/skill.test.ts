import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRaw } from "../src/compute/compute.js";
import { allRules, rule } from "../src/rules/registry.js";
import { resultsSchema } from "../src/schema/benchmark.js";
import { validate } from "../src/validate/validate.js";

const SKILL_FOLDER = "skills/astrolabe-benchmark";
const ENTRY_FILE = "SKILL.md";

/** Files of the web page phase: rules point to them, and they are written with the page. */
const FILES_WRITTEN_WITH_THE_PAGE = ["visualization/charts.md", "visualization/style.md", "visualization/page.md", "deploy.md"];

const filesUnder = (folder: string): string[] =>
  readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);

    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

const skillFiles = filesUnder(SKILL_FOLDER).map((path) => relative(SKILL_FOLDER, path));
const markdownFiles = skillFiles.filter((file) => file.endsWith(".md"));
const textOf = (file: string) => readFileSync(join(SKILL_FOLDER, file), "utf8");
const linkedFilesOf = (file: string) =>
  [...textOf(file).matchAll(/\]\(([^)#]+)\)/g)].map((match) => match[1]).filter((target) => !/^[a-z]+:/.test(target));

function frontmatterOf(file: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(textOf(file))?.[1] ?? "";

  return Object.fromEntries(block.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
}

/** Text an agent would run or copy: fenced blocks and inline code. */
function codeOf(file: string): string[] {
  const text = textOf(file);
  const fenced = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1]);
  const inline = [...text.replace(/```[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);

  return [...fenced, ...inline];
}

const jsonSnippetsOf = (file: string) => [...textOf(file).matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1].trim());

describe("the skill folder", () => {
  it("is named after its folder and describes itself within the length agents keep", () => {
    const { name, description } = frontmatterOf(ENTRY_FILE);

    expect(name).toBe("astrolabe-benchmark");
    expect(description.length).toBeGreaterThan(100);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it("keeps its entry file short enough to be read whole", () => {
    expect(textOf(ENTRY_FILE).split("\n").length).toBeLessThan(500);
  });

  it("links every other file from the entry file, and only from there", () => {
    const linkedFromEntry = linkedFilesOf(ENTRY_FILE);

    expect(linkedFromEntry.filter((target) => !existsSync(join(SKILL_FOLDER, target)))).toEqual([]);
    expect(skillFiles.filter((file) => file !== ENTRY_FILE && !linkedFromEntry.includes(file))).toEqual([]);

    for (const file of markdownFiles.filter((name) => name !== ENTRY_FILE)) expect(linkedFilesOf(file), file).toEqual([]);
  });

  it("starts every long reference file with its contents", () => {
    const longFilesWithoutContents = markdownFiles
      .filter((file) => file !== ENTRY_FILE && textOf(file).split("\n").length > 100)
      .filter((file) => !/^## Contents$/m.test(textOf(file).split("\n").slice(0, 12).join("\n")));

    expect(longFilesWithoutContents).toEqual([]);
  });
});

describe("the rules in the skill", () => {
  const rulesExplainedIn = (file: string) => allRules().filter((entry) => entry.explained_in === file);

  it("has every file a rule points to, apart from those of the web page", () => {
    const filesRulesPointTo = [...new Set(allRules().map((entry) => entry.explained_in))];
    const missing = filesRulesPointTo.filter((file) => !existsSync(join(SKILL_FOLDER, file)));

    expect(missing.sort()).toEqual([...FILES_WRITTEN_WITH_THE_PAGE].sort());
  });

  it("gives each rule, in the file that explains it, the same level and words as astrolabe explain", () => {
    const differing: string[] = [];

    for (const file of markdownFiles) {
      const text = textOf(file);

      for (const entry of rulesExplainedIn(file)) {
        const level = entry.level === "must" ? "Must" : "Should";

        if (!text.includes(`| ${entry.id} | ${level} | ${entry.text} |`)) differing.push(`${entry.id} in ${file}`);
      }
    }

    expect(differing).toEqual([]);
  });

  it("mentions no rule that does not exist", () => {
    const unknown = markdownFiles.flatMap((file) =>
      [...textOf(file).matchAll(/(?<![A-Za-z0-9-])([A-Z]\d{1,2})(?![A-Za-z0-9])/g)]
        .map((match) => match[1])
        .filter((id) => rule(id) === undefined)
        .map((id) => `${id} in ${file}`),
    );

    expect(unknown).toEqual([]);
  });
});

describe("the commands in the skill", () => {
  const help = spawnSync(process.execPath, ["--import", "tsx", "src/cli/index.ts", "--help"], { encoding: "utf8" }).stdout;
  const knownCommands = new Set([...help.matchAll(/^ {2}astrolabe (\w+)/gm)].map((match) => match[1]));
  const knownOptions = new Set([...[...help.matchAll(/--[a-z-]+/g)].map((match) => match[0]), "--help", "--version"]);

  it("reads the list of commands from the help text", () => {
    expect(knownCommands).toContain("validate");
    expect(knownOptions).toContain("--raw");
  });

  it("names only commands and options the command has", () => {
    const unknown: string[] = [];

    for (const file of markdownFiles) {
      for (const code of codeOf(file)) {
        for (const line of code.split("\n")) {
          const invocation = /(?:^|\s)astrolabe((?: +[^\s|#]+)*)/.exec(line)?.[1].trim();

          if (invocation === undefined || invocation === "") continue;

          const [firstWord, ...otherWords] = invocation.split(/ +/);

          if (/^[a-z]+$/.test(firstWord) && !knownCommands.has(firstWord)) unknown.push(`astrolabe ${firstWord} in ${file}`);

          for (const word of [firstWord, ...otherWords]) {
            if (word.startsWith("--") && !knownOptions.has(word.split("=")[0])) unknown.push(`${word} in ${file}`);
          }
        }
      }
    }

    expect(unknown).toEqual([]);
  });
});

describe("the JSON shown in the skill", () => {
  const examplePlan = JSON.parse(textOf("example.benchmark.json"));

  it("has an example plan that validate accepts without a warning", () => {
    expect(validate(examplePlan, {}).issues).toEqual([]);
  });

  it("explains every section of the example plan, and only sections it has", () => {
    const explained = Object.keys(examplePlan.notes)
      .filter((key) => key.startsWith("results."))
      .map((key) => key.slice("results.".length));

    expect(explained.filter((section) => !(section in examplePlan.results))).toEqual([]);
    expect(Object.keys(examplePlan.results).filter((section) => !explained.includes(section) && section !== "composite")).toEqual([]);
  });

  it("shows only sections, metrics and raw rows that the format accepts", () => {
    const sectionSchemas = resultsSchema.shape;
    const candidateFieldSchemas = sectionSchemas.candidates.element.shape;
    const refused: string[] = [];

    for (const file of markdownFiles) {
      for (const snippet of jsonSnippetsOf(file)) {
        const where = `${file}: ${snippet.slice(0, 50)}`;
        const isRawRows = snippet.split("\n").every((line) => line.startsWith('{"candidate"'));

        if (isRawRows) {
          try {
            parseRaw("snippet", snippet);
          } catch (failure) {
            refused.push(`${where}: ${(failure as Error).message}`);
          }

          continue;
        }

        const parsed: Record<string, unknown> = JSON.parse(snippet.startsWith("{") ? snippet : `{${snippet}}`);

        if ("kind" in parsed && "statistic" in parsed) {
          if (!sectionSchemas.metrics.element.safeParse(parsed).success) refused.push(where);

          continue;
        }

        for (const [section, content] of Object.entries(parsed)) {
          const schema =
            section in sectionSchemas
              ? sectionSchemas[section as keyof typeof sectionSchemas]
              : candidateFieldSchemas[section as keyof typeof candidateFieldSchemas];
          const outcome = schema?.safeParse(content);

          if (!outcome?.success) refused.push(where);
        }
      }
    }

    expect(refused).toEqual([]);
  });
});
