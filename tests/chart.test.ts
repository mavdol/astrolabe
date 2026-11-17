import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutputs } from "../src/render/build.js";
import { ChartError, defaultFilterState, type FilterState } from "../src/render/chart/chart-data.js";
import { renderChart, type ChartOptions } from "../src/render/chart/render-chart.js";
import { extentAroundData, linearScale } from "../src/render/chart/scale.js";
import { exportPlanOf, IMAGE_SIZES } from "../src/render/exports.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";
import { blockSchema, type ChartBlock } from "../src/schema/presentation.js";
import { contrastRatio, MARK_CONTRAST, seriesStylesOf, TEXT_CONTRAST, THEME, visibleOn } from "../src/themes/astrolabe.js";
import { decodePng } from "./png.js";

const loadBenchmark = (id: string): Benchmark => benchmarkSchema.parse(JSON.parse(readFileSync(`examples/${id}/benchmark.json`, "utf8")));
const context = { generatorVersion: "0.2.0", buildDate: "2026-11-17" };
const chartBlockOf = (benchmark: Benchmark, id: string) => benchmark.blocks!.find((block) => block.id === id) as ChartBlock;
const chartBlock = (fields: Record<string, unknown>) =>
  blockSchema.parse({ id: "chart", type: "chart", title: "A chart", ...fields }) as ChartBlock;
const draw = (benchmark: Benchmark, block: ChartBlock, options: Partial<ChartOptions> = {}, filterState?: FilterState) =>
  renderChart(
    benchmark,
    block,
    { width: 640, mode: "light", standalone: false, filterState: filterState ?? defaultFilterState(benchmark), ...options },
    context,
  );

