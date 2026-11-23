import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutputs } from "../src/render/build.js";
import { ChartError, defaultFilterState, type FilterState } from "../src/render/chart/chart-data.js";
import { renderChart, type ChartOptions } from "../src/render/chart/render-chart.js";
import { extentAroundData, linearScale, logScale } from "../src/render/chart/scale.js";
import { exportPlanOf, IMAGE_SIZES } from "../src/render/exports.js";
import { cellFill, LARGEST_SHADE } from "../src/render/chart/shaded-table.js";
import { loadRaw } from "../src/compute/files.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";
import { blockSchema, CHART_TYPES, type ChartBlock } from "../src/schema/presentation.js";
import { contrastRatio, MARK_CONTRAST, seriesStylesOf, TEXT_CONTRAST, THEME, visibleOn } from "../src/themes/astrolabe.js";
import { decodePng } from "./png.js";

const loadBenchmark = (id: string): Benchmark => benchmarkSchema.parse(JSON.parse(readFileSync(`examples/${id}/benchmark.json`, "utf8")));
const context = { generatorVersion: "0.2.0", buildDate: "2026-11-17" };
const chartBlockOf = (benchmark: Benchmark, id: string) => benchmark.blocks!.find((block) => block.id === id) as ChartBlock;
const chartBlock = (fields: Record<string, unknown>) =>
  blockSchema.parse({ id: "chart", type: "chart", title: "A chart", ...fields }) as ChartBlock;
