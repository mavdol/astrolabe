import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compute } from "../src/compute/compute.js";
import { loadRaw } from "../src/compute/files.js";
import { servePreview } from "../src/preview/serve.js";
import { buildOutputs } from "../src/render/build.js";
import { cardAltText, cardContentOf } from "../src/render/card.js";
import { pageRowsOf } from "../src/render/site/page.js";
import { answerOf } from "../src/render/site/write-site.js";
import { benchmarkSchema, SCHEMA_VERSION, type Benchmark } from "../src/schema/benchmark.js";
import type { Block } from "../src/schema/presentation.js";
import { THEME } from "../src/themes/astrolabe.js";
import { planOf, rawFileOf } from "./helpers.js";
import { decodePng } from "./png.js";

const context = { generatorVersion: "0.2.0", buildDate: "2026-11-17" };
const pathOf = (id: string) => `examples/${id}/benchmark.json`;
const loadBenchmark = (id: string): Benchmark => benchmarkSchema.parse(JSON.parse(readFileSync(pathOf(id), "utf8")));

function buildSite(id: string, options: { url?: string; benchmark?: Benchmark } = {}) {
  const benchmark = options.benchmark ?? loadBenchmark(id);
  const folder = mkdtempSync(join(tmpdir(), "astrolabe-site-"));
  const built = buildOutputs(benchmark, ["site"], folder, context, {
    rawFiles: loadRaw(benchmark.results, pathOf(id)),
    sourcePath: pathOf(id),
    url: options.url,
  });
  const read = (path: string) => readFileSync(join(folder, "site", path), "utf8");

  return { built, folder, html: read("index.html"), css: read("page.css"), read };
}

describe("the rows of the page", () => {
  it("follow the layout as written, give each trust block a row of its own, and close with the ones it leaves out", () => {
    const support = loadBenchmark("support-assistant-eval");
    const rows = pageRowsOf(support).map((row) => row.map((block) => block.id));

    expect(rows).toEqual([
      ["headline-accuracy", "headline-cost"],
      ["chart-by-category", "chart-cost-accuracy"],
      ["chart-by-task"],
      ["table-tasks"],
      ["methodology"],
      ["environment"],
      ["limitations"],
      ["provenance"],
    ]);

    for (const type of ["methodology", "environment", "limitations", "provenance"])
      expect(
        pageRowsOf(support)
          .flat()
          .filter((block) => block.type === type),
      ).toHaveLength(1);
  });

  it("put headlines side by side and every other block on its own row when there is no layout", () => {
    const parsers = { ...loadBenchmark("json-cli-parse"), layout: undefined };

    expect(pageRowsOf(parsers).map((row) => row.map((block) => block.type))).toEqual([
      ["headline", "headline"],
      ["chart"],
      ["chart"],
      ["chart"],
      ["methodology"],
      ["environment"],
      ["limitations"],
      ["provenance"],
    ]);
  });

  it("answer the question of a file with no presentation with its primary comparisons", () => {
    const rows = pageRowsOf(loadBenchmark("js-runtimes"));

    expect(rows[0].map((block) => [block.type, "comparison" in block ? block.comparison : ""])).toEqual([
      ["headline", "wall_time__deno"],
      ["headline", "peak_rss__deno"],
    ]);
  });
});

