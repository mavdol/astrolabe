import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadRaw } from "../src/compute/files.js";
import { servePreview } from "../src/preview/serve.js";
import { buildOutputs } from "../src/render/build.js";
import { pageRowsOf } from "../src/render/site/page.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";
import { THEME } from "../src/themes/astrolabe.js";
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
  it("follow the layout as written, and close with the trust blocks it leaves out", () => {
    const support = loadBenchmark("support-assistant-eval");
    const rows = pageRowsOf(support).map((row) => row.map((block) => block.id));

    expect(rows.slice(0, support.layout!.length)).toEqual(support.layout!.filter((row) => row.length > 0));

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
        "site/filters.js",
        "site/.nojekyll",
        "site/fonts/inter-latin-400-normal.woff",
        "site/fonts/OFL.txt",
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

  it("draws each chart in a wide and a narrow version, in both modes, with real text", () => {
    const svgs = support.html.match(/<svg[\s\S]*?<\/svg>/g)!;

    expect(support.html).toContain('<div data-mode="dark">');
    expect(support.html).toContain('<div data-width="narrow">');
    expect(svgs.every((svg) => svg.includes("<text ") && !svg.includes("<use "))).toBe(true);
    expect(svgs.every((svg) => /role="img" aria-label="[^"]+"/.test(svg))).toBe(true);
  });

  it("gives every chart its title, how to read it, its description and its data table", () => {
    const figures = support.html.match(/<figure>[\s\S]*?<\/figure>/g)!;

    expect(figures.length).toBeGreaterThan(0);

    for (const figure of figures) {
      expect(figure).toMatch(/<figcaption class="how-to-read">[^<]+<\/figcaption>/);
      expect(figure).toMatch(/<details class="data"><summary>Data and description<\/summary>\n<p>[^<]+<\/p>/);
      expect(figure).toContain("<table>");
    }
  });

  it("offers filters a keyboard can use: native radio buttons under a legend, with a visible focus", () => {
    expect(support.html).toMatch(
      /<form class="filters" data-filter-bar hidden aria-label="Filters">\n<fieldset><legend>Category<\/legend>/,
    );
    expect(support.html).toContain('<label><input type="radio" name="category" value="all" checked> All</label>');
    expect(support.css).toContain(":focus-visible { outline: 2px solid var(--ink)");
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

  it("closes with how it was built and how to check it: the full hash and links to the evidence", () => {
    expect(support.html).toMatch(/<li>Results sha256: <code>[0-9a-f]{64}<\/code><\/li>/);
    expect(support.html).toContain('<a href="benchmark.json">benchmark.json</a>');
    expect(support.html).toContain('<a href="data/items.jsonl">data/items.jsonl</a>');
    expect(support.html).toContain("run npx astrolabe-bench validate benchmark.json");
  });

  it("keeps the colours of a file that fixes its mode, and draws its charts once", () => {
    const parsers = loadBenchmark("json-cli-parse");
    const dark = buildSite("json-cli-parse", { benchmark: { ...parsers, style: { ...parsers.style, mode: "dark" } } });

    expect(dark.css).toContain(`:root { color-scheme: dark; --background: ${THEME.dark.background};`);
    expect(dark.html).not.toContain("data-mode=");
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
