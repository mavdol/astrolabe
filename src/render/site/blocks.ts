import type { RawFile } from "../../compute/raw-data.js";
import { resultsHash } from "../../compute/files.js";
import type { Benchmark } from "../../schema/benchmark.js";
import type { Block, ChartBlock, HeadlineBlock, TableBlock } from "../../schema/presentation.js";
import type { Mode } from "../../themes/astrolabe.js";
import { detailsOf, isFirmVerdict, measuredOf, pairOf } from "../card.js";
import { ChartError, defaultFilterState, filterStatesOf, nodesOf, type FilterState } from "../chart/chart-data.js";
import { renderChart, type RenderedChart } from "../chart/render-chart.js";
import {
  effectAndInterval,
  finestDecimals,
  provenanceParts,
  resolveTemplates,
  STATISTIC_WORD,
  valueDecimals,
  verdictLabel,
  type BuildContext,
  type Lookup,
} from "../describe.js";
import {
  candidateEntries,
  COMPARISON_HEADER,
  comparisonRows,
  comparisonsIntro,
  environmentLines,
  EXPLORATORY_INTRO,
  failuresCell,
  methodLines,
} from "../method-facts.js";
import { formatInterval, formatNumber } from "../number-format.js";
import { escapeHtml, listOf, paragraphsOf, tableOf, withLinks } from "./html.js";

export interface PageInputs {
  benchmark: Benchmark;
  lookup: Lookup;
  context: BuildContext;
  rawFiles: Record<string, RawFile>;
  modes: Mode[];
  /** Where each raw file is copied in the site, by raw file id. */
  evidencePaths: Map<string, string>;
}

/** Below this width a chart is drawn again for phones rather than shrunk. */
export const NARROW_WIDTH = 340;

const stateKey = (filterIds: string[], state: FilterState) => filterIds.map((filterId) => `${filterId}=${state[filterId]}`).join("&");
const isDefault = (state: FilterState, defaults: FilterState) =>
  Object.entries(state).every(([filterId, option]) => defaults[filterId] === option);

/**
 * Every state a block can be seen in, each a view of its own: the default one shown, the others hidden
 * until the reader picks them. Without the script the page still shows the default state.
 */
function viewsOf(block: Block & { filters?: string[] }, inputs: PageInputs, viewOf: (state: FilterState) => string): string {
  const filterIds = block.filters ?? [];
  const defaults = defaultFilterState(inputs.benchmark);

  if (filterIds.length === 0) return viewOf(defaults);

  const views = filterStatesOf(block, inputs.benchmark, inputs.lookup).map(
    (state) =>
      `<div data-state="${escapeHtml(stateKey(filterIds, state))}"${isDefault(state, defaults) ? "" : " hidden"}>\n${viewOf(state)}\n</div>`,
  );

  return `<div data-filters="${escapeHtml(filterIds.join(" "))}">\n${views.join("\n")}\n</div>`;
}

const anchoredTitle = (block: Block, title: string) =>
  `<h2 id="${escapeHtml(block.id)}-title"><a href="#${escapeHtml(block.id)}">${escapeHtml(title)}</a></h2>`;

function headlineHtml(block: HeadlineBlock, inputs: PageInputs): string {
  const { lookup } = inputs;
  const comparison = (lookup.results.comparisons ?? []).find((entry) => entry.id === block.comparison)!;
  const metric = lookup.metricById.get(comparison.metric)!;
  const title = resolveTemplates(block.title, lookup);
  const measured = measuredOf(lookup, comparison);
  const details = detailsOf(lookup, comparison, null).map(
    (detail) => `<li${detail.isWarning ? ' class="warning"' : ""}>${detail.isWarning ? "Warning: " : ""}${escapeHtml(detail.text)}</li>`,
  );

  return [
    `<p class="pair">${escapeHtml(pairOf(lookup, comparison))}</p>`,
    anchoredTitle(block, title),
    `<p class="measured">${escapeHtml([title === measured ? "" : measured, metric.direction === "lower" ? "lower is better" : "higher is better"].filter(Boolean).join(" · "))}</p>`,
    `<p class="effect"><span class="figure">${escapeHtml(effectAndInterval(metric, comparison).effect)}</span>`,
    `<span class="verdict${isFirmVerdict(comparison) ? " firm" : ""}">${escapeHtml(verdictLabel(comparison))}</span></p>`,
    `<ul class="details">\n${details.join("\n")}\n</ul>`,
  ].join("\n");
}

interface DrawnView {
  mode: Mode;
  width: "wide" | "narrow" | "any";
  chart: RenderedChart;
}

