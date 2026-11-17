import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutputs } from "../src/render/build.js";
import { cardContentOf, MAX_HEADLINES, renderCard, STYLE } from "../src/render/card.js";
import { exportPlanOf, pictureHtml } from "../src/render/exports.js";
import { pngOf } from "../src/render/png.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";
import { decodePng, shareOfDifferentPixels } from "./png.js";

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
      "Wall time · lower is better",
      "\u221210%",
      "LIKELY BETTER",
      "better \u2192",
      "+10%  0  \u221210%",
      "Interval \u221212 to \u22129%",
      "Median, n = 30 each",
      "Successful attempts only",
      "Peak memory · lower is better",
      "+1.1%",
      "EQUIVALENT",
      "better \u2192",
      "+20%  0  \u221220%",
      "Interval +1.0 to +1.2%",
      "Median, n = 30 each",
      "Successful attempts only",
      "Effects against Node.js, with their 95% intervals, adjusted for 2 comparisons. Shaded band: too small to matter.",
      expect.stringMatching(/^github\.com\/mavdol\/astrolabe · results [0-9a-f]{12} · 2026-11-15 · Built with Astrolabe$/),
    ]);
  });

  it("carries a text alternative for screen readers and for the README image", () => {
    expect(card.svg).toContain('role="img"');
    expect(card.svg).toContain(`<title id="title">${card.altText}</title>`);
    expect(card.altText).toBe(
      "Deno against Node.js: wall time (lower is better) −10%, likely better; peak memory (lower is better) +1.1%, equivalent.",
    );
  });

  it("fills the badge of a firm verdict and outlines a likely or inconclusive one", () => {
    expect(card.svg).toContain('fill="none" stroke="#5c5c5c"');
    expect(card.svg).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="22" rx="11" fill="#0a0a0a"\/>/);
  });

  it("draws each effect as a dot, its interval as a capped line and the smallest difference that matters as a band", () => {
    expect(card.svg.match(/<circle /g)).toHaveLength(2);
    expect(card.svg.match(/stroke-dasharray="2 2"/g)).toHaveLength(2);
    expect(card.svg.match(/stroke-width="2.5" stroke-linecap="round"/g)).toHaveLength(2);
  });

  it("changes only its colours between light and dark", () => {
    const dark = renderCard(runtimes, cardContentOf(runtimes), "dark", context);

    expect(dark.textLines).toEqual(card.textLines);
    expect(dark.svg).not.toBe(card.svg);
    expect(dark.svg).toContain('fill="#0a0a0a"');
  });

  it("draws no text below 12 px", () => {
    expect(Math.min(...Object.values(STYLE).map((style) => style.size))).toBeGreaterThanOrEqual(12);
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
    expect(lines.join(" ")).toContain("1 more primary comparison in the full results.");
    expect(lines.join(" ")).toContain("Median, n = 62 (Notes B), 58 (Notes A)");
  });

  it("never shows a group alone: the best and worst of the groups below it come with it", () => {
    const suite = loadBenchmark("support-assistant-eval");
    const lines = renderCard(suite, cardContentOf(suite), "light", context).textLines;

    expect(lines.join(" ")).toContain("From −1.5 to +14 points across categories");
  });

  it("uses the headline blocks an export names, with their titles filled from the results", () => {
    const parsers = loadBenchmark("json-cli-parse");
    const content = cardContentOf(parsers, ["headline-time", "headline-memory"]);
    const lines = renderCard(parsers, content, "light", context).textLines;

    expect(content.headlines.map((headline) => headline.comparison.id)).toEqual(["wall_time__fastjson", "peak_rss__fastjson"]);
    expect(lines).toContain("Wall time · lower is better");
    expect(() => cardContentOf(parsers, ["chart-runs"])).toThrow(/headline blocks/);
  });
});

