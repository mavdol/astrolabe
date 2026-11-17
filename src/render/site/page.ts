import type { Benchmark } from "../../schema/benchmark.js";
import { TRUST_BLOCK_TYPES, type Block } from "../../schema/presentation.js";
import { MAX_HEADLINES } from "../card.js";
import { optionsOf, EVERY_OPTION } from "../chart/chart-data.js";
import { lookupOf, provenanceParts } from "../describe.js";
import { blockHtml, type PageInputs } from "./blocks.js";
import { escapeHtml } from "./html.js";

/** The width of the page's content, in the px the charts are drawn in. */
export const CONTENT_WIDTH = 720;
const GAP_BETWEEN_COLUMNS = 32;
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

  return rows.filter((row) => row.length > 0);
}

/** A file with no presentation still answers its question: its first primary comparisons, as on the default README card. */
function defaultBlocksOf(benchmark: Benchmark): Block[] {
  return (benchmark.results.comparisons ?? [])
    .filter((comparison) => comparison.role === "primary")
    .slice(0, MAX_HEADLINES)
    .map((comparison) => ({ id: comparison.id, type: "headline", comparison: comparison.id, title: `{metric:${comparison.metric}}` }));
}

const filtersOf = (block: Block) => ("filters" in block ? (block.filters ?? []) : []);

function filterBarHtml(benchmark: Benchmark, rows: Block[][], inputs: PageInputs): string {
  const listenedTo = new Set(rows.flat().flatMap(filtersOf));
  const fieldsets = (benchmark.filters ?? [])
    .filter((filter) => listenedTo.has(filter.id))
    .map((filter) => {
      const options = optionsOf(filter, inputs.lookup).map((option) => {
        const label = option === EVERY_OPTION ? "All" : (inputs.lookup.nodeLabel.get(option) ?? option);

        return `<label><input type="radio" name="${escapeHtml(filter.id)}" value="${escapeHtml(option)}"${option === filter.default ? " checked" : ""}> ${escapeHtml(label)}</label>`;
      });

      return `<fieldset><legend>${escapeHtml(filter.label)}</legend>\n${options.join("\n")}\n</fieldset>`;
    });

  return fieldsets.length > 0 ? `<form class="filters" data-filter-bar hidden aria-label="Filters">\n${fieldsets.join("\n")}\n</form>` : "";
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
    '<script src="filters.js" defer></script>',
    "</head>",
  ].join("\n");
}

/** The whole page: the question, the blocks row by row, every filter state rendered in advance, and the provenance. */
export function renderPage(inputs: Omit<PageInputs, "lookup">, head: PageHead): string {
  const { benchmark } = inputs;
  const lookup = lookupOf(benchmark.results);
  const pageInputs = { ...inputs, lookup };
  const results = benchmark.results;
  const rows = pageRowsOf(benchmark);
  const filterBar = filterBarHtml(benchmark, rows, pageInputs);
  const firstFilteredRow = rows.findIndex((row) => row.some((block) => filtersOf(block).length > 0));
  const provenance = provenanceParts(benchmark, inputs.context);
  const rowsHtml = rows.map((row, rowIndex) => {
    const width = Math.floor((CONTENT_WIDTH - (row.length - 1) * GAP_BETWEEN_COLUMNS) / row.length);
    const blocks = row.map(
      (block) =>
        `<section class="block ${escapeHtml(block.type)}${isTrustBlock(block) ? " trust" : ""}" id="${escapeHtml(block.id)}">\n${blockHtml(block, pageInputs, width)}\n</section>`,
    );
    const rowHtml = `<div class="row"${row.length > 1 ? ` style="--columns: ${row.length}"` : ""}>\n${blocks.join("\n")}\n</div>`;

    return rowIndex === firstFilteredRow && filterBar ? `${filterBar}\n${rowHtml}` : rowHtml;
  });
  const footer = [
    provenance.source.replace(/^https?:\/\//, ""),
    `results ${provenance.hash}`,
    provenance.date,
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
    `astrolabe-bench ${inputs.context.generatorVersion}`,
    ...(provenance.attribution ? ["Built with Astrolabe"] : []),
  ].join(" · ");

  return [
    "<!doctype html>",
    '<html lang="en">',
    headHtml(benchmark, head),
    "<body>",
    "<main>",
    '<header class="page-header">',
    `<p class="eyebrow">Benchmark ${escapeHtml(results.benchmark.id)}, version ${escapeHtml(results.benchmark.version)} · baseline ${escapeHtml(lookup.candidateName.get(results.baseline)!)}</p>`,
    `<h1>${escapeHtml(results.benchmark.goal)}</h1>`,
    results.benchmark.scope ? `<p>${escapeHtml(results.benchmark.scope)}</p>` : "",
    "</header>",
    ...rowsHtml,
    "</main>",
    `<footer><p>${escapeHtml(footer)}</p></footer>`,
    "</body>",
    "</html>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .concat("\n");
}