function chartViewsOf(block: ChartBlock, inputs: PageInputs, width: number, state: FilterState): DrawnView[] {
  const draw = (mode: Mode, chartWidth: number) =>
    renderChart(
      inputs.benchmark,
      block,
      { width: chartWidth, mode, filterState: state, standalone: false, plotOnly: true, rawFiles: inputs.rawFiles },
      inputs.context,
    );
  const tryDrawing = (mode: Mode, chartWidth: number) => {
    try {
      return draw(mode, chartWidth);
    } catch (failure) {
      if (failure instanceof ChartError) return undefined;

      throw failure;
    }
  };

  return inputs.modes.flatMap((mode): DrawnView[] => {
    const wide = tryDrawing(mode, width) ?? draw(mode, Math.max(width, 640));
    const narrow = width > NARROW_WIDTH ? tryDrawing(mode, NARROW_WIDTH) : undefined;

    return narrow
      ? [
          { mode, width: "wide", chart: wide },
          { mode, width: "narrow", chart: narrow },
        ]
      : [{ mode, width: "any", chart: wide }];
  });
}

function chartHtml(block: ChartBlock, inputs: PageInputs, width: number): string {
  const first = chartViewsOf(block, inputs, width, defaultFilterState(inputs.benchmark))[0].chart;
  const view = (state: FilterState) => {
    const drawn = chartViewsOf(block, inputs, width, state);
    const { chart } = drawn[0];
    const byMode = inputs.modes.map((mode) => {
      const ofMode = drawn.filter((entry) => entry.mode === mode);
      const pictures = ofMode.map((entry) =>
        entry.width === "any" ? entry.chart.svg : `<div data-width="${entry.width}">${entry.chart.svg}</div>`,
      );

      return inputs.modes.length > 1 ? `<div data-mode="${mode}">${pictures.join("")}</div>` : pictures.join("");
    });

    return [
      "<figure>",
      `<p class="subtitle">${escapeHtml(chart.subtitle)}</p>`,
      ...byMode,
      `<figcaption class="how-to-read">${escapeHtml(chart.howToRead)}</figcaption>`,
      '<details class="data"><summary>Data and description</summary>',
      `<p>${escapeHtml(chart.description)}</p>`,
      tableOf(chart.table.header, chart.table.rows),
      "</details>",
      "</figure>",
    ].join("\n");
  };

  return [
    anchoredTitle(block, first.title),
    first.reading ? `<p class="reading">${escapeHtml(first.reading)}</p>` : "",
    viewsOf(block, inputs, view),
  ]
    .filter(Boolean)
    .join("\n");
}

function tableHtml(block: TableBlock, inputs: PageInputs): string {
  const { lookup, benchmark } = inputs;
  const show = new Set(block.show);
  const candidates = lookup.results.candidates;
  const view = (state: FilterState) =>
    block.metrics
      .map((metricId) => {
        const metric = lookup.metricById.get(metricId)!;
        const nodes = nodesOf({ id: block.id, node: block.node, breakdown: block.rows, filters: block.filters }, benchmark, lookup, state);
        const values = (lookup.results.values ?? []).filter((value) => value.metric === metricId && nodes.includes(value.node));
        const decimals = finestDecimals(values.map((value) => valueDecimals(metric, value)));
        const rows = nodes.map((node) => [
          node === undefined ? metric.label : (lookup.nodeLabel.get(node) ?? node),
          ...candidates.map((candidate) => {
            const value = values.find((entry) => entry.node === node && entry.candidate === candidate.id);

            if (!value) return "—";

            const parts = [`${formatNumber(value.value, decimals)}${value.source === "declared" ? " (declared)" : ""}`];

            if (show.has("ci") && value.ci) parts.push(formatInterval(value.ci, decimals));

            if (show.has("n") && value.n !== undefined) parts.push(`n = ${value.n}`);

            if (show.has("failures") && value.source !== "declared") parts.push(`failed: ${failuresCell(lookup, value)}`);

            if (show.has("evidence") && value.evidence) parts.push(value.evidence);

            return parts;
          }),
        ]);
        const caption = `${metric.label}, ${STATISTIC_WORD[metric.statistic].toLowerCase()} in ${metric.unit} · ${metric.direction === "lower" ? "lower is better" : "higher is better"}`;
        const header = [
          block.rows ? block.rows.charAt(0).toUpperCase() + block.rows.slice(1) : "",
          ...candidates.map((candidate) => `${candidate.name}${candidate.id === lookup.results.baseline ? " (baseline)" : ""}`),
        ];

        return tableOf(header, rows, caption);
      })
      .join("\n");

  return [block.title ? anchoredTitle(block, resolveTemplates(block.title, lookup)) : "", viewsOf(block, inputs, view)]
    .filter(Boolean)
    .join("\n");
}

