import type { Benchmark } from "../../schema/benchmark.js";
import { TRUST_BLOCK_TYPES, type Block } from "../../schema/presentation.js";
import { MAX_HEADLINES } from "../card.js";
import { lookupOf, provenanceParts } from "../describe.js";
import { blockHtml, downloadLinksOf, sectionLabel, verificationHtml, type PageInputs } from "./blocks.js";
import { CHAPTER_HEAD_WIDTH, GUTTER, PAGE_WIDTH } from "./page-style.js";
import type { AnswerPart } from "./write-site.js";
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
      const joinsLastRow =
        block.type === "headline" && lastRow?.every((entry) => entry.type === "headline") && lastRow.length < MAX_HEADLINES;

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

/** A file with no presentation still answers its question: its first primary comparisons, as on the default README card. */
function defaultBlocksOf(benchmark: Benchmark): Block[] {
  return (benchmark.results.comparisons ?? [])
    .filter((comparison) => comparison.role === "primary")
    .slice(0, MAX_HEADLINES)
    .map((comparison) => ({ id: comparison.id, type: "headline", comparison: comparison.id, title: `{metric:${comparison.metric}}` }));
}

export interface PageHead {
  /** The public address of the site, for the canonical link and the link preview. */
  url?: string;
  /** The preview image, relative to the site, with its text alternative. */
  previewImage?: { path: string; alt: string; width: number; height: number };
  description: string;
  /** The same answer in parts, each claim with the tone of its verdict. */
  answer: AnswerPart[];
}

/**
 * Before the first paint: the theme the reader chose last time, and whether the page may move.
 * Revealing waits for the script; a stylesheet rule shows everything anyway if the script never runs.
 */
const HEAD_SCRIPT = `(() => { const root = document.documentElement; try { const theme = localStorage.getItem("astrolabe-theme"); if (theme === "light" || theme === "dark") root.dataset.theme = theme; } catch {} if (!matchMedia("(prefers-reduced-motion: reduce)").matches) root.classList.add("motion"); })();`;

