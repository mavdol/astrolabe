import type { RawFile } from "../../compute/raw-data.js";
import type { Benchmark, Comparison } from "../../schema/benchmark.js";
import type { Block, ChartBlock, HeadlineBlock, TableBlock } from "../../schema/presentation.js";
import type { Mode } from "../../themes/astrolabe.js";
import { detailsOf, isFirmVerdict, measuredOf, pairOf } from "../card.js";
import {
  ChartError,
  defaultFilterState,
  EVERY_OPTION,
  filterOf,
  filterStatesOf,
  nodesOf,
  optionsOf,
  type FilterState,
} from "../chart/chart-data.js";
import { asSentence, capitalised, keyMarkOf, type KeyPaint } from "../chart/chart-content.js";
import { renderChart, type RenderedChart } from "../chart/render-chart.js";
import {
  effectAndInterval,
  finestDecimals,
  lowerFirstLetterOfWord,
  resolveTemplates,
  STATISTIC_WORD,
  valueDecimals,
  verdictLabel,
  type BuildContext,
  type Lookup,
} from "../describe.js";
import {
  candidateEntries,
  comparisonRows,
  comparisonsIntro,
  environmentLines,
  EXPLORATORY_INTRO,
  failuresCell,
  methodLines,
} from "../method-facts.js";
import { formatInterval, formatLevel, formatNumber } from "../number-format.js";
import { headlineFigure, toneOf } from "./headline-figure.js";
import { escapeHtml, paragraphsOf, tableOf, withLinks } from "./html.js";

export interface PageInputs {
  benchmark: Benchmark;
  lookup: Lookup;
  context: BuildContext;
  rawFiles: Record<string, RawFile>;
  modes: Mode[];
  /** Where each raw file is copied in the site, by raw file id. */
  evidencePaths: Map<string, string>;
  /** The short name of each part of the page, by block id, written above its claim and in the ruler. */
  sectionLabels: Map<string, string>;
}

/** Below this width a chart is drawn again for phones rather than shrunk. */
export const NARROW_WIDTH = 320;

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

/** The small line above a part: its number on the page and what it is about. */
export const sectionLabel = (number: string, text: string) =>
  `<p class="mono-label"><span class="tick-mark" aria-hidden="true"></span>${escapeHtml(number)}<span class="dim"> / </span>${escapeHtml(text)}</p>`;

const directionWords = (direction: string) => (direction === "lower" ? "lower is better" : "higher is better");

/** The figure in its two parts, so the page can count up to the number and keep the unit still. */
function figureHtml(effectNumber: string, unit: string, tone: string): string {
  const digits = effectNumber.replace(/[^\d.]/g, "");
  const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
  const value = Number(digits) * (/^[−-]/.test(effectNumber) ? -1 : 1);
  const counted = Number.isFinite(value) && /^[+−-]?[\d.,]+$/.test(effectNumber);

  return `<p class="figure ${tone}"><span${counted ? ` data-count="${value}" data-decimals="${decimals}"` : ""}>${escapeHtml(effectNumber)}</span><small${unit.trim() === "%" ? ' class="percent"' : ""}>${escapeHtml(unit.trim())}</small></p>`;
}

function headlineHtml(block: HeadlineBlock, inputs: PageInputs, number: string): string {
  const { lookup } = inputs;
  const comparison = (lookup.results.comparisons ?? []).find((entry) => entry.id === block.comparison)!;
  const metric = lookup.metricById.get(comparison.metric)!;
  const title = resolveTemplates(block.title, lookup);
  const measured = measuredOf(lookup, comparison);
  const pair = pairOf(lookup, comparison);
  const { effectNumber, unit } = effectAndInterval(metric, comparison);
  const tone = toneOf(comparison);
  const details = detailsOf(lookup, comparison, null).map(
    (detail) => `<li${detail.isWarning ? ' class="warning"' : ""}>${detail.isWarning ? "Warning: " : ""}${escapeHtml(detail.text)}</li>`,
  );

  return [
    sectionLabel(number, `${measured} · ${directionWords(metric.direction)}`),
    '<div class="figure-row">',
    figureHtml(effectNumber, unit, tone),
    `<span class="chip ${tone}${isFirmVerdict(comparison) ? " firm" : ""}">${escapeHtml(verdictLabel(comparison))}</span>`,
    "</div>",
    headlineFigure(lookup, comparison),
    anchoredTitle(block, title === measured ? pair : title),
    `<ul class="details">\n${[...(title === measured ? [] : [`<li>${escapeHtml(pair)}</li>`]), ...details].join("\n")}\n</ul>`,
  ].join("\n");
}

