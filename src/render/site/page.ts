import type { Benchmark } from "../../schema/benchmark.js";
import { TRUST_BLOCK_TYPES, type Block } from "../../schema/presentation.js";
import { MAX_HEADLINES } from "../card.js";
import { lookupOf, provenanceParts } from "../describe.js";
import { blockHtml, type PageInputs } from "./blocks.js";
import { COLUMN_GAP, PAGE_WIDTH, PANEL_PADDING } from "./page-style.js";
import { escapeHtml } from "./html.js";

const ASTROLABE_REPOSITORY = "https://github.com/mavdol/astrolabe";

const HEADLINES_PER_ROW = 2;

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
        block.type === "headline" && lastRow?.every((entry) => entry.type === "headline") && lastRow.length < HEADLINES_PER_ROW;

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

/** How each kind of block is framed: headlines as stat cells, charts and tables as panels, words in the reading column. */
function frameOf(block: Block): string {
  if (block.type === "headline") return "stat";

  if (block.type === "chart" || block.type === "table") return "panel";

  return isTrustBlock(block) ? "trust" : "prose";
}

export interface PageHead {
  /** The public address of the site, for the canonical link and the link preview. */
  url?: string;
  /** The preview image, relative to the site, with its text alternative. */
  previewImage?: { path: string; alt: string; width: number; height: number };
  description: string;
}

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
    '<link rel="stylesheet" href="page.css">',
    '<script src="page.js" defer></script>',
    "</head>",
  ].join("\n");
}

/** The whole page: the question and its answer, the blocks row by row with every filter state rendered in advance, the provenance. */
export function renderPage(inputs: Omit<PageInputs, "lookup">, head: PageHead): string {
  const { benchmark } = inputs;
  const lookup = lookupOf(benchmark.results);
  const pageInputs = { ...inputs, lookup };
  const results = benchmark.results;
  const provenance = provenanceParts(benchmark, inputs.context);
  const rowsHtml = pageRowsOf(benchmark).map((row) => {
    const columnWidth = (PAGE_WIDTH - (row.length - 1) * COLUMN_GAP) / row.length;
    const blocks = row.map(
      (block) =>
        `<section class="block ${frameOf(block)} ${escapeHtml(block.type)}" id="${escapeHtml(block.id)}">\n${blockHtml(block, pageInputs, Math.floor(columnWidth - 2 - 2 * PANEL_PADDING))}\n</section>`,
    );
    const isStatRow = row.every((block) => block.type === "headline");

    return `<div class="row${isStatRow ? " stats" : ""}"${row.length > 1 ? ` style="--columns: ${row.length}"` : ""}>\n${blocks.join("\n")}\n</div>`;
  });
  const footer = [
    provenance.source.replace(/^https?:\/\//, ""),
    `results ${provenance.hash}`,
    provenance.date,
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
  ]
    .map(escapeHtml)
    .concat(provenance.attribution ? [`<a href="${ASTROLABE_REPOSITORY}">Built with Astrolabe</a>`] : [])
    .join(" · ");

  return [
    "<!doctype html>",
    '<html lang="en">',
    headHtml(benchmark, head),
    "<body>",
    '<header class="top-bar"><div class="top-bar-inner">',
    `<span class="label">Benchmark · ${escapeHtml(results.benchmark.id)}</span>`,
    '<a class="label" href="benchmark.json">Download the data</a>',
    "</div></header>",
    "<main>",
    '<section class="hero">',
    `<p class="label">Version ${escapeHtml(results.benchmark.version)} · updated ${escapeHtml(provenance.date)} · baseline ${escapeHtml(lookup.candidateName.get(results.baseline)!)}</p>`,
    `<h1>${escapeHtml(results.benchmark.goal)}</h1>`,
    results.benchmark.scope ? `<p class="lede">${escapeHtml(results.benchmark.scope)}</p>` : "",
    `<p class="answer">${escapeHtml(head.description)}</p>`,
    "</section>",
    ...rowsHtml,
    "</main>",
    `<footer><div class="footer-inner"><p class="label">${footer}</p></div></footer>`,
    "</body>",
    "</html>",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .concat("\n");
}
