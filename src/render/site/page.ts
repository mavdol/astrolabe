import type { Benchmark } from "../../schema/benchmark.js";
import { isAnswerBlock, TRUST_BLOCK_TYPES, type Block } from "../../schema/presentation.js";
import { MAX_HEADLINES } from "../card.js";
import { lookupOf, provenanceParts } from "../describe.js";
import { summaryChartsOf } from "../summary.js";
import { blockHtml, downloadLinksOf, sectionLabel, sectionLabelsOf, type PageInputs } from "./blocks.js";
import { CHAPTER_HEAD_WIDTH, GUTTER, PAGE_WIDTH } from "./page-style.js";
import type { Answer } from "./write-site.js";
import { escapeHtml } from "./html.js";

const ASTROLABE_REPOSITORY = "https://github.com/mavdol/astrolabe";

function linkedIfAddress(source: string): string {
  const shown = escapeHtml(source.replace(/^https?:\/\//, ""));

  return /^https?:\/\//.test(source) ? `<a href="${escapeHtml(source)}">${shown}</a>` : shown;
}

const isTrustBlock = (block: Block) => (TRUST_BLOCK_TYPES as readonly string[]).includes(block.type);

/**
 * The rows of the page: the layout as written, or the blocks in their declared order with headlines
 * side by side. The trust blocks the rows leave out close the page; none can be removed.
 */
export function pageRowsOf(benchmark: Benchmark): Block[][] {
  const blocks = benchmark.blocks && benchmark.blocks.length > 0 ? benchmark.blocks : defaultBlocksOf(benchmark);
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const rows: Block[][] = [];

  if (benchmark.layout) {
    for (const row of benchmark.layout) rows.push(row.flatMap((blockId) => blockById.get(blockId) ?? []));
  } else {
    for (const block of blocks.filter((entry) => !isTrustBlock(entry))) {
      const lastRow = rows[rows.length - 1];
      const joinsLastRow = isAnswerBlock(block) && lastRow?.every(isAnswerBlock) && lastRow.length < MAX_HEADLINES;

      if (joinsLastRow) lastRow.push(block);
      else rows.push([block]);
    }
  }

  const shownTypes = new Set(rows.flat().map((block) => block.type));

  for (const type of TRUST_BLOCK_TYPES)
    if (!shownTypes.has(type)) rows.push([blocks.find((block) => block.type === type) ?? ({ id: type, type } as Block)]);

  return rows
    .flatMap((row) =>
      row.some(isTrustBlock) ? [row.filter((block) => !isTrustBlock(block)), ...row.filter(isTrustBlock).map((block) => [block])] : [row],
    )
    .filter((row) => row.length > 0);
}

/**
 * A file with no presentation still answers its question, as the default README card does: its primary comparisons
 * as headlines, or, when there are more than three, a summary chart per metric with something to count.
 */
function defaultBlocksOf(benchmark: Benchmark): Block[] {
  const primary = (benchmark.results.comparisons ?? []).filter((comparison) => comparison.role === "primary");
  const charts = summaryChartsOf(benchmark.results);

  if (primary.length > MAX_HEADLINES && charts.length > 0)
    return charts.slice(0, MAX_HEADLINES).map((chart) => ({
      id: `summary-${chart.metric}`,
      type: "summary",
      metric: chart.metric,
      candidates: chart.summaries.map((summary) => summary.candidate),
    }));

  return primary
    .slice(0, MAX_HEADLINES)
    .map((comparison) => ({ id: comparison.id, type: "headline", comparison: comparison.id, title: `{metric:${comparison.metric}}` }));
}

export interface PageHead {
  /** The public address of the site, for the canonical link and the link preview. */
  url?: string;
  /** The preview image, relative to the site, with its text alternative. */
  previewImage?: { path: string; alt: string; width: number; height: number };
  description: string;
  /** The pair the title names after the question; the answer itself is in the description and the blocks. */
  answer: Answer;
}

/**
 * Before the first paint: whether the page may move. Revealing waits for the script; a stylesheet
 * rule shows everything anyway if the script never runs.
 */
const HEAD_SCRIPT = `if (!matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("motion");`;

/** The page's mode, as the file sets it: dark unless it asks for light, or for the reader's own setting with auto. */
export const pageModeOf = (benchmark: Benchmark) => benchmark.style?.mode ?? "dark";

function headHtml(benchmark: Benchmark, head: PageHead): string {
  const title = benchmark.results.benchmark.goal;
  const absolute = (path: string) => new URL(path, head.url!.endsWith("/") ? head.url : `${head.url}/`).toString();
  const mode = pageModeOf(benchmark);
  const preview =
    head.url && head.previewImage
      ? [
          `<meta property="og:image" content="${escapeHtml(absolute(head.previewImage.path))}">`,
          `<meta property="og:image:alt" content="${escapeHtml(head.previewImage.alt)}">`,
          `<meta property="og:image:width" content="${head.previewImage.width}">`,
          `<meta property="og:image:height" content="${head.previewImage.height}">`,
          '<meta name="twitter:card" content="summary_large_image">',
        ]
      : [];
  const address = head.url
    ? [`<link rel="canonical" href="${escapeHtml(absolute(""))}">`, `<meta property="og:url" content="${escapeHtml(absolute(""))}">`]
    : [];

  return [
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="color-scheme" content="${mode === "auto" ? "light dark" : mode}">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(head.description)}">`,
    ...address,
    ...preview,
    `<script>${HEAD_SCRIPT}</script>`,
    '<link rel="stylesheet" href="page.css">',
    '<script src="page.js" defer></script>',
    "</head>",
  ].join("\n");
}

/** The width of a chart beside its claim, inside the page's frame. */
export const CHAPTER_FIGURE_WIDTH = PAGE_WIDTH - CHAPTER_HEAD_WIDTH - 2 * GUTTER - 2;

/** A part of the page as the ruler lists it: where it starts, its number and its name. */
interface RulerEntry {
  anchor: string;
  number: string;
  name: string;
}

const TICKS_PER_PART = 3;

/**
 * The ruler beside the page: three ticks for each part of the page, evenly spaced in reading order,
 * the part being read drawn brighter with its name beside it. Each group is a link to its part, so the
 * ruler is also the page's navigation.
 */
function rulerHtml(entries: RulerEntry[]): string {
  if (entries.length === 0) return "";

  const groups = entries.map(
    (entry) =>
      `<a class="rail-group" href="#${escapeHtml(entry.anchor)}"><span class="rail-ticks" aria-hidden="true">${"<i></i>".repeat(TICKS_PER_PART)}</span><span class="rail-label">${escapeHtml(entry.number)}<span class="dim"> / </span>${escapeHtml(entry.name)}</span></a>`,
  );

  return `<nav class="rail" aria-label="Parts of the page"><div class="rail-inner">\n${groups.join("\n")}\n</div></nav>`;
}

/** The trust blocks that follow one another, as one part: how it was measured. */
function trustSectionHtml(blocks: Block[], inputs: PageInputs, number: string, isFirst: boolean): string {
  return [
    `<section class="trust-section"${isFirst ? ' id="method"' : ""}>`,
    '<header class="chapter-head">',
    `<div class="chapter-label">${sectionLabel(number, TRUST_SECTION_NAME)}</div>`,
    '<h2>Method and evidence. <span class="reading">What was measured, what was declared, and how.</span></h2>',
    "</header>",
    '<div class="chapter-body trust-body">',
    ...blocks.map(
      (block) =>
        `<div class="block trust ${escapeHtml(block.type)}" id="${escapeHtml(block.id)}">\n${blockHtml(block, inputs, CHAPTER_FIGURE_WIDTH, number)}\n</div>`,
    ),
    "</div>",
    "</section>",
  ].join("\n");
}

const TRUST_SECTION_NAME = "How it was measured";

/** The whole page: the question and its answer, the parts in order with every filter state rendered in advance, the evidence. */
export function renderPage(inputs: Omit<PageInputs, "lookup" | "sectionLabels" | "listsParts" | "titlePair">, head: PageHead): string {
  const { benchmark } = inputs;
  const lookup = lookupOf(benchmark.results);
  const rows = pageRowsOf(benchmark);
  const listsParts = rows.flat().some((block) => block.type === "methodology");
  const pageInputs: PageInputs = {
    ...inputs,
    lookup,
    listsParts,
    titlePair: head.answer.pair,
    sectionLabels: sectionLabelsOf(rows.flat(), { ...inputs, lookup, listsParts }),
  };
  const results = benchmark.results;
  const provenance = provenanceParts(benchmark, inputs.context);
  let count = 0;
  const nextNumber = () => String(++count).padStart(2, "0");
  const sections: string[] = [];
  const ruler: RulerEntry[] = [];
  let trustRun: Block[] = [];
  let trustSections = 0;
  const closeTrustRun = () => {
    if (trustRun.length === 0) return;

    const number = nextNumber();
    const isFirst = trustSections++ === 0;

    sections.push(trustSectionHtml(trustRun, pageInputs, number, isFirst));
    ruler.push({ anchor: isFirst ? "method" : trustRun[0].id, number, name: TRUST_SECTION_NAME });
    trustRun = [];
  };
  let provenanceBlock: Block | undefined;

  for (const row of rows) {
    if (row.every(isTrustBlock)) {
      provenanceBlock ??= row.find((block) => block.type === "provenance");
      trustRun.push(...row.filter((block) => block.type !== "provenance"));
      continue;
    }

    closeTrustRun();

    const headlines = row.filter(isAnswerBlock);

    if (headlines.length > 0) {
      const numbers = headlines.map(() => nextNumber());

      sections.push(
        [
          `<section class="stats" style="--columns: ${headlines.length}">`,
          ...headlines.map(
            (block, index) =>
              `<article class="block stat headline" id="${escapeHtml(block.id)}">\n${blockHtml(block, pageInputs, 0, numbers[index])}\n</article>`,
          ),
          "</section>",
        ].join("\n"),
      );
      ruler.push({
        anchor: headlines[0].id,
        number: numbers.length > 1 ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers[0],
        name: numbers.length > 1 ? "Results" : "Result",
      });
    }

    for (const block of row.filter((entry) => !isAnswerBlock(entry))) {
      const number = nextNumber();

      sections.push(
        `<section class="block chapter ${escapeHtml(block.type)}" id="${escapeHtml(block.id)}">\n${blockHtml(block, pageInputs, CHAPTER_FIGURE_WIDTH, number)}\n</section>`,
      );
      ruler.push({ anchor: block.id, number, name: pageInputs.sectionLabels.get(block.id)! });
    }
  }

  closeTrustRun();

  const ciRun = provenance.continuousIntegration;
  const commit = ciRun ? `commit ${escapeHtml(ciRun.commit)}` : undefined;
  const footerLine = [
    linkedIfAddress(provenance.source),
    `results ${escapeHtml(provenance.hash)}`,
    escapeHtml(provenance.date),
    ...(commit ? [ciRun?.runUrl ? `<a href="${escapeHtml(ciRun.runUrl)}">${commit}</a>` : commit] : []),
    ...downloadLinksOf(pageInputs),
  ].map((part) => `<span>${part}</span>`);
  const credit = provenance.attribution ? `<span class="credit"><a href="${ASTROLABE_REPOSITORY}">Built with Astrolabe</a></span>` : "";
  const lede = results.benchmark.scope ? escapeHtml(results.benchmark.scope) : "";
  const answer = head.answer.pair ? ` <span class="answer">${escapeHtml(head.answer.pair)}</span>` : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    headHtml(benchmark, head),
    "<body>",
    '<div class="layout">',
    rulerHtml(ruler),
    '<div class="sheet">',
    '<main id="top">',
    '<section class="hero">',
    `<p class="mono-label hero-label"><span><span class="tick-mark" aria-hidden="true"></span><span class="benchmark-name">${escapeHtml(results.benchmark.id)}</span> <span class="benchmark-version">v${escapeHtml(results.benchmark.version)}</span></span> <span>updated ${escapeHtml(provenance.date)}</span> <span>baseline ${escapeHtml(lookup.candidateName.get(results.baseline)!)}</span></p>`,
    `<h1><span class="question">${escapeHtml(results.benchmark.goal)}</span>${answer}</h1>`,
    lede ? `<p class="lede">${lede}</p>` : "",
    "</section>",
    ...sections,
    "</main>",
    `<footer class="footer"${provenanceBlock ? ` id="${escapeHtml(provenanceBlock.id)}"` : ""}>`,
    `<p class="footer-line">${footerLine.join("")}${credit}</p>`,
    "</footer>",
    "</div>",
    "</div>",
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}
