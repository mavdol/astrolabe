import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutputs } from "../src/render/build.js";
import { cardContentOf, MAX_HEADLINES, renderCard } from "../src/render/card.js";
import { exportPlanOf } from "../src/render/exports.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";

const loadBenchmark = (id: string): Benchmark => benchmarkSchema.parse(JSON.parse(readFileSync(`examples/${id}/benchmark.json`, "utf8")));
const context = { generatorVersion: "0.1.0", buildDate: "2026-11-15" };

describe("the README card", () => {
  const runtimes = loadBenchmark("js-runtimes");
  const card = renderCard(runtimes, cardContentOf(runtimes), "light", context);

  it("is a standalone image: no text element, no script, no external resource", () => {
    expect(card.svg).not.toMatch(/<text|<script|<foreignObject|<image|@import|url\(/);

    for (const reference of card.svg.matchAll(/href="([^"]*)"/g)) expect(reference[1]).toMatch(/^#g/);
  });

  it("can be read alone: the question, effects, verdicts, intervals, how to read and the provenance", () => {
    expect(card.textLines).toEqual([
      "Deno against Node.js",
      "Which JavaScript runtime runs our short command-line scripts",
      "faster and with less memory: Node.js or Deno?",
      "Wall time",
      "\u221210%",
      "LIKELY BETTER",
      "Interval \u221212 to \u22129%",
      "Successful attempts only",
      "Peak memory",
      "+1.1%",
      "EQUIVALENT",
      "Interval +1.0 to +1.2%",
      "Successful attempts only",
      "Dot: effect against Node.js. Line: 97.5% interval. Shaded band: the smallest difference that matters.",
      "Wall time: median in s, lower is better, n = 30 per candidate; smallest difference that matters: 10%.",
      "Peak memory: median in MiB, lower is better, n = 30 per candidate; smallest difference that matters: 20%.",
      expect.stringMatching(
        /^results sha256 [0-9a-f]{12} · 2026-11-15 · github\.com\/mavdol\/astrolabe · built with astrolabe-bench 0\.1\.0$/,
      ),
    ]);
  });

  it("carries a text alternative for screen readers and for the README image", () => {
    expect(card.svg).toContain('role="img"');
    expect(card.svg).toContain(`<title id="title">${card.altText}</title>`);
    expect(card.altText).toBe("Deno against Node.js: wall time −10%, likely better; peak memory +1.1%, equivalent.");
  });

  it("fills the badge of a firm verdict and outlines a likely or inconclusive one", () => {
    expect(card.svg).toContain('fill="none" stroke="#5c5c5c"');
    expect(card.svg).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="22" rx="11" fill="#0a0a0a"\/>/);
  });

  it("draws each effect as a dot, its interval as a line and the smallest difference that matters as a band", () => {
    expect(card.svg.match(/<circle /g)).toHaveLength(2);
    expect(card.svg.match(/stroke-dasharray="2 2"/g)).toHaveLength(2);
    expect(card.svg.match(/stroke-width="3" stroke-linecap="round"/g)).toHaveLength(2);
  });

  it("changes only its colours between light and dark", () => {
    const dark = renderCard(runtimes, cardContentOf(runtimes), "dark", context);

    expect(dark.textLines).toEqual(card.textLines);
    expect(dark.svg).not.toBe(card.svg);
    expect(dark.svg).toContain('fill="#0a0a0a"');
  });

  it("is the same bytes for the same results and date", () => {
    expect(renderCard(runtimes, cardContentOf(runtimes), "light", context).svg).toBe(card.svg);
  });
});

describe("what a card shows", () => {
  it("shows at most three primary comparisons by default and says how many it leaves out", () => {
    const usability = loadBenchmark("notes-apps-onboarding");
    const content = cardContentOf(usability);
    const lines = renderCard(usability, content, "light", context).textLines;

    expect(content.headlines).toHaveLength(MAX_HEADLINES);
    expect(content.omittedCount).toBe(1);
    expect(lines).toContain("1 more primary comparison in the full results.");
    expect(lines.join(" ")).toContain("Warning: the candidates did not fail equally often");
    expect(lines.some((line) => line.startsWith("Time on task: median in s, lower is better, n = 58 (Notes A) and 62 (Notes B)"))).toBe(
      true,
    );
  });

  it("never shows a group alone: the best and worst of the groups below it come with it", () => {
    const suite = loadBenchmark("support-assistant-eval");
    const lines = renderCard(suite, cardContentOf(suite), "light", context).textLines;

    expect(lines.join(" ")).toMatch(/From −\S+ points \(Reasoning\) to \+\S+ points \(Coding\)/);
  });

  it("uses the headline blocks an export names, with their titles filled from the results", () => {
    const parsers = loadBenchmark("json-cli-parse");
    const content = cardContentOf(parsers, ["headline-time", "headline-memory"]);
    const lines = renderCard(parsers, content, "light", context).textLines;

    expect(lines).toContain("fastjson: −50% wall time");
    expect(() => cardContentOf(parsers, ["chart-runs"])).toThrow(/headline blocks/);
  });
});

describe("exports", () => {
  it("writes a default README card in both modes when the file declares no export", () => {
    expect(exportPlanOf(loadBenchmark("js-runtimes"))).toEqual({ cards: [{ id: "readme-card", modes: ["light", "dark"] }], skipped: [] });
  });

  it("skips the formats that are not available yet, and says so", () => {
    expect(exportPlanOf(loadBenchmark("geocoding-apis"))).toEqual({
      cards: [],
      skipped: [{ id: "social", reason: "png wide exports are not available yet" }],
    });
  });
});

describe("reference outputs", () => {
  const builtExamples = readdirSync("examples").filter((folder) => {
    try {
      return readdirSync(`examples/${folder}/dist`).length > 0;
    } catch {
      return false;
    }
  });

  it.each(builtExamples)("%s: the committed dist folder is exactly what build writes", (id) => {
    const committedMarkdown = readFileSync(`examples/${id}/dist/benchmark.md`, "utf8");
    const buildDate = /· (\d{4}-\d{2}-\d{2}) ·/.exec(committedMarkdown)![1];
    const generatorVersion = /astrolabe-bench (\S+)<\/sub>/.exec(committedMarkdown)![1];
    const outputFolder = mkdtempSync(join(tmpdir(), "astrolabe-build-"));
    const built = buildOutputs(loadBenchmark(id), ["md", "svg"], outputFolder, { buildDate, generatorVersion });

    for (const file of built.files)
      expect(readFileSync(join(outputFolder, file.path), "utf8"), file.path).toBe(readFileSync(`examples/${id}/dist/${file.path}`, "utf8"));

    const committedExports = (() => {
      try {
        return readdirSync(`examples/${id}/dist/exports`).map((name) => `exports/${name}`);
      } catch {
        return [];
      }
    })();

    expect(built.files.map((file) => file.path).sort()).toEqual(["benchmark.md", ...committedExports].sort());
  });
});