const rawFilesOf = (id: string) => loadRaw(loadBenchmark(id).results, `examples/${id}/benchmark.json`);
const ticksOf = (chart: { textLines: string[] }) => chart.textLines.find((line) => /^[−+\d.]+%?( {2}[−+\d.]+%?)+$/.test(line));
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

  it("on a log scale, ends on powers of ten, with 2 and 5 between them when it covers few", () => {
    expect(logScale([3, 1161], [0, 100]).ticks).toEqual([1, 10, 100, 1000, 10000]);
    expect(logScale([20, 300], [0, 100]).ticks).toEqual([10, 20, 50, 100, 200, 500, 1000]);
    expect(logScale([0.02, 0.3], [0, 100]).tickDecimals).toBe(2);
    expect(logScale([10, 1000], [0, 100]).position(100)).toBe(50);
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

  it.each(["light", "dark"] as const)("%s: the verdict colours read as text, and quiet text holds at large sizes", (mode) => {
    const colours = THEME[mode];

    expect(contrastRatio(colours.good, colours.background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrastRatio(colours.bad, colours.background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrastRatio(colours.inkOnFill, colours.good)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrastRatio(colours.inkOnFill, colours.bad)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(contrastRatio(colours.quiet, colours.background)).toBeGreaterThanOrEqual(MARK_CONTRAST);
  });

  it("tells candidates apart by shape as well as by colour", () => {
    const styles = [...seriesStylesOf(["a", "b", "c", "d"], undefined, "light").values()];

    expect(new Set(styles.map((style) => style.shape)).size).toBe(4);
    expect(new Set(styles.map((style) => style.colour)).size).toBe(4);
  });

  it("keeps a candidate's colour and marker on every chart, whichever candidates a chart shows", () => {
    const support = loadBenchmark("support-assistant-eval");
    const circleColours = (svg: string) =>
      new Set([...svg.matchAll(/<circle [^>]*fill="(#[0-9a-f]{6})" stroke=/g)].map((match) => match[1]));
    const onlyModelA = draw(support, chartBlockOf(support, "chart-by-category"));
    const bothModels = draw(support, chartBlockOf(support, "chart-cost-accuracy"));

    expect(circleColours(onlyModelA.svg).size).toBe(1);
    expect(circleColours(bothModels.svg)).toEqual(circleColours(onlyModelA.svg));
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

  it("prints at most three significant figures beside a bar, and keeps every supported digit in its table", () => {
    const runtimes = loadBenchmark("js-runtimes");
    const chart = draw(runtimes, chartBlock({ chart: "bar", metric: "peak_rss", title: "Peak memory", sort: "declared" }));

    expect(chart.textLines).toContain("Node.js  213");
    expect(chart.table.rows[0]).toEqual(["Node.js", "212.88", "212.81 to 212.92 (95%)", "30"]);
  });

  it("refuses a bar chart of negative values", () => {
    const negative = structuredClone(parsers);

    negative.results.values!.find((value) => value.metric === "peak_rss")!.value = -1;
    expect(() => draw(negative, memory)).toThrow(/a bar starts at zero/);
  });

  it("marks which way is better, in words and with an arrow", () => {
    const chart = draw(parsers, memory);

    expect(chart.textLines).toContain("← BETTER");
    expect(chart.subtitle).toBe("Peak memory, median in MiB · lower is better");
    expect(chart.textLines, "in capitals, as the page's labels").toContain("PEAK MEMORY, MEDIAN IN MIB · LOWER IS BETTER");
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

  it("draws a log scale with real values on its ticks, names it, and refuses bars on it", () => {
    const logScaled = { metric: "wall_time", scale: { type: "log", reason: "Run times span orders of magnitude" } };
    const dots = draw(parsers, chartBlock({ chart: "dot-interval", ...logScaled }));

    expect(dots.textLines).toContain("1  2  5  10");
    expect(dots.subtitle).toBe("Wall time, median in s · lower is better · log scale");
    expect(dots.howToRead).toContain("The axis is on a log scale: Run times span orders of magnitude.");
    expect(() => draw(parsers, chartBlock({ chart: "bar", ...logScaled }))).toThrow(/a log scale has no zero, so it cannot carry bars/);
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
    expect(draw(notes, tasks).textLines.join(" ")).toContain("Overall: inconclusive.");
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

    expect(byCategory.subtitle).toBe("Accuracy: change of Model A against Model B, in points · higher is better");
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
    const provenance = /results [0-9a-f]{12} · 2026-11-17 · Built with Astrolabe$/;
    const standalone = draw(parsers, effects, { standalone: true }).textLines;

    expect(standalone.join(" · ")).toMatch(provenance);
    expect(standalone.at(-1), "broken between its parts, never inside one").toBe("Built with Astrolabe");
    expect(draw(parsers, effects).textLines.join(" · ")).not.toMatch(provenance);
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

    expect(() => draw(notes, chartBlockOf(notes, "chart-tasks"), { standalone: true, height: 200 })).toThrow(
      /needs \d+ px of height and the image has 200/,
    );
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

/** Accuracy is a mean of items in the example; here the categories become the parts of a total cost. */
function withCostAsTotal(): Benchmark {
  const support = loadBenchmark("support-assistant-eval");
  const values = support.results.values!;

  support.results.metrics.find((metric) => metric.id === "cost_per_item")!.statistic = "total";

  for (const candidate of ["model_a", "model_b"]) {
    const costOf = (node: string) =>
      values.find((value) => value.metric === "cost_per_item" && value.candidate === candidate && value.node === node)!;

    costOf("suite").value = costOf("reasoning").value + costOf("coding").value;
    delete costOf("suite").ci;
  }

  return support;
}

describe("the chart set", () => {
  it("accepts only the closed set of chart types: no angle, no area, no second axis", () => {
    expect(CHART_TYPES).toHaveLength(10);

    for (const refused of ["pie", "donut", "bubble", "radar", "dual-axis", "area"])
      expect(blockSchema.safeParse({ id: "chart", type: "chart", chart: refused, title: "A chart" }).success).toBe(false);
  });

  it("gives every chart type a data table and a text alternative", () => {
    const support = loadBenchmark("support-assistant-eval");
    const parsers = loadBenchmark("json-cli-parse");
    const charts = [
      draw(parsers, chartBlock({ chart: "bar", metric: "peak_rss" })),
      draw(support, chartBlock({ chart: "grouped-bar", metric: "accuracy", breakdown: "category" })),
      draw(support, chartBlock({ chart: "dot-interval", metric: "accuracy", breakdown: "task" })),
      draw(parsers, chartBlockOf(parsers, "chart-effects")),
      draw(support, chartBlockOf(support, "chart-cost-accuracy")),
      draw(parsers, chartBlockOf(parsers, "chart-runs"), { rawFiles: rawFilesOf("json-cli-parse") }),
      draw(support, chartBlock({ chart: "line", metric: "accuracy", breakdown: "task" })),
      draw(support, chartBlock({ chart: "shaded-table", metric: "accuracy", breakdown: "task" })),
      draw(withCostAsTotal(), chartBlock({ chart: "stacked-bar", metric: "cost_per_item", breakdown: "category" })),
      draw(parsers, chartBlockOf(parsers, "chart-fastjson")),
    ];

    for (const chart of charts) {
      expect(chart.table.rows.length).toBeGreaterThan(0);
      expect(chart.table.rows.every((row) => row.length === chart.table.header.length)).toBe(true);
      expect(chart.altText.length).toBeGreaterThan(0);
      expect(chart.description).toContain(chart.howToRead);
      expect(chart.svg).not.toMatch(/<text|<script|<foreignObject|<image/);
      expect(chart.charactersWithoutGlyph).toEqual([]);
    }
  });

  it("draws the interval of every value that has one", () => {
    const notes = loadBenchmark("notes-apps-onboarding");
    const chart = draw(notes, chartBlockOf(notes, "chart-tasks"), { plotOnly: true });
    const intervalsAcross = chart.svg.match(/<path d="M[\d.]+ [\d.]+H[\d.]+M[\d.]+ [\d.]+V[\d.]+M[\d.]+ [\d.]+V[\d.]+"/g) ?? [];

    expect(chart.table.rows.filter((row) => row[3] !== "—")).toHaveLength(6);
    expect(intervalsAcross).toHaveLength(6);
  });
});

describe("shared and fixed scales", () => {
  const support = loadBenchmark("support-assistant-eval");
  const byTask = chartBlockOf(support, "chart-by-task");

  it("keeps its axis when a filter changes what it shows", () => {
    expect(ticksOf(draw(support, byTask, {}, { category: "reasoning" }))).toBe(ticksOf(draw(support, byTask, {}, { category: "all" })));
  });

  it("shares its scale with the blocks it names", () => {
    const byCategory = chartBlockOf(support, "chart-by-category");
    const shared = { ...byCategory, scale: { shared_with: ["chart-by-task"] } };

    expect(ticksOf(draw(support, byCategory))).not.toBe(ticksOf(draw(support, byTask)));
    const withShared = { ...support, blocks: support.blocks!.map((block) => (block.id === shared.id ? shared : block)) };

    expect(ticksOf(draw(withShared, shared))).toBe("−10  0  +10  +20  +30");
    expect(ticksOf(draw(withShared, byTask))).toBe(ticksOf(draw(withShared, shared)));
    expect(() => draw(support, { ...shared, scale: { shared_with: ["chart-cost-accuracy"] } })).toThrow(/does not show the same measure/);
  });
});

describe("a distribution", () => {
  it("shows every observation when there are few, and the summary the benchmark computed", () => {
    const parsers = loadBenchmark("json-cli-parse");
    const chart = draw(parsers, chartBlockOf(parsers, "chart-runs"), { rawFiles: rawFilesOf("json-cli-parse") });

    expect(chart.howToRead).toContain("Each row: the 10 observations of a candidate, in s; lower is better. Dots: every observation.");
    expect(chart.table.rows[0]).toEqual(["fastjson", "2.12", expect.stringMatching(/ \(95%\)$/), "—", expect.stringMatching(/ to /), "10"]);
  });

  it("shows a box and the observations outside it when there are many", () => {
    const geocoding = loadBenchmark("geocoding-apis");
    const chart = draw(geocoding, chartBlockOf(geocoding, "chart-latency"), { rawFiles: rawFilesOf("geocoding-apis") });

    expect(chart.howToRead).toContain("Box: the middle half of the observations");
    expect(chart.table.rows.map((row) => row[4])).not.toContain("—");
  });

  it("needs the raw file", () => {
    const parsers = loadBenchmark("json-cli-parse");

    expect(() => draw(parsers, chartBlockOf(parsers, "chart-runs"))).toThrow(/the raw file "runs" is needed/);
  });
});

describe("comparison rows", () => {
  const parsers = loadBenchmark("json-cli-parse");
  const fastjson = chartBlockOf(parsers, "chart-fastjson");

  it("shows each comparison on its own row, with a factor and its word, or the verdict instead of a figure", () => {
    const chart = draw(parsers, fastjson);
    const tinyjson = draw(parsers, chartBlock({ chart: "comparison-rows", comparisons: ["wall_time__tinyjson"] }));

    expect(chart.textLines).toEqual(expect.arrayContaining(["Wall time  lower is better", "1.98× faster", "2.88× more"]));
    expect(chart.textLines).toContainEqual(expect.stringMatching(/×, worse$/));
    expect(chart.howToRead).toContain("Each row: one comparison on its own scale, both bars from zero, stdjson above and fastjson below.");
    expect(tinyjson.textLines).toContain("equivalent");
    expect(tinyjson.textLines).not.toContain("−4.3%");
  });

  it("writes the effects of its title and reading as factors too", () => {
    expect(draw(parsers, fastjson).textLines.join(" ")).toContain(
      "Faster, at the cost of memory: wall time 1.98× faster, peak memory 2.88× more.",
    );
  });

  it("refuses a factor on a difference, on another chart type, and comparisons that do not exist", () => {
    const support = loadBenchmark("support-assistant-eval");

    expect(() =>
      draw(support, chartBlock({ chart: "comparison-rows", comparisons: ["accuracy__suite__model_a"], effect_format: "times" })),
    ).toThrow(/a factor only exists for comparisons in relative terms/);
    expect(() => draw(parsers, { ...chartBlockOf(parsers, "chart-effects"), effect_format: "times" })).toThrow(
      /factors are shown on comparison-rows/,
    );
    expect(() => draw(parsers, chartBlock({ chart: "comparison-rows", comparisons: ["wall_time__nobody"] }))).toThrow(
      /not the id of a comparison/,
    );
  });
});

describe("a scatter chart", () => {
  const support = loadBenchmark("support-assistant-eval");
  const costAccuracy = chartBlockOf(support, "chart-cost-accuracy");

  it("places each candidate by its two measures, marks the better corner and joins the candidates no other beats", () => {
    const chart = draw(support, costAccuracy);

    expect(chart.textLines).toEqual(
      expect.arrayContaining([
        "Model A",
        "Model B",
        "BETTER",
        "↑ ACCURACY, SHARE IN % · HIGHER IS BETTER",
        "COST PER ITEM, MEAN IN USD · LOWER IS BETTER ←",
      ]),
    );
    expect(chart.howToRead).toContain("The marked corner is better: lower cost per item and higher accuracy.");
    expect(chart.table.rows.map((row) => row[5])).toEqual(["no", "no"]);
    expect(chart.svg).toContain('stroke-dasharray="4 3"');
  });

  it("draws no line when one candidate beats the others on both", () => {
    const beaten = structuredClone(support);

    beaten.results.values!.find((value) => value.metric === "accuracy" && value.node === "suite" && value.candidate === "model_b")!.value =
      90;

    const chart = draw(beaten, costAccuracy, { plotOnly: true });

    expect(chart.table.rows.map((row) => row[5])).toEqual(["yes", "no"]);
    expect(chart.svg).not.toContain("stroke-dasharray");
  });

  it("fits its axes to the values and says so, unless the author asks for zero", () => {
    const fitted = draw(support, costAccuracy);
    const fromZero = draw(support, { ...costAccuracy, scale: { zero: true } });
    const lowestTick = (chart: { textLines: string[] }) =>
      chart.textLines.find((line) => /^[\d.]+( {2}[\d.]+)+$/.test(line))!.split("  ")[0];

    expect(fitted.howToRead).toContain(
      "The axes do not start at zero: they are fitted to the values, so that the candidates can be told apart.",
    );
    expect(fromZero.howToRead).not.toContain("do not start at zero");
    expect(lowestTick(fromZero)).toBe("0");
    expect(lowestTick(fitted)).not.toBe("0");
  });

  it("refuses a breakdown and a log scale", () => {
    expect(() => draw(support, { ...costAccuracy, breakdown: "category" })).toThrow(/a scatter chart shows one node/);
    expect(() => draw(support, { ...costAccuracy, scale: { type: "log", reason: "Wide range" } })).toThrow(ChartError);
  });
});

describe("a line chart", () => {
  const support = loadBenchmark("support-assistant-eval");

  it("follows a metric along the nodes of a level, one labelled line per candidate", () => {
    const chart = draw(support, chartBlock({ chart: "line", metric: "accuracy", breakdown: "task" }));

    expect(chart.textLines).toEqual(
      expect.arrayContaining(["BETTER ↑", "Math word problems  Policy questions  Bug fixes", "Model A  73  68  59", "Model B  71  73  45"]),
    );
    expect(chart.table.header).toEqual(["task", "Candidate", "Share (%)", "Interval", "n"]);
  });

  it("needs a level with at least two nodes", () => {
    expect(() => draw(support, chartBlock({ chart: "line", metric: "accuracy" }))).toThrow(/set breakdown/);
    expect(() => draw(support, chartBlock({ chart: "line", metric: "accuracy", node: "coding", breakdown: "task" }))).toThrow(
      /at least two nodes/,
    );
  });
});

describe("a shaded table", () => {
  const support = loadBenchmark("support-assistant-eval");

  it("prints every value with its interval, the darkest cell for the best", () => {
    const chart = draw(support, chartBlock({ chart: "shaded-table", metric: "accuracy", breakdown: "task" }));

    expect(chart.table.header).toEqual(["task", "Model A", "Model B"]);
    expect(chart.textLines).toContainEqual(expect.stringMatching(/^45% … 73% · darker is better$/));
    expect(chart.table.rows[2]).toEqual(["Bug fixes", expect.stringMatching(/^59 \(\d+ to \d+\)$/), expect.stringMatching(/^45 \(/)]);
  });

  it("shades with a single neutral ramp, the figures readable on every shade", () => {
    for (const mode of ["light", "dark"] as const)
      for (let share = 0; share <= 1; share += 0.05) {
        const fill = cellFill(THEME[mode], share, LARGEST_SHADE[mode]);
        const channels = [1, 3, 5].map((start) => parseInt(fill.slice(start, start + 2), 16));

        expect(Math.max(...channels) - Math.min(...channels), `${fill} has no hue of its own`).toBeLessThanOrEqual(4);
        expect(contrastRatio(THEME[mode].ink, fill)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
  });
});

describe("a stacked bar", () => {
  const stacked = chartBlock({ chart: "stacked-bar", metric: "cost_per_item", breakdown: "category" });

  it("splits each candidate's total into its parts, with a legend", () => {
    const chart = draw(withCostAsTotal(), stacked);

    expect(chart.textLines).toContain("Reasoning  Coding");
    expect(chart.table.header).toEqual(["Candidate", "Reasoning", "Coding", "Total (USD)", "Interval"]);
    expect(chart.table.rows.map((row) => row[0])).toEqual(["Model B", "Model A"]);
  });

  it("shows only the parts of a total, and only when they add up to it", () => {
    const support = withCostAsTotal();

    expect(() => draw(loadBenchmark("support-assistant-eval"), stacked)).toThrow(/is not a total/);
    support.results.values!.find((value) => value.metric === "cost_per_item" && value.node === "suite")!.value *= 2;
    expect(() => draw(support, stacked)).toThrow(/add up to/);
  });
});

describe("the shape of the data", () => {
  const support = loadBenchmark("support-assistant-eval");

  it("asks for bars in groups for a breakdown, and a breakdown for bars in groups", () => {
    expect(() => draw(support, chartBlock({ chart: "bar", metric: "accuracy", breakdown: "category" }))).toThrow(/use grouped-bar/);
    expect(() => draw(support, chartBlock({ chart: "grouped-bar", metric: "accuracy" }))).toThrow(/set breakdown/);
  });
});