const optionLabel = (option: string, inputs: PageInputs) =>
  option === EVERY_OPTION ? "All" : (inputs.lookup.nodeLabel.get(option) ?? option);

/**
 * The block's own filters, as segmented controls under its claim. Without the script they stay hidden
 * and a line says which state is shown; with it, every control of a filter moves together.
 */
function filtersOf(block: Block & { filters?: string[] }, inputs: PageInputs): string {
  const filterIds = block.filters ?? [];

  if (filterIds.length === 0) return "";

  const controls = filterIds.map((filterId) => {
    const filter = filterOf(inputs.benchmark, filterId, block.id);
    const options = optionsOf(filter, inputs.lookup).map(
      (option) =>
        `<label><input type="radio" name="${escapeHtml(`${block.id}--${filterId}`)}" value="${escapeHtml(option)}" data-filter="${escapeHtml(filterId)}"${option === filter.default ? " checked" : ""}><span>${escapeHtml(optionLabel(option, inputs))}</span></label>`,
    );

    return [
      `<span class="label" data-static-state>${escapeHtml(filter.label)}: ${escapeHtml(optionLabel(filter.default, inputs))}</span>`,
      `<fieldset class="segmented" data-filter="${escapeHtml(filterId)}" hidden><legend class="label">${escapeHtml(filter.label)}</legend>`,
      '<span class="track">',
      ...options,
      "</span>",
      "</fieldset>",
    ].join("\n");
  });

  return `<div class="chapter-tools">\n${controls.join("\n")}\n</div>`;
}