describe("the site", () => {
  const support = buildSite("support-assistant-eval", { url: "https://example.org/benchmarks/support" });

  it("is one folder that a host serves as it is, with the font, a copy of the file and of its raw data", () => {
    const files = support.built.files.map((file) => file.path);

    expect(files).toEqual(
      expect.arrayContaining([
        "site/index.html",
        "site/page.css",
        "site/page.js",
        "site/.nojekyll",
        "site/fonts/inter-latin-400-normal.woff",
        "site/fonts/geist-mono-latin-400-normal.woff2",
        "site/fonts/OFL.txt",
        "site/fonts/OFL-Geist.txt",
        "site/benchmark.json",
        "site/data/items.jsonl",
      ]),
    );
    expect(support.read("benchmark.json")).toBe(readFileSync(pathOf("support-assistant-eval"), "utf8"));
    expect(support.read("data/items.jsonl")).toBe(readFileSync("examples/support-assistant-eval/data/items.jsonl", "utf8"));
    expect(support.built.site!.copied).toEqual(["benchmark.json", "data/items.jsonl"]);
  });

  it("loads nothing from elsewhere: no external font, script, stylesheet or image", () => {
    const resources = [...support.html.matchAll(/<(?:link|script|img)[^>]*(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    const canonical = support.html.match(/<link rel="canonical" href="([^"]+)"/)![1];

    expect(resources.filter((resource) => resource !== canonical).every((resource) => !/^[a-z]+:|^\/\//.test(resource))).toBe(true);
    expect(support.css).not.toMatch(/url\((?!"fonts\/)/);
    expect(support.html).not.toContain("@import");
  });

  it("renders every filter state in advance: the default one shown, the others hidden", () => {
    const views = [...support.html.matchAll(/<div data-state="([^"]+)"( hidden)?>/g)].map((match) => [match[1], match[2] === " hidden"]);

    expect(views).toEqual([
      ["category=all", false],
      ["category=reasoning", true],
      ["category=coding", true],
    ]);
    expect(support.html).toContain('<div data-filters="category">');
  });

  it("draws each chart in a wide and a narrow version, with real text, in the mode the file sets", () => {
    const svgs = support.html.match(/<svg[\s\S]*?<\/svg>/g)!.filter((svg) => !/^<svg[^>]*aria-hidden="true"/.test(svg));

    expect(svgs.length).toBeGreaterThan(0);
    expect(support.html).not.toContain("data-mode=");
    expect(support.html).toContain('<div data-width="narrow">');
    expect(svgs.every((svg) => svg.includes("<text ") && !svg.includes("<use "))).toBe(true);
    expect(svgs.every((svg) => /role="img" aria-label="[^"]+"/.test(svg))).toBe(true);
  });

  it("gives every chart its title, how to read it, its description and its data table", () => {
    const chapters = support.html.match(/<section class="block chapter chart"[\s\S]*?<\/section>/g)!;

    expect(chapters).toHaveLength(3);

    for (const panel of chapters) {
      expect(panel).toMatch(/<h2 [^>]*><a [^>]+>[^<]+<\/a>/);
      expect(panel).toContain('<figcaption class="how-to-read">');
      expect(panel).toMatch(/<details class="chart-data"><summary>Data and description<\/summary>\n<p class="description">[^<]+<\/p>/);
      expect(panel).toContain("<table>");
    }
  });

  it("offers filters a keyboard can use: native radio buttons under a legend, with a visible focus", () => {
    expect(support.html).toContain('<fieldset class="segmented" data-filter="category" hidden><legend class="label">Category</legend>');
    expect(support.html).toContain(
      '<label><input type="radio" name="chart-by-task--category" value="all" data-filter="category" checked><span>All</span></label>',
    );
    expect(support.css).toContain(".segmented input:focus-visible + span { outline: 2px solid var(--ink)");
  });

  it("answers the question in the headline with the one comparison the page leads with, in ink without verdict colours, and counts the others below it", () => {
    const answer =
      "Model A against Model B: accuracy +6.4 points, likely better. 3 more primary comparisons: 1 better, 1 inconclusive, 1 worse.";

    expect(support.html).toContain('<span class="answer">Model A against Model B: accuracy +6.4 points, likely better.</span></h1>');
    expect(support.html).toContain(
      '<p class="lede">Internal tasks only; does not measure latency or safety. 3 more primary comparisons: 1 better, 1 inconclusive, 1 worse.</p>',
    );
    expect(support.html).toContain(`<meta name="description" content="${answer}">`);
  });

  it("names the comparison of the headline the page shows first, whatever the order of blocks", () => {
    const benchmark = loadBenchmark("support-assistant-eval");

    benchmark.layout = [["headline-cost", "headline-accuracy"], ...benchmark.layout!.slice(1)];

    expect(answerOf(benchmark)).toMatch(/^Model A against Model B: cost per item \+265%, worse\./);
  });

  it("names the first primary comparison when no headline leads the page", () => {
    const benchmark = loadBenchmark("support-assistant-eval");

    benchmark.blocks = benchmark.blocks?.filter((block) => block.type !== "headline");
    benchmark.results.comparisons = [...benchmark.results.comparisons!].reverse();

    expect(answerOf(benchmark)).toBe(
      "Model A against Model B: cost per item +265%, worse. 3 more primary comparisons: 1 better, 1 likely better, 1 inconclusive.",
    );
  });

  it("names the script of each claim when scripts sit side by side at the top of the structure", () => {
    const plan = planOf({
      structure: {
        levels: ["script"],
        nodes: [
          { id: "start-up", level: "script", label: "Start-up script" },
          { id: "parse", level: "script", label: "Parsing script" },
        ],
      },
      metrics: [
        {
          id: "wall_time",
          label: "Wall time",
          unit: "s",
          direction: "lower",
          kind: "run_time",
          statistic: "median",
          compare_as: "relative",
          minimum_meaningful: 10,
          failures_count_as: "excluded",
          from: { raw: "data", measure: "wall_time" },
        },
      ],
      levels: [{ level: "process", field: "run", planned: 12 }],
    });
    const typicalTime = { "start-up": { base: 0.025, new: 0.03 }, parse: { base: 0.25, new: 0.2 } } as const;
    const rows = (["start-up", "parse"] as const).flatMap((node) =>
      (["base", "new"] as const).flatMap((candidate) =>
        Array.from({ length: 12 }, (_, index) => ({
          candidate,
          node,
          measure: "wall_time",
          value: typicalTime[node][candidate] * (1 + (index - 6) / 1000),
          run: index + 1,
        })),
      ),
    );
    const scripts = { schema_version: SCHEMA_VERSION, results: compute(plan, { data: rawFileOf(rows) }) } as Benchmark;

    expect(answerOf(scripts)).toBe("new against base: wall time, Start-up script +20%, worse. 1 more primary comparison: 1 better.");
    expect(cardAltText(scripts, cardContentOf(scripts))).toBe(
      "new against base: wall time, Start-up script (lower is better) +20%, worse; wall time, Parsing script (lower is better) −20%, better.",
    );
  });

  it("keys each row and tags each mark with its candidate, so a filter moves rows and a pointer highlights one candidate", () => {
    const panel = support.html.match(/<section class="block chapter chart" id="chart-by-task">[\s\S]*?<\/section>/)![0];
    const keysOf = (state: string) => {
      const view = panel.match(new RegExp(`<div data-state="${state}"[^>]*>[\\s\\S]*?(?=<div data-state=|</figure>)`))![0];

      return new Set([...view.matchAll(/<g data-key="([^"]+)" data-candidate="model_a"/g)].map((match) => match[1]));
    };

    expect([...keysOf("category=coding")]).toEqual(["bugfix|model_a"]);
    expect(keysOf("category=all")).toContain("bugfix|model_a");
    expect(support.html).toMatch(/data-candidate="model_b"/);
  });

  it("moves rows only when the reader allows motion", () => {
    const script = support.read("page.js");

    expect(script).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(script).toContain("!reducedMotion.matches");
    expect(support.css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("breaks the notes of a narrow chart into lines instead of crushing its plot, and keeps every word", () => {
    const narrow = support.html
      .match(/<section class="block chapter chart" id="chart-by-task">[\s\S]*?<\/section>/)![0]
      .match(/<div data-width="narrow"><svg[\s\S]*?<\/svg>/)![0];
    const texts = [...narrow.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

    expect(texts).toContain("inconclusive,");
    expect(texts.filter((text) => text === "exploratory").length).toBeGreaterThan(0);
  });

  it("names its copy-link buttons in words, and draws their icons for the eye only", () => {
    const buttons = support.html.match(/<a class="icon-button"[\s\S]*?<\/a>/g)!;

    expect(buttons).toHaveLength(4);

    for (const button of buttons) {
      expect(button).toContain('<span class="visually-hidden" data-copy-status>Copy a link to this part</span>');
      expect(button.match(/<svg [^>]*aria-hidden="true"/g)).toHaveLength(2);
    }
  });

  it("shows no value that only a pointer can reach", () => {
    expect(support.html).not.toContain(' title="');
    expect(support.html.match(/<title>/g)).toHaveLength(1);
    expect(support.html.match(/<svg[\s\S]*?<\/svg>/g)!.every((svg) => !svg.includes("<title"))).toBe(true);
  });

  it("takes every colour from the theme", () => {
    const themeColours = new Set(Object.values(THEME).flatMap((colours) => Object.values(colours).flat()));
    const pageColours = support.css.match(/#[0-9a-f]{6}/gi)!;

    expect(pageColours.length).toBeGreaterThan(0);
    expect(pageColours.every((colour) => themeColours.has(colour))).toBe(true);
  });

  it("names its address and shows a preview image when it knows where it is published", () => {
    const preview = decodePng(readFileSync(join(support.folder, "site", "preview.png")));

    expect(support.html).toContain('<link rel="canonical" href="https://example.org/benchmarks/support/">');
    expect(support.html).toContain('<meta property="og:image" content="https://example.org/benchmarks/support/preview.png">');
    expect(support.html).toMatch(/<meta property="og:image:alt" content="[^"]+">/);
    expect([preview.width, preview.height]).toEqual([1200, 630]);
  });

  it("says when it has no address for a preview, and still works", () => {
    const withoutAddress = buildSite("json-cli-parse");

    expect(withoutAddress.html).not.toContain("og:image");
    expect(withoutAddress.built.warnings).toContain(
      "no --url given: the site works anywhere, but a link to it shared on a social network shows no preview image",
    );
  });

  it("says when no blocks are declared, so the page has headlines only, and stays quiet when they are", () => {
    const noBlocksWarning = (id: string) => buildSite(id).built.warnings.filter((warning) => warning.startsWith("no blocks declared"));

    expect(noBlocksWarning("js-runtimes")).toEqual([
      "no blocks declared: the page shows only the first primary comparisons as headlines, with no chart or table; visualization/page.md says how to choose them",
    ]);
    expect(noBlocksWarning("json-cli-parse")).toEqual([]);
  });

  it("closes with the provenance line every export carries, and the files to download", () => {
    const footer = support.html.match(/<footer[\s\S]*<\/footer>/)![0];
    const parts = [...footer.matchAll(/<span(?: class="credit")?>([\s\S]*?)<\/span>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));

    expect(footer).toContain('<footer class="footer" id="provenance">');
    expect(parts).toEqual([
      "github.com/example/support-assistant-eval",
      expect.stringMatching(/^results [0-9a-f]{12}$/),
      "2026-11-17",
      "benchmark.json ↓",
      "data/items.jsonl ↓",
      "Built with Astrolabe",
    ]);
    expect(footer).toContain('<a href="https://github.com/example/support-assistant-eval">');
    expect(footer).not.toContain("validate");
  });

  it("names the benchmark and its version on its first line, with the date it was built and the baseline", () => {
    const label = support.html.match(/<p class="mono-label hero-label">[\s\S]*?<\/p>/)![0].replace(/<[^>]+>/g, "");

    expect(label).toBe("support-assistant-eval v1.2.0 updated 2026-11-17 baseline Model B");
    expect(support.css).toContain(".hero-label > span + span::before");
    expect(support.html).not.toMatch(/<header class="nav"|data-theme-switch|Download data/);
  });

  it("gives the trust blocks the full width of the page", () => {
    expect(support.css).not.toMatch(/\.trust \{[^}]*max-width/);
  });

  it("links its credit to the Astrolabe repository, unless the author turns the credit off", () => {
    const parsers = loadBenchmark("json-cli-parse");
    const withoutCredit = buildSite("json-cli-parse", { benchmark: { ...parsers, style: { ...parsers.style, attribution: false } } });

    expect(support.html).toContain('<a href="https://github.com/mavdol/astrolabe">Built with Astrolabe</a></span></p>');
    expect(withoutCredit.html).not.toContain("Built with Astrolabe");
  });

  it("lists its parts on a ruler beside the page: three ticks and a name for each, each a link to its part", () => {
    const groups = [
      ...support.html.matchAll(
        /<a class="rail-group" href="#([^"]+)"><span class="rail-ticks" aria-hidden="true">(<i><\/i>)+<\/span><span class="rail-label">([\s\S]*?)<\/span><\/a>/g,
      ),
    ];
    const ticks = [...support.html.matchAll(/<span class="rail-ticks" aria-hidden="true">((?:<i><\/i>)+)<\/span>/g)].map(
      (match) => match[1].length / 7,
    );

    expect(support.html).toContain('<nav class="rail" aria-label="Parts of the page">');
    expect(groups.map((group) => [group[1], group[3].replace(/<[^>]+>/g, "")])).toEqual([
      ["headline-accuracy", "01–02 / Results"],
      ["chart-by-category", "03 / By category"],
      ["chart-cost-accuracy", "04 / Accuracy against cost per item"],
      ["chart-by-task", "05 / By task · exploratory"],
      ["table-tasks", "06 / The numbers"],
      ["method", "07 / How it was measured"],
    ]);
    expect(ticks.every((count) => count === 3)).toBe(true);
    expect(support.html, "no tick that stands for nothing").not.toContain('class="rail-tick"');
    expect(support.read("page.js")).toContain('group.setAttribute("aria-current", "location")');
  });

  it("names each chapter as its ruler entry does, with its measure only when two chapters would share a name", () => {
    const support = loadBenchmark("support-assistant-eval");
    const costByTask = {
      ...support.blocks!.find((block) => block.id === "chart-by-task")!,
      id: "chart-cost-by-task",
      metric: "cost_per_item",
      title: "Cost by task",
    } as Block;
    const both = buildSite("support-assistant-eval", {
      benchmark: { ...support, blocks: [...support.blocks!, costByTask], layout: undefined },
    });

    expect(both.html).toContain("Accuracy by task · exploratory");
    expect(both.html).toContain("Cost per item by task · exploratory");
    expect(both.html).not.toMatch(/\/ <\/span>By task/);
  });

  it("brings the headline in word by word", () => {
    expect(support.read("page.js")).toContain("function splitIntoWords(heading)");
    expect(support.css).toMatch(/\.motion \.hero h1:not\(\.is-split\) \{[^}]*animation: appear 0s 4s forwards;/);
  });

  it("draws the marks it makes itself, table bars and keys, in each candidate's chart colour", () => {
    const following = buildSite("support-assistant-eval", {
      benchmark: { ...loadBenchmark("support-assistant-eval"), style: { mode: "auto" } },
    });

    expect(support.css).toContain(`[data-candidate="model_a"] { --series: ${THEME.dark.series[0]}; }`);
    expect(following.css).toMatch(
      new RegExp(
        `@media \\(prefers-color-scheme: dark\\) \\{[^\\n]*\\[data-candidate="model_a"\\] \\{ --series: ${THEME.dark.series[0]}; \\}`,
      ),
    );
    expect(support.html).toMatch(
      /<span class="cell-line"><span class="cell-value">73<\/span><span class="cell-bar" style="[^"]+" aria-hidden="true"><\/span><span class="cell-ci">69 to 77<\/span><\/span>/,
    );
  });

  it("takes its mode from the file: dark by default, light when asked, the reader's own with auto", () => {
    const withMode = (mode: "auto" | "light") =>
      buildSite("support-assistant-eval", { benchmark: { ...loadBenchmark("support-assistant-eval"), style: { mode } } });
    const following = withMode("auto");

    expect(support.css).toContain(`:root { color-scheme: dark; --background: ${THEME.dark.background};`);
    expect(support.html).toContain('<meta name="color-scheme" content="dark">');
    expect(withMode("light").css).toContain(`:root { color-scheme: light; --background: ${THEME.light.background};`);
    expect(following.css).toContain(`@media (prefers-color-scheme: dark) { :root { --background: ${THEME.dark.background};`);
    expect(following.html).toContain('<div data-mode="dark">');
  });

  it("brings each part in only when the reader allows motion, and shows everything anyway when the script never runs", () => {
    expect(support.html).toContain(
      '<script>if (!matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("motion");</script>',
    );
    expect(support.css).toMatch(/\.motion :is\(.+\):not\(\.is-in\) \{[^}]*animation: appear 0s 4s forwards;/);
    expect(support.css).toMatch(/\.motion \.hero h1:not\(\.is-in\) \.word \{[^}]*animation: appear 0s 4s forwards;/);
    expect(support.html).toMatch(/<g data-grow-from="[\d.]+">/);
    expect(support.html).toContain("<g data-pop=");
  });

  it("draws under each headline figure the comparison itself: two values from zero for a change in percent, the effect on its strip for a difference", () => {
    const headline = (id: string) =>
      support.html.match(new RegExp(`<article class="block stat headline" id="${id}">[\\s\\S]*?</article>`))![0];

    expect(headline("headline-cost")).toContain('<svg class="micro values"');
    expect(headline("headline-cost")).toMatch(/<text class="name"[^>]*>Model A<\/text>/);
    expect(headline("headline-accuracy")).toContain('<svg class="micro strip good"');
    expect(headline("headline-accuracy")).toContain(
      '<p class="figure good"><span data-count="6.4" data-decimals="1">+6.4</span><small>points</small></p>',
    );
  });

  it("colours a verdict beside its word, never instead of it", () => {
    const chips = [...support.html.matchAll(/<span class="chip (\w+)[^"]*">([^<]+)<\/span>/g)].map((match) => [match[1], match[2]]);

    expect(chips).toContainEqual(["good", "likely better"]);
    expect(chips).toContainEqual(["bad", "worse"]);
    expect(chips).toContainEqual(["neutral", "inconclusive"]);
  });

  it("draws the key of a chart with its marks, and keeps their names for screen readers", () => {
    const chapter = support.html.match(/<section class="block chapter chart" id="chart-by-category">[\s\S]*?<\/section>/)![0];
    const key = chapter.match(/<ul class="chart-key">[\s\S]*?<\/ul>/)![0];

    expect(key.match(/<svg class="key-mark"/g)).toHaveLength(3);
    expect(key).toContain(
      '<span class="visually-hidden">Each dot: </span>The change of Model A against Model B, in points; higher is better.',
    );
    expect(key).toContain('<span class="visually-hidden">Shaded band: </span>Changes under 3 points, too small to matter.');
  });

  it("writes each detail of a table cell once escaped, with the addresses in its evidence as links", () => {
    const notes = loadBenchmark("notes-apps-onboarding");

    notes.results.values!.find((value) => value.evidence)!.evidence = "Offline & synced, see https://example.org/run";

    const html = buildSite("notes-apps-onboarding", { benchmark: notes }).html;

    expect(html).toContain('n = 1 · Offline &amp; synced, see <a href="https://example.org/run">https://example.org/run</a>');
    expect(html).not.toContain("&amp;amp;");
  });

  it("counts how it was measured as steps: each level observed, the candidates, the judge and the claims", () => {
    const steps = [...support.html.matchAll(/<p class="step-figure">([^<]+)<small>([^<]+)<\/small><\/p>/g)].map(
      (match) => `${match[1]} ${match[2]}`,
    );

    expect(steps).toEqual(["470 items", "× 5 repeats", "2 candidates", "1 model judge", "4 claims"]);
    expect(support.html).toContain('<section class="trust-section" id="method">');
  });

  it("keeps the colours of a file that fixes its mode, and draws its charts once", () => {
    const parsers = loadBenchmark("json-cli-parse");
    const light = buildSite("json-cli-parse", { benchmark: { ...parsers, style: { ...parsers.style, mode: "light" } } });

    expect(light.css).toContain(`:root { color-scheme: light; --background: ${THEME.light.background};`);
    expect(light.html).not.toContain("data-mode=");
  });
});

describe("the preview", () => {
  const folder = mkdtempSync(join(tmpdir(), "astrolabe-preview-"));

  writeFileSync(join(folder, "index.html"), "<html><body><p>page</p></body></html>");
  writeFileSync(join(folder, "page.css"), "body {}");
  writeFileSync(join(tmpdir(), "astrolabe-preview-secret.txt"), "secret");

  const preview = servePreview(folder);
  const listening = new Promise<string>((resolve) =>
    preview.server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(preview.server.address() as AddressInfo).port}`)),
  );

  afterAll(() => preview.server.close());

  it("serves the site with the script that reloads it after a build", async () => {
    const address = await listening;
    const page = await fetch(`${address}/`);
    const style = await fetch(`${address}/page.css`);

    expect(await page.text()).toContain('new EventSource("/__astrolabe/reload")');
    expect(style.headers.get("content-type")).toBe("text/css; charset=utf-8");
  });

  it("serves nothing outside the site's folder", async () => {
    const address = await listening;

    expect((await fetch(`${address}/../astrolabe-preview-secret.txt`)).status).toBe(404);
    expect((await fetch(`${address}/%2e%2e/astrolabe-preview-secret.txt`)).status).toBe(404);
  });
});