function headHtml(benchmark: Benchmark, head: PageHead): string {
  const title = benchmark.results.benchmark.goal;
  const absolute = (path: string) => new URL(path, head.url!.endsWith("/") ? head.url : `${head.url}/`).toString();
  const colourScheme = benchmark.style?.mode === "light" || benchmark.style?.mode === "dark" ? benchmark.style.mode : "light dark";
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
    `<meta name="color-scheme" content="${colourScheme}">`,
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

const SUN_ICON =
  '<svg class="when-dark" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/></svg>';
const MOON_ICON =
  '<svg class="when-light" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.6A5.5 5.5 0 016.4 2.5a5.5 5.5 0 107.1 7.1z"/></svg>';

function navHtml(benchmark: Benchmark, rows: Block[][], canSwitchTheme: boolean): string {
  const { results } = benchmark;
  const firstResult = rows.flat().find((block) => !isTrustBlock(block));
  const hasTrust = rows.flat().some(isTrustBlock);
  const links = [
    ...(firstResult ? [`<a href="#${escapeHtml(firstResult.id)}">Results</a>`] : []),
    ...(hasTrust ? ['<a href="#method">Method</a>'] : []),
  ];

  return [
    '<header class="nav">',
    '<div class="frame nav-inner">',
    `<a class="brand" href="#top">${escapeHtml(results.benchmark.id)}<span class="dim">v${escapeHtml(results.benchmark.version)}</span></a>`,
    links.length > 0 ? `<nav class="nav-links" aria-label="Sections">${links.join("")}</nav>` : "",
    canSwitchTheme
      ? `<button class="theme-switch" type="button" data-theme-switch aria-label="Switch between light and dark">${SUN_ICON}${MOON_ICON}</button>`
      : "",
    '<a class="button" href="benchmark.json" download>Download data</a>',
    "</div>",
    "</header>",
  ]
    .filter(Boolean)
    .join("\n");
}

const answerHtml = (parts: AnswerPart[]) =>
  parts
    .map((part) => (part.tone ? `<span class="${part.tone}">${escapeHtml(part.text)}</span>` : escapeHtml(part.text)))
    .join("")
    .trim();

/** A ruler down the left edge that follows the reading, drawn by the script on wide screens. */
const RULER_TICKS = 48;
const rulerHtml = () => `<div class="ruler" aria-hidden="true">${"<i></i>".repeat(RULER_TICKS)}</div>`;

/** The trust blocks that follow one another, as one part: how it was measured, and how to check it. */
function trustSectionHtml(blocks: Block[], inputs: PageInputs, number: string, isFirst: boolean): string {
  return [
    `<section class="trust-section frame"${isFirst ? ' id="method"' : ""}>`,
    '<header class="chapter-head">',
    `<div class="chapter-label">${sectionLabel(number, "How it was measured")}</div>`,
    '<h2>Method and evidence. <span class="reading">What was measured, what was declared, and how to check every number.</span></h2>',
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

/** The whole page: the question and its answer, the parts in order with every filter state rendered in advance, the evidence. */
export function renderPage(inputs: Omit<PageInputs, "lookup">, head: PageHead): string {
  const { benchmark } = inputs;
  const lookup = lookupOf(benchmark.results);
  const pageInputs = { ...inputs, lookup };
  const results = benchmark.results;
  const provenance = provenanceParts(benchmark, inputs.context);
  const rows = pageRowsOf(benchmark);
  let count = 0;
  const nextNumber = () => String(++count).padStart(2, "0");
  const sections: string[] = [];
  let trustRun: Block[] = [];
  let trustSections = 0;
  const closeTrustRun = () => {
    if (trustRun.length === 0) return;

    sections.push(trustSectionHtml(trustRun, pageInputs, nextNumber(), trustSections++ === 0));
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

    const headlines = row.filter((block) => block.type === "headline");

    if (headlines.length > 0)
      sections.push(
        [
          `<section class="stats frame" style="--columns: ${headlines.length}">`,
          ...headlines.map(
            (block) =>
              `<article class="block stat headline" id="${escapeHtml(block.id)}">\n${blockHtml(block, pageInputs, 0, nextNumber())}\n</article>`,
          ),
          "</section>",
        ].join("\n"),
      );

    for (const block of row.filter((entry) => entry.type !== "headline"))
      sections.push(
        `<section class="block chapter ${escapeHtml(block.type)} frame" id="${escapeHtml(block.id)}">\n${blockHtml(block, pageInputs, CHAPTER_FIGURE_WIDTH, nextNumber())}\n</section>`,
      );
  }

  closeTrustRun();

  const ciRun = provenance.continuousIntegration;
  const commit = ciRun ? `commit ${escapeHtml(ciRun.commit)}` : undefined;
  const footerLine = [
    linkedIfAddress(provenance.source),
    `results ${escapeHtml(provenance.hash)}`,
    ...(commit ? [ciRun?.runUrl ? `<a href="${escapeHtml(ciRun.runUrl)}">${commit}</a>` : commit] : []),
    ...downloadLinksOf(pageInputs),
    ...(provenance.attribution ? [`<a href="${ASTROLABE_REPOSITORY}">Built with Astrolabe</a>`] : []),
  ].map((part) => `<span>${part}</span>`);
  const claims = head.answer.filter((part) => !part.aside);
  const aside = head.answer.filter((part) => part.aside);
  const lede = [escapeHtml(results.benchmark.scope ?? ""), answerHtml(aside)].filter(Boolean).join(" ");

  return [
    "<!doctype html>",
    '<html lang="en">',
    headHtml(benchmark, head),
    "<body>",
    rulerHtml(),
    navHtml(benchmark, rows, inputs.modes.length > 1),
    '<main id="top">',
    '<section class="hero frame">',
    `<p class="mono-label"><span class="tick-mark" aria-hidden="true"></span>Benchmark<span class="dim"> · </span>updated ${escapeHtml(provenance.date)}<span class="dim"> · </span>baseline ${escapeHtml(lookup.candidateName.get(results.baseline)!)}</p>`,
    `<h1><span class="question">${escapeHtml(results.benchmark.goal)}</span> <span class="answer">${answerHtml(claims)}</span></h1>`,
    lede ? `<p class="lede">${lede}</p>` : "",
    "</section>",
    ...sections,
    "</main>",
    `<footer class="footer frame"${provenanceBlock ? ` id="${escapeHtml(provenanceBlock.id)}"` : ""}>`,
    `<p class="mono-label">${footerLine.join("")}</p>`,
    ...(provenanceBlock ? [verificationHtml(pageInputs)] : []),
    "</footer>",
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}