const iconOf = (className: string, path: string) =>
  `<svg class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const LINK_ICON = iconOf("ready", "M6.5 9.5l3-3M7 4.5l1.2-1.2a2.8 2.8 0 014 4L11 8.5M9 11.5l-1.2 1.2a2.8 2.8 0 01-4-4L5 7.5");
const COPIED_ICON = iconOf("done", "M3.5 8.5l3 3 6-7");

const copyLinkOf = (block: Block) =>
  `<a class="icon-button" href="#${escapeHtml(block.id)}" data-copy-link>${LINK_ICON}${COPIED_ICON}<span class="visually-hidden" data-copy-status>Copy a link to this part</span></a>`;

/** True when every comparison a chart draws, in any of its filter states, is exploratory. */
function showsOnlyExploratory(block: ChartBlock, inputs: PageInputs): boolean {
  const { benchmark, lookup } = inputs;
  const comparisons = lookup.results.comparisons ?? [];
  const drawn =
    block.chart === "comparison-rows"
      ? comparisons.filter((comparison) => (block.comparisons ?? []).includes(comparison.id))
      : block.chart === "effect"
        ? (() => {
            const nodes = new Set(filterStatesOf(block, benchmark, lookup).flatMap((state) => nodesOf(block, benchmark, lookup, state)));

            return comparisons.filter((comparison) => comparison.metric === block.metric && nodes.has(comparison.node));
          })()
        : [];

  return drawn.length > 0 && drawn.every((comparison) => comparison.role === "exploratory");
}

interface SectionName {
  /** The few words a reader navigates by: "By task". */
  short: string;
  /** The same with its measure, when another part has the same short name: "Accuracy by task". */
  full: string;
}

function sectionNameOf(block: Block, inputs: PageInputs): SectionName | undefined {
  const { lookup } = inputs;
  const metricLabel = (metricId: string | undefined) => (metricId ? (lookup.metricById.get(metricId)?.label ?? metricId) : "");
  const baseline = lookup.candidateName.get(lookup.results.baseline);
  const same = (name: string) => ({ short: name, full: name });

  switch (block.type) {
    case "chart": {
      if (block.chart === "scatter") return same(`${metricLabel(block.y)} against ${lowerFirstLetterOfWord(metricLabel(block.x))}`);

      const exploratory = showsOnlyExploratory(block, inputs) ? " · exploratory" : "";

      if (block.chart === "comparison-rows") return same(`Against ${baseline}${exploratory}`);

      const metric = metricLabel(block.metric);

      if (block.breakdown) return { short: `By ${block.breakdown}${exploratory}`, full: `${metric} by ${block.breakdown}${exploratory}` };

      return same(`${metric}${block.chart === "effect" ? ` against ${baseline}` : ""}${exploratory}`);
    }
    case "table":
      return {
        short: "The numbers",
        full: `The numbers · ${block.metrics.map((metricId) => lowerFirstLetterOfWord(metricLabel(metricId))).join(", ")}`,
      };
    case "text":
      return same(block.title ? resolveTemplates(block.title, lookup) : "Note");
    default:
      return undefined;
  }
}

/**
 * The name of each chapter of the page, as short as the page allows: "By task", unless another chapter
 * is also by task, when both name their measure. The same names label the ruler.
 */
export function sectionLabelsOf(blocks: Block[], inputs: Omit<PageInputs, "sectionLabels">): Map<string, string> {
  const names = blocks.flatMap((block) => {
    const name = sectionNameOf(block, { ...inputs, sectionLabels: new Map() });

    return name ? [{ id: block.id, ...name }] : [];
  });
  const shortCounts = new Map<string, number>();

  for (const name of names) shortCounts.set(name.short, (shortCounts.get(name.short) ?? 0) + 1);

  return new Map(names.map((name) => [name.id, shortCounts.get(name.short)! > 1 ? name.full : name.short]));
}

/** The left column of a chapter: its number and subject, its claim with the reading after it, its filters. */
function chapterHead(block: Block, inputs: PageInputs, number: string, label: string, title: string, reading: string): string {
  return [
    '<header class="chapter-head">',
    `<div class="chapter-label">${sectionLabel(number, label)}${copyLinkOf(block)}</div>`,
    `<h2 id="${escapeHtml(block.id)}-title"><a href="#${escapeHtml(block.id)}">${escapeHtml(reading ? asSentence(title) : title)}</a>${reading ? ` <span class="reading">${escapeHtml(reading)}</span>` : ""}</h2>`,
    filtersOf(block, inputs),
    "</header>",
  ].join("\n");
}

interface DrawnView {
  mode: Mode;
  width: "wide" | "narrow" | "any";
  chart: RenderedChart;
}

/** Charts on the page are laid out narrower than their column and shown at its width, so their text and marks read larger. */
const PAGE_CHART_ENLARGEMENT = 1.15;

function chartViewsOf(block: ChartBlock, inputs: PageInputs, columnWidth: number, state: FilterState): DrawnView[] {
  const width = Math.round(columnWidth / PAGE_CHART_ENLARGEMENT);
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

const pageKeyPaint: KeyPaint = (role) => (role === "dashed" ? 'class="key-stroke key-dashed"' : `class="key-${role}"`);

/**
 * How to read a chart under it: each mark drawn as it appears, with the few words that say what it is,
 * then the sentences that no mark stands for. The text is the same as the chart's how-to-read line.
 */
function howToReadHtml(chart: RenderedChart): string {
  const parts = (chart.howToReadParts ?? []).filter((part) => part.text);

  if (parts.length === 0) return `<figcaption class="how-to-read">${escapeHtml(chart.howToRead)}</figcaption>`;

  const keyed = parts.filter((part) => part.mark);
  const said = parts.filter((part) => !part.mark).map((part) => part.text);
  const entries = keyed.map(
    (part) =>
      `<li><svg class="key-mark" viewBox="0 0 18 12" aria-hidden="true">${keyMarkOf(part.mark!, pageKeyPaint)}</svg><span><span class="visually-hidden">${escapeHtml(part.markName!)}: </span>${escapeHtml(capitalised(part.text))}</span></li>`,
  );

  return [
    '<figcaption class="how-to-read">',
    `<ul class="chart-key">\n${entries.join("\n")}\n</ul>`,
    said.length > 0 ? `<p>${escapeHtml(said.join(" "))}</p>` : "",
    "</figcaption>",
  ]
    .filter(Boolean)
    .join("\n");
}

function chartHtml(block: ChartBlock, inputs: PageInputs, width: number, number: string): string {
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
      ...byMode,
      howToReadHtml(chart),
      '<details class="chart-data"><summary>Data and description</summary>',
      `<p class="description">${escapeHtml(chart.description)}</p>`,
      tableOf(chart.table.header, chart.table.rows),
      "</details>",
      "</figure>",
    ].join("\n");
  };

  return [
    chapterHead(block, inputs, number, inputs.sectionLabels.get(block.id)!, first.title, first.reading),
    '<div class="chapter-body">',
    viewsOf(block, inputs, view),
    "</div>",
  ].join("\n");
}

/** Where a value and its interval sit on the table's shared scale, in percent of the cell's bar. */
function barPositionsOf(extent: [number, number], value: number, interval: [number, number] | undefined): string {
  const [low, high] = extent;
  const share = (at: number) => (high > low ? Math.round(((at - low) / (high - low)) * 1000) / 10 : 50);
  const [from, to] = interval ? [share(Math.min(...interval)), share(Math.max(...interval))] : [share(value), share(value)];

  return `--from: ${from}%; --to: ${to}%; --at: ${share(value)}%`;
}

function tableHtml(block: TableBlock, inputs: PageInputs, number: string): string {
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
        const ends = values.flatMap((value) => (value.ci && show.has("ci") ? value.ci : [value.value]));
        const padding = (Math.max(...ends) - Math.min(...ends)) * 0.1;
        const extent: [number, number] = [Math.min(...ends) - padding, Math.max(...ends) + padding];
        const header = [
          block.rows ? block.rows.charAt(0).toUpperCase() + block.rows.slice(1) : "",
          ...candidates.map((candidate) => `${candidate.name}${candidate.id === lookup.results.baseline ? " · baseline" : ""}`),
        ];
        const rows = nodes.map((node) => {
          const cells = candidates.map((candidate) => {
            const value = values.find((entry) => entry.node === node && entry.candidate === candidate.id);

            if (!value) return `<td data-candidate="${escapeHtml(candidate.id)}">—</td>`;

            const details: string[] = [];

            if (show.has("n") && value.n !== undefined) details.push(`n = ${value.n}`);

            if (show.has("failures") && value.source !== "declared") details.push(escapeHtml(`${failuresCell(lookup, value)} failed`));

            if (show.has("evidence") && value.evidence) details.push(withLinks(value.evidence));

            const shown = `${formatNumber(value.value, decimals)}${value.source === "declared" ? " (declared)" : ""}`;

            return [
              `<td class="value-cell" data-candidate="${escapeHtml(candidate.id)}">`,
              '<span class="cell-line">',
              `<span class="cell-value">${escapeHtml(shown)}</span>`,
              `<span class="cell-bar${candidate.id === lookup.results.baseline ? " baseline" : ""}" style="${barPositionsOf(extent, value.value, show.has("ci") ? value.ci : undefined)}" aria-hidden="true"></span>`,
              show.has("ci") && value.ci ? `<span class="cell-ci">${escapeHtml(formatInterval(value.ci, decimals))}</span>` : "",
              "</span>",
              details.length > 0 ? `<span class="cell-detail">${details.join(" · ")}</span>` : "",
              "</td>",
            ].join("");
          });

          return `<tr><th scope="row">${escapeHtml(node === undefined ? metric.label : (lookup.nodeLabel.get(node) ?? node))}</th>${cells.join("")}</tr>`;
        });
        const caption = `${metric.label}, ${STATISTIC_WORD[metric.statistic].toLowerCase()} in ${metric.unit} · ${directionWords(metric.direction)}`;

        return [
          '<div class="table-scroll"><table class="value-table">',
          `<caption class="visually-hidden">${escapeHtml(caption)}</caption>`,
          `<thead><tr>${header.map((cell, column) => `<th scope="col"${column > 0 ? ` data-candidate="${escapeHtml(candidates[column - 1].id)}"` : ""}>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`,
          `<tbody>\n${rows.join("\n")}\n</tbody>`,
          "</table></div>",
        ].join("\n");
      })
      .join("\n");
  const body = viewsOf(block, inputs, view);
  const title = block.title
    ? resolveTemplates(block.title, lookup)
    : block.metrics.map((metricId) => lookup.metricById.get(metricId)!.label).join(", ");
  const reading = block.description ? resolveTemplates(block.description, lookup) : "";

  return [
    chapterHead(block, inputs, number, inputs.sectionLabels.get(block.id)!, title, reading),
    '<div class="chapter-body">',
    body,
    "</div>",
  ].join("\n");
}