describe("the scale of an axis", () => {
  it("ends on round numbers that enclose the data, with evenly spaced ticks", () => {
    const scale = linearScale([0, 894.8], [100, 600]);

    expect(scale.domain).toEqual([0, 1000]);
    expect(scale.ticks).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(scale.position(0)).toBe(100);
    expect(scale.position(500)).toBe(350);
  });

  it("gives its ticks the decimals that tell them apart", () => {
    expect(linearScale([0, 1], [0, 100]).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(linearScale([0, 1], [0, 100]).tickDecimals).toBe(1);
    expect(linearScale([0, 10], [0, 100], 4).ticks).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(linearScale([0, 10], [0, 100], 4).tickDecimals).toBe(1);
  });

  it("still has a span when every value is the same", () => {
    expect(linearScale([5, 5], [0, 100]).domain).toEqual([4, 6]);
  });

  it("cannot make a difference too small to matter fill an axis that does not start at zero", () => {
    expect(extentAroundData([99.9, 100.1], 1)).toEqual([97.5, 102.5]);
    expect(extentAroundData([80, 120], 1)).toEqual([80, 120]);
  });
});

describe("the colours of the default theme", () => {
  it.each(["light", "dark"] as const)("%s: text and marks keep their contrast against the background", (mode) => {
    const colours = THEME[mode];

    expect(contrastRatio(colours.ink, colours.background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrastRatio(colours.secondary, colours.background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);

    for (const grey of colours.series) expect(contrastRatio(grey, colours.background)).toBeGreaterThanOrEqual(MARK_CONTRAST);
  });

  it("tells candidates apart by shape as well as by colour", () => {
    const styles = [...seriesStylesOf(["a", "b", "c", "d"], undefined, "light").values()];

    expect(new Set(styles.map((style) => style.shape)).size).toBe(4);
    expect(new Set(styles.map((style) => style.colour)).size).toBe(4);
  });

  it("gives the highlighted candidate the ink or the accent, and greys to the others", () => {
    const withInk = seriesStylesOf(["a", "b"], { highlight: "b" }, "light");
    const withAccent = seriesStylesOf(["a", "b"], { highlight: "b", accent: "#2f6fed" }, "light");

    expect(withInk.get("b")!.colour).toBe(THEME.light.ink);
    expect(withInk.get("a")!.colour).toBe(THEME.light.series[1]);
    expect(withAccent.get("b")!.colour).toBe("#2f6fed");
  });

  it("moves a colour that would be too faint towards the ink, and keeps one that is visible", () => {
    const paleYellow = "#fff3a0";
    const adjusted = visibleOn(THEME.light.background, paleYellow, THEME.light.ink);

    expect(adjusted).not.toBe(paleYellow);
    expect(contrastRatio(adjusted, THEME.light.background)).toBeGreaterThanOrEqual(MARK_CONTRAST);
    expect(visibleOn(THEME.dark.background, paleYellow, THEME.dark.ink)).toBe(paleYellow);
  });
});

describe("a chart of values", () => {
  const parsers = loadBenchmark("json-cli-parse");
  const memory = chartBlock({ chart: "bar", metric: "peak_rss", title: "Peak memory" });

  it("sorts candidates best first, whichever candidate the page is about", () => {
    const chart = draw(parsers, memory);

    expect(chart.table.rows.map((row) => row[0])).toEqual(["tinyjson", "stdjson", "fastjson"]);
    expect(draw(parsers, { ...memory, sort: "declared" }).table.rows.map((row) => row[0])).toEqual(["stdjson", "fastjson", "tinyjson"]);
  });

  it("starts its bars at zero", () => {
    const chart = draw(parsers, memory);

    expect(chart.textLines).toContain("0  200  400  600  800  1000");
  });

  it("refuses a bar chart of negative values", () => {
    const negative = structuredClone(parsers);

    negative.results.values!.find((value) => value.metric === "peak_rss")!.value = -1;
    expect(() => draw(negative, memory)).toThrow(/a bar starts at zero/);
  });

  it("marks which way is better, in words and with an arrow", () => {
    const chart = draw(parsers, memory);

    expect(chart.textLines).toContain("← better");
    expect(chart.textLines).toContain("Peak memory, median in MiB · lower is better");
  });

  it("says how to read it: what a mark is, how many observations, the level and method of the intervals", () => {
    expect(draw(parsers, memory).howToRead).toMatch(
      /Each bar: the median of 10 observations, in MiB; lower is better\. Lines: 95% confidence intervals \(order statistics\)\./,
    );
  });

  it("starts a dot chart at zero unless the block gives a reason not to, and then says so", () => {
    const time = { chart: "dot-interval", metric: "wall_time", title: "Wall time" };
    const fromZero = draw(parsers, chartBlock(time));
    const zoomed = draw(parsers, chartBlock({ ...time, scale: { zero: false, reason: "The candidates differ by a few percent" } }));

    expect(fromZero.textLines).toContain("0  1  2  3  4  5");
    expect(zoomed.textLines).not.toContain("0  1  2  3  4  5");
    expect(zoomed.howToRead).toContain("The axis does not start at zero: The candidates differ by a few percent.");
    expect(fromZero.howToRead).not.toContain("does not start at zero");
  });

  it("has no log scale yet", () => {
    const block = chartBlock({ chart: "dot-interval", metric: "wall_time", scale: { type: "log", reason: "Long tail" } });

    expect(() => draw(parsers, block)).toThrow(ChartError);
  });
});

describe("a chart broken down by node", () => {
  const notes = loadBenchmark("notes-apps-onboarding");
  const tasks = chartBlockOf(notes, "chart-tasks");

  it("shows one group per node under the block's node, candidates in the same order in each", () => {
    const chart = draw(notes, tasks);

    expect(chart.table.header).toEqual(["Group", "Candidate", "Share (%)", "Interval", "n"]);
    expect([...new Set(chart.table.rows.map((row) => row[0]))]).toEqual([
      "Create and format a note",
      "Share a note with a colleague",
      "Find a note from last week",
    ]);
    expect(chart.table.rows.map((row) => row[1])).toEqual(["Notes B", "Notes A", "Notes B", "Notes A", "Notes B", "Notes A"]);
  });

  it("resolves the templates of the author's reading", () => {
    expect(draw(notes, tasks).textLines).toContain("Overall: inconclusive.");
  });

  it("is narrowed by the filters it listens to", () => {
    const support = loadBenchmark("support-assistant-eval");
    const byTask = chartBlockOf(support, "chart-by-task");
    const everyTask = draw(support, byTask);
    const category = support.results.structure!.nodes.find((node) => node.level === "category")!;
    const oneCategory = draw(support, byTask, {}, { category: category.id });

    expect(oneCategory.table.rows.length).toBeGreaterThan(0);
    expect(oneCategory.table.rows.length).toBeLessThan(everyTask.table.rows.length);
  });
});

describe("a chart of effects", () => {
  const parsers = loadBenchmark("json-cli-parse");
  const effects = chartBlockOf(parsers, "chart-effects");
  const chart = draw(parsers, effects);

  it("shows each effect with its verdict, the best first", () => {
    expect(chart.table.rows.map((row) => [row[0], row[1], row[3]])).toEqual([
      ["fastjson", "−50%", "better"],
      ["tinyjson", "−4.3%", "equivalent"],
    ]);
  });

  it("shades the changes too small to matter and says how wide that zone is", () => {
    expect(chart.svg).toContain(`fill="${THEME.light.band}"`);
    expect(chart.howToRead).toContain("Shaded band: changes under 10%, too small to matter.");
  });

  it("names the level of its intervals, adjusted or not", () => {
    expect(chart.howToRead).toContain("Lines: 98.75% confidence intervals, adjusted for 4 primary comparisons.");
  });

  it("labels its rows by node when a single candidate is compared across nodes", () => {
    const support = loadBenchmark("support-assistant-eval");
    const byCategory = draw(support, chartBlockOf(support, "chart-by-category"));

    expect(byCategory.textLines).toContain("Accuracy: change of Model A against Model B, in points · higher is better");
    expect(byCategory.textLines).toContain("Reasoning  −1.5 points  inconclusive");
  });

  it("says that exploratory comparisons are not claims", () => {
    const support = loadBenchmark("support-assistant-eval");

    expect(draw(support, chartBlockOf(support, "chart-by-task")).howToRead).toContain(
      "Exploratory comparisons were not declared before measuring: none is a claim of the benchmark.",
    );
  });
});

describe("a chart as an image", () => {
  const parsers = loadBenchmark("json-cli-parse");
  const effects = chartBlockOf(parsers, "chart-effects");

  it("has no text element, script or external resource, and no character drawn without a glyph", () => {
    const chart = draw(parsers, effects, { standalone: true });

    expect(chart.svg).not.toMatch(/<text|<script|<foreignObject|<image|@import|url\(/);
    expect(chart.charactersWithoutGlyph).toEqual([]);
  });

  it("carries a text alternative in two parts: what the chart claims, then every value", () => {
    const chart = draw(parsers, effects);

    expect(chart.svg).toContain('role="img" aria-labelledby="title description"');
    expect(chart.altText).toBe("Only fastjson is faster than stdjson. Effects on wall time against stdjson, with their intervals.");
    expect(chart.description).toContain("fastjson, −50%");
    expect(chart.description).toContain("tinyjson, −4.3%");
  });

  it("carries its provenance only when it travels alone", () => {
    const provenance = expect.stringMatching(/results [0-9a-f]{12} · 2026-11-17 · Built with Astrolabe$/);

    expect(draw(parsers, effects, { standalone: true }).textLines).toContainEqual(provenance);
    expect(draw(parsers, effects).textLines).not.toContainEqual(provenance);
  });

  it("is as tall as its rows need, or exactly the height asked for", () => {
    const natural = draw(parsers, effects);
    const fixed = draw(parsers, effects, { standalone: true, width: 800, height: 420, enlargement: 1.5 });

    expect(natural.svg).toContain(`viewBox="0 0 640 ${natural.height}"`);
    expect(fixed.height).toBe(420);
    expect(fixed.svg).toContain('width="1200" height="630" viewBox="0 0 800 420"');
  });

  it("refuses a height its rows do not fit in, instead of shrinking them", () => {
    const notes = loadBenchmark("notes-apps-onboarding");

    expect(() => draw(notes, chartBlockOf(notes, "chart-tasks"), { standalone: true, height: 200 })).toThrow(/too many rows/);
  });
});

describe("image exports", () => {
  const withExports = (id: string, exports: unknown[]) =>
    benchmarkSchema.parse({ ...JSON.parse(readFileSync(`examples/${id}/benchmark.json`, "utf8")), exports });

  it("plans a wide or square image of one chart, in light mode unless asked otherwise, with the default filter state", () => {
    const support = withExports("support-assistant-eval", [
      { id: "tasks", blocks: ["chart-by-task"], format: "png", size: "square", mode: "both", filter_state: { category: "coding" } },
      { id: "categories", blocks: ["chart-by-category"], format: "svg", size: "wide" },
    ]);
    const plan = exportPlanOf(support);

    expect(plan.skipped).toEqual([]);
    expect(plan.images.map((image) => [image.id, image.size, image.format, image.modes, image.filterState])).toEqual([
      ["tasks", "square", "png", ["light", "dark"], { category: "coding" }],
      ["categories", "wide", "svg", ["light"], { category: "all" }],
    ]);
  });

  it("skips an image of several blocks, of a block that is not a chart, and a banner that is not an SVG", () => {
    const parsers = withExports("json-cli-parse", [
      { id: "two", blocks: ["chart-effects", "chart-runs"], format: "png", size: "wide" },
      { id: "headline", blocks: ["headline-time"], format: "png", size: "wide" },
      { id: "banner", blocks: ["headline-time"], format: "png", size: "banner" },
    ]);

    expect(exportPlanOf(parsers).skipped.map((skipped) => skipped.id)).toEqual(["two", "headline", "banner"]);
  });

  it("writes each image at the size of its shape", () => {
    const parsers = withExports("json-cli-parse", [
      { id: "effects", blocks: ["chart-effects"], format: "png", size: "wide", mode: "both" },
      { id: "effects-square", blocks: ["chart-effects"], format: "svg", size: "square" },
    ]);
    const outputFolder = mkdtempSync(join(tmpdir(), "astrolabe-chart-"));
    const built = buildOutputs(parsers, ["svg"], outputFolder, context);

    expect(built.warnings).toEqual([]);
    expect(built.files.map((file) => file.path)).toEqual([
      "exports/effects-light.png",
      "exports/effects-dark.png",
      "exports/effects-square-light.svg",
    ]);

    const png = decodePng(readFileSync(join(outputFolder, "exports/effects-light.png")));

    expect([png.width, png.height]).toEqual([IMAGE_SIZES.wide.width, IMAGE_SIZES.wide.height]);
    expect(readFileSync(join(outputFolder, "exports/effects-square-light.svg"), "utf8")).toContain('width="1080" height="1080"');
  });
});