function textHtml(block: Extract<Block, { type: "text" }>, inputs: PageInputs): string {
  return [
    block.title ? anchoredTitle(block, resolveTemplates(block.title, inputs.lookup)) : "",
    paragraphsOf(resolveTemplates(block.description, inputs.lookup)),
  ]
    .filter(Boolean)
    .join("\n");
}

function methodologyHtml(block: Block, inputs: PageInputs): string {
  const { lookup } = inputs;
  const comparisons = lookup.results.comparisons ?? [];
  const exploratory = comparisons.filter((comparison) => comparison.role === "exploratory");
  const candidates = candidateEntries(lookup).map((entry) =>
    [
      `<h4>${escapeHtml(entry.name)}${entry.isBaseline ? " (baseline)" : ""}, version ${escapeHtml(entry.version)}</h4>`,
      listOf(entry.lines),
    ].join("\n"),
  );

  return [
    anchoredTitle(block, "Method"),
    listOf(methodLines(lookup)),
    `<h3>Against ${escapeHtml(lookup.candidateName.get(lookup.results.baseline)!)}</h3>`,
    `<p>${escapeHtml(comparisonsIntro(lookup))}</p>`,
    tableOf(
      COMPARISON_HEADER,
      comparisonRows(
        lookup,
        comparisons.filter((comparison) => comparison.role === "primary"),
      ),
    ),
    ...(exploratory.length > 0
      ? [
          "<h3>Exploratory comparisons</h3>",
          `<p>${escapeHtml(EXPLORATORY_INTRO)}</p>`,
          tableOf(COMPARISON_HEADER, comparisonRows(lookup, exploratory)),
        ]
      : []),
    "<h3>Candidates</h3>",
    "<p>Declared by the author.</p>",
    ...candidates,
  ].join("\n");
}

function provenanceHtml(block: Block, inputs: PageInputs): string {
  const { benchmark, context } = inputs;
  const provenance = provenanceParts(benchmark, context);
  const ciRun = provenance.continuousIntegration;
  const evidence = [
    `<li><a href="benchmark.json">benchmark.json</a>: the plan, the results and this page's presentation</li>`,
    ...benchmark.results.raw_data.flatMap((raw) => {
      const path = inputs.evidencePaths.get(raw.id);

      return path
        ? [
            `<li><a href="${escapeHtml(path)}">${escapeHtml(path)}</a>: ${raw.rows ?? "?"} rows, sha256 <code>${escapeHtml(raw.sha256 ?? "")}</code></li>`,
          ]
        : [];
    }),
  ];

  return [
    anchoredTitle(block, "Provenance"),
    "<ul>",
    `<li>Results sha256: <code>${resultsHash(benchmark.results)}</code></li>`,
    `<li>Built on ${escapeHtml(provenance.date)} with astrolabe-bench ${escapeHtml(context.generatorVersion)}</li>`,
    `<li>Source: ${withLinks(provenance.source)}</li>`,
    ...(ciRun
      ? [`<li>Commit ${escapeHtml(ciRun.commit)}${ciRun.runUrl ? `, <a href="${escapeHtml(ciRun.runUrl)}">CI run</a>` : ""}</li>`]
      : []),
    "</ul>",
    "<h3>Check it yourself</h3>",
    listOf([
      "Download the file and its raw data, keep them in the same folders, and run npx astrolabe-bench validate benchmark.json: it computes every number again and prints the hash above.",
    ]),
    `<ul>\n${evidence.join("\n")}\n</ul>`,
  ].join("\n");
}

/** The inside of one block, in the order the reader meets it. */
export function blockHtml(block: Block, inputs: PageInputs, width: number): string {
  switch (block.type) {
    case "headline":
      return headlineHtml(block, inputs);
    case "chart":
      return chartHtml(block, inputs, width);
    case "table":
      return tableHtml(block, inputs);
    case "text":
      return textHtml(block, inputs);
    case "methodology":
      return methodologyHtml(block, inputs);
    case "environment":
      return [anchoredTitle(block, "Environment"), listOf(environmentLines(inputs.lookup.results.environment))].join("\n");
    case "limitations":
      return [anchoredTitle(block, "Limitations"), listOf(inputs.lookup.results.limitations)].join("\n");
    case "provenance":
      return provenanceHtml(block, inputs);
  }
}