describe("reading a card at a glance", () => {
  const parsers = loadBenchmark("json-cli-parse");
  const parsersCard = renderCard(parsers, cardContentOf(parsers, ["headline-time", "headline-memory"]), "light", context);

  it("shows the direction of a verdict inside its badge: a check for better, a cross for worse", () => {
    const icons = [...parsersCard.svg.matchAll(/<path d="([^"]+)" fill="none" stroke="#ffffff" stroke-width="1.8"/g)].map(
      (match) => match[1],
    );

    expect(icons).toHaveLength(2);
    expect(icons[0].split(/[ML]/).filter(Boolean)).toHaveLength(3);
    expect(icons[1].match(/M/g)).toHaveLength(2);
  });

  it("never cuts the axis, even when the interval lies far beyond the band", () => {
    const horizontalRules = parsersCard.svg.match(/H[\d.]+" stroke="#e5e5e5"/g);

    expect(horizontalRules, "one unbroken baseline per strip, plus the rule above the footer").toHaveLength(3);
    expect(parsersCard.textLines).toContain("+10%  0  \u221210%");
  });

  it("leaves out a block title that only restates the metric and the effect", () => {
    expect(parsersCard.textLines).not.toContain("fastjson: \u221250% wall time");
  });

  it("keeps a block title that adds information", () => {
    const usability = loadBenchmark("notes-apps-onboarding");
    const content = cardContentOf(usability, ["headline-sus", "headline-features"]);
    const lines = renderCard(usability, content, "light", context).textLines;

    expect(lines.join(" ")).toContain("Notes B lacks offline editing");
    expect(lines).not.toContain("SUS score: inconclusive (+2 points)");
  });

  it("names the metric alone when it is measured on the whole benchmark", () => {
    const suite = loadBenchmark("support-assistant-eval");
    const lines = renderCard(suite, cardContentOf(suite), "light", context).textLines;

    expect(lines).toContain("Accuracy · higher is better");
    expect(lines.join(" ")).toContain("Accuracy, Coding");
    expect(lines.join(" ")).not.toContain("Support assistant eval");
  });

  it("puts the warning about failures in ink with an icon", () => {
    const usability = structuredClone(loadBenchmark("notes-apps-onboarding"));

    usability.results.comparisons!.find((comparison) => comparison.id === "time__tasks__notes_b")!.failure_warning = true;

    const card = renderCard(usability, cardContentOf(usability), "light", context);

    expect(card.textLines.join(" ")).toContain("The candidates did not fail equally often");
    expect(card.svg).toContain('stroke="#0a0a0a" stroke-width="1.4" stroke-linejoin="round"');
  });
});

describe("exports", () => {
  const files = { svg: { light: "a-light.svg", dark: "a-dark.svg" }, png: "a-light.png" };

  it("shows the SVG that matches the reader's setting, and the PNG where SVG files are not shown", () => {
    expect(pictureHtml("alt", files)).toBe(
      [
        "<picture>",
        '  <source media="(prefers-color-scheme: light)" srcset="a-light.svg">',
        '  <source media="(prefers-color-scheme: dark)" srcset="a-dark.svg">',
        '  <img alt="alt" src="a-light.png">',
        "</picture>",
      ].join("\n"),
    );
    expect(pictureHtml("alt", { svg: { dark: "a-dark.svg" }, png: "a-dark.png" })).toContain('<source srcset="a-dark.svg">');
  });

  it("links the README card to the full results", () => {
    const html = pictureHtml("alt", files, "benchmarks/x/dist/benchmark.md");

    expect(html.startsWith('<a href="benchmarks/x/dist/benchmark.md">\n<picture>')).toBe(true);
    expect(html.endsWith("</picture>\n</a>")).toBe(true);
  });

  it("renders the PNG at twice the card's size, with the same picture", () => {
    const runtimes = loadBenchmark("js-runtimes");
    const svg = renderCard(runtimes, cardContentOf(runtimes), "light", context).svg;
    const png = decodePng(pngOf(svg));
    const svgWidth = Number(/width="(\d+)"/.exec(svg)![1]);
    const svgHeight = Number(/height="(\d+)"/.exec(svg)![1]);

    expect([png.width, png.height]).toEqual([2 * svgWidth, 2 * svgHeight]);
    expect(png.pixels.subarray(0, 4)).toEqual(Buffer.from([0, 0, 0, 0]));
    expect(shareOfDifferentPixels(png, decodePng(pngOf(svg)))).toBe(0);
  });

  it("writes a default README card in both modes when the file declares no export", () => {
    expect(exportPlanOf(loadBenchmark("js-runtimes"))).toEqual({
      cards: [{ id: "readme-card", modes: ["light", "dark"] }],
      images: [],
      skipped: [],
    });
  });

  it("skips the charts that are not available yet, and says so", () => {
    expect(exportPlanOf(loadBenchmark("geocoding-apis"))).toEqual({
      cards: [],
      images: [],
      skipped: [{ id: "social", reason: "scatter charts are not available yet" }],
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

    for (const file of built.files) {
      const builtFile = readFileSync(join(outputFolder, file.path));
      const committedFile = readFileSync(`examples/${id}/dist/${file.path}`);

      if (file.path.endsWith(".png"))
        expect(shareOfDifferentPixels(decodePng(builtFile), decodePng(committedFile)), file.path).toBeLessThan(0.01);
      else expect(builtFile.toString("utf8"), file.path).toBe(committedFile.toString("utf8"));
    }

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