function textHtml(block: Extract<Block, { type: "text" }>, inputs: PageInputs, number: string): string {
  const title = block.title ? resolveTemplates(block.title, inputs.lookup) : "";

  return [
    chapterHead(block, inputs, number, inputs.sectionLabels.get(block.id)!, title, ""),
    `<div class="chapter-body prose">\n${paragraphsOf(resolveTemplates(block.description, inputs.lookup))}\n</div>`,
  ].join("\n");
}

const pluralOf = (word: string) =>
  /(s|x|sh|ch)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;

interface PipelineStep {
  figure: string;
  unit: string;
  note: string;
}

/** How the measurements were made, as the steps a reader can count: each level, the candidates, the judge, the claims. */
function pipelineOf(lookup: Lookup): PipelineStep[] {
  const { results } = lookup;
  const planned = new Map(results.runs.levels.map((level) => [level.level, level.planned]));
  const primary = (results.comparisons ?? []).filter((comparison) => comparison.role === "primary");
  const levels = (results.observed?.levels ?? []).map((level, index) => ({
    figure: `${index > 0 ? "× " : ""}${level.n_max !== undefined ? `${level.n} to ${level.n_max}` : level.n}`,
    unit: level.n === 1 && level.n_max === undefined ? level.level : pluralOf(level.level),
    note: `planned ${planned.get(level.level) ?? "?"}${index > 0 && results.runs.order ? ` · order ${results.runs.order}` : ""}`,
  }));
  const judge = results.judge;
  const judgeStep: PipelineStep[] = judge
    ? [
        {
          figure: judge.type === "model" ? "1" : judge.type === "participants" ? "Self" : String(judge.raters ?? "?"),
          unit: judge.type === "model" ? "model judge" : judge.type === "participants" ? "ratings by participants" : "human raters",
          note: [
            judge.type === "model" ? (judge.model ?? "") : "",
            judge.blinded ? "blind" : "not blind",
            judge.validation ? `α ${judge.validation.krippendorff_alpha} against humans` : "",
            judge.agreement ? `α ${judge.agreement.krippendorff_alpha} between raters` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ]
    : [];
  const level = primary[0]?.ci_level;

  return [
    ...levels,
    {
      figure: String(results.candidates.length),
      unit: results.candidates.length === 1 ? "candidate" : "candidates",
      note: `baseline ${lookup.candidateName.get(results.baseline)}`,
    },
    ...judgeStep,
    {
      figure: String(primary.length),
      unit: primary.length === 1 ? "claim" : "claims",
      note: [
        "declared before measuring",
        level !== undefined && primary.some((comparison) => comparison.adjusted) ? `${formatLevel(level)}% intervals, held jointly` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

function verdictListOf(lookup: Lookup, comparisons: Comparison[]): string {
  const rows = comparisonRows(lookup, comparisons).map(([subject, effect, interval, verdict, notes], index) =>
    [
      "<li>",
      `<span class="what">${escapeHtml(subject)}</span>`,
      `<span class="effect">${escapeHtml(effect)}</span>`,
      `<span class="interval">${escapeHtml(interval)}</span>`,
      `<span class="chip ${toneOf(comparisons[index])}">${escapeHtml(verdict)}</span>`,
      notes ? `<span class="notes">${escapeHtml(notes)}</span>` : "",
      "</li>",
    ].join(""),
  );

  return `<ul class="verdict-list">\n${rows.join("\n")}\n</ul>`;
}

/** A fact as a label and its text: "Judge: Model C…" becomes a term and its description. */
const factOf = (line: string) => {
  const colon = line.indexOf(": ");

  return colon > 0 ? { term: line.slice(0, colon), text: line.slice(colon + 2) } : { term: "", text: line };
};

const SHOWN_IN_THE_PIPELINE = new Set(["Comparisons", "Observed"]);

function methodologyHtml(block: Block, inputs: PageInputs): string {
  const { lookup } = inputs;
  const comparisons = lookup.results.comparisons ?? [];
  const primary = comparisons.filter((comparison) => comparison.role === "primary");
  const exploratory = comparisons.filter((comparison) => comparison.role === "exploratory");
  const pipeline = pipelineOf(lookup);
  const steps = pipeline.map(
    (step, index) =>
      `<li style="--step: ${index}"><p class="step-figure">${escapeHtml(step.figure)}<small>${escapeHtml(step.unit)}</small></p>${step.note ? `<p class="step-note">${escapeHtml(step.note)}</p>` : ""}${index < pipeline.length - 1 ? '<span class="step-link" aria-hidden="true"></span>' : ""}</li>`,
  );
  const facts = methodLines(lookup)
    .map(factOf)
    .filter((fact) => !SHOWN_IN_THE_PIPELINE.has(fact.term))
    .map((fact) => `<dl class="fact"><dt>${escapeHtml(fact.term)}</dt><dd>${withLinks(fact.text)}</dd></dl>`);
  const candidates = candidateEntries(lookup).map((entry) =>
    [
      '<dl class="fact candidate">',
      `<dt>${escapeHtml(entry.name)}${entry.isBaseline ? " · baseline" : ""}</dt>`,
      `<dd>Version ${escapeHtml(entry.version)}</dd>`,
      ...entry.lines.map((line) => `<dd class="dim">${withLinks(line)}</dd>`),
      "</dl>",
    ].join("\n"),
  );

  return [
    '<h3 class="visually-hidden">Method</h3>',
    `<ol class="pipeline">\n${steps.join("\n")}\n</ol>`,
    '<div class="verdicts">',
    `<p class="mono-label">Against ${escapeHtml(lookup.candidateName.get(lookup.results.baseline)!)}<span class="dim"> · the claims</span></p>`,
    verdictListOf(lookup, primary),
    `<details class="aside"><summary>How a verdict is read</summary><p>${escapeHtml(comparisonsIntro(lookup))}</p></details>`,
    ...(exploratory.length > 0
      ? [
          '<p class="mono-label">Exploratory<span class="dim"> · not claims</span></p>',
          verdictListOf(lookup, exploratory),
          `<p class="aside-note">${escapeHtml(EXPLORATORY_INTRO)}</p>`,
        ]
      : []),
    "</div>",
    `<div class="facts">\n${[...facts, ...candidates].join("\n")}\n</div>`,
  ].join("\n");
}

const factBlock = (title: string, lines: string[]) =>
  [
    `<h3 class="fact-title">${escapeHtml(title)}</h3>`,
    `<ul class="fact-lines">\n${lines.map((line) => `<li>${withLinks(line)}</li>`).join("\n")}\n</ul>`,
  ].join("\n");

/** The files a reader downloads to check the page: the benchmark file and the raw data copied beside it. */
export function downloadLinksOf(inputs: PageInputs): string[] {
  return [
    '<a href="benchmark.json">benchmark.json ↓</a>',
    ...inputs.benchmark.results.raw_data.flatMap((raw) => {
      const path = inputs.evidencePaths.get(raw.id);

      return path ? [`<a href="${escapeHtml(path)}">${escapeHtml(path)} ↓</a>`] : [];
    }),
  ];
}

/** The inside of one block, in the order the reader meets it; number is its place on the page. */
export function blockHtml(block: Block, inputs: PageInputs, width: number, number: string): string {
  switch (block.type) {
    case "headline":
      return headlineHtml(block, inputs, number);
    case "chart":
      return chartHtml(block, inputs, width, number);
    case "table":
      return tableHtml(block, inputs, number);
    case "text":
      return textHtml(block, inputs, number);
    case "methodology":
      return methodologyHtml(block, inputs);
    case "environment":
      return factBlock("Environment", environmentLines(inputs.lookup.results.environment));
    case "limitations":
      return factBlock("Limitations", inputs.lookup.results.limitations);
    case "provenance":
      return `<p class="mono-label">${downloadLinksOf(inputs).join(" ")}</p>`;
  }
}
