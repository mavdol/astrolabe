import type { RawFile } from "../compute/raw-data.js";
import { renderChart } from "../render/chart/render-chart.js";
import {
  ChartError,
  defaultFilterState,
  filterStatesOf,
  MAX_FILTER_STATES,
  nodesOf,
  optionsOf,
  type FilterState,
} from "../render/chart/chart-data.js";
import { lookupOf } from "../render/describe.js";
import { exportPlanOf, IMAGE_SIZES } from "../render/exports.js";
import type { Issue } from "../rules/registry.js";
import { standingsOn } from "../render/standing.js";
import type { Benchmark } from "../schema/benchmark.js";
import type { ChartBlock } from "../schema/presentation.js";

/** The width a chart has on the page when it is alone in its row. */
const PAGE_CHART_WIDTH = 640;
const CHECK_CONTEXT = { generatorVersion: "check", buildDate: "1970-01-01" };
const CHARTS_OF_TWO_SEPARATE_VALUES = new Set([
  "bar",
  "grouped-bar",
  "dot-interval",
  "distribution",
  "line",
  "shaded-table",
  "scatter",
  "results",
]);

function stateInWords(state: FilterState, defaults: FilterState): string {
  const changed = Object.entries(state).filter(([filterId, option]) => defaults[filterId] !== option);

  return changed.length === 0 ? "" : ` (with ${changed.map(([filterId, option]) => `${filterId} = ${option}`).join(", ")})`;
}

/**
 * Draws every chart in every state a reader can switch to, and every image export, so that a chart
 * that does not fit its data fails the file rather than the page. Also checks the filters themselves,
 * and that a paired comparison is never left to two separate intervals.
 */
export function checkCharts(benchmark: Benchmark, rawFiles: Record<string, RawFile>): Issue[] {
  const issues: Issue[] = [];
  const error = (rule: string, path: string, message: string) => issues.push({ severity: "error", rule, path, message });
  const lookup = lookupOf(benchmark.results);
  const defaults = defaultFilterState(benchmark);
  const filters = benchmark.filters ?? [];
  const blocks = benchmark.blocks ?? [];
  const pageStates = filters.reduce((count, filter) => count * optionsOf(filter, lookup).length, 1);

  if (pageStates > MAX_FILTER_STATES)
    error(
      "V37",
      "filters",
      `the filters make ${pageStates} combinations, and at most ${MAX_FILTER_STATES} can be rendered in advance: drop a filter, or some of its options`,
    );

  filters.forEach((filter, index) => {
    const options = optionsOf(filter, lookup);

    if (options.length === 0)
      error("V33", `filters[${index}].options`, `the filter "${filter.id}" has no option: no node is on the level "${filter.level}"`);
    else if (!options.includes(filter.default))
      error("V33", `filters[${index}].default`, `"${filter.default}" is not one of the options of "${filter.id}": ${options.join(", ")}`);
  });

  const statesByBlock = new Map<string, FilterState[]>();
  const drawnInEveryState = new Set<string>();

  blocks.forEach((block, index) => {
    if (block.type !== "chart") return;

    const reported = new Set<string>();
    const report = (failure: unknown, state: FilterState) => {
      if (!(failure instanceof ChartError)) throw failure;

      if (reported.has(failure.message)) return;

      reported.add(failure.message);
      drawnInEveryState.delete(block.id);
      error(failure.rule, `blocks[${index}]`, `${failure.message}${stateInWords(state, defaults)}`);
    };

    try {
      statesByBlock.set(block.id, filterStatesOf(block, benchmark, lookup));
      drawnInEveryState.add(block.id);
    } catch (failure) {
      return report(failure, defaults);
    }

    for (const filterState of statesByBlock.get(block.id)!) {
      try {
        renderChart(benchmark, block, { width: PAGE_CHART_WIDTH, mode: "light", filterState, standalone: false, rawFiles }, CHECK_CONTEXT);
      } catch (failure) {
        report(failure, filterState);
      }
    }
  });

  const plan = exportPlanOf(benchmark);

  for (const image of plan.images) {
    const exportIndex = (benchmark.exports ?? []).findIndex((entry) => entry.id === image.id);
    const { width, height, layoutWidth } = IMAGE_SIZES[image.size];

    try {
      renderChart(
        benchmark,
        image.block,
        {
          width: layoutWidth,
          height: Math.round((height * layoutWidth) / width),
          mode: "light",
          filterState: image.filterState,
          standalone: true,
          rawFiles,
        },
        CHECK_CONTEXT,
      );
    } catch (failure) {
      if (!(failure instanceof ChartError)) throw failure;

      error(failure.rule, `exports[${exportIndex}]`, failure.message);
    }
  }

  issues.push(...pairedComparisonsLeftToTwoIntervals(benchmark, statesByBlock, drawnInEveryState));

  return issues;
}

/**
 * Two intervals that overlap say nothing about a paired difference: each paired comparison whose two
 * values a chart draws must also be shown as a change, in a headline, an effect chart or a comparison-rows chart.
 */
function pairedComparisonsLeftToTwoIntervals(
  benchmark: Benchmark,
  statesByBlock: Map<string, FilterState[]>,
  drawnInEveryState: Set<string>,
): Issue[] {
  const lookup = lookupOf(benchmark.results);
  const blocks = benchmark.blocks ?? [];
  const comparisons = benchmark.results.comparisons ?? [];
  const nodesShownBy = (block: ChartBlock) => {
    const nodes = new Set<string | undefined>();

    for (const state of statesByBlock.get(block.id) ?? [])
      try {
        for (const node of nodesOf(block, benchmark, lookup, state)) nodes.add(node);
      } catch (failure) {
        if (!(failure instanceof ChartError)) throw failure;
      }

    return nodes;
  };
  const metricsOf = (block: ChartBlock) => (block.chart === "scatter" ? [block.x, block.y] : [block.metric]);
  const shownAsChange = new Set<string>();

  for (const block of blocks) {
    if (block.type === "headline") shownAsChange.add(block.comparison);

    if (block.type !== "chart") continue;

    if (block.chart === "comparison-rows") for (const id of block.comparisons ?? []) shownAsChange.add(id);

    if (block.chart === "effect") {
      const nodes = nodesShownBy(block);

      for (const comparison of comparisons)
        if (comparison.metric === block.metric && nodes.has(comparison.node)) shownAsChange.add(comparison.id);
    }

    // A results chart writes who is best and who is behind from the comparisons between every pair: where it can, the
    // paired results are stated in words, not left to the reader's eye.
    if (block.chart === "results") {
      const candidates = benchmark.results.candidates.map((candidate) => candidate.id);

      for (const node of nodesShownBy(block))
        if (standingsOn(benchmark.results, block.metric ?? "", node, candidates))
          for (const comparison of comparisons)
            if (comparison.metric === block.metric && comparison.node === node) shownAsChange.add(comparison.id);
    }
  }

  const issues: Issue[] = [];

  blocks.forEach((block, index) => {
    if (block.type !== "chart" || !CHARTS_OF_TWO_SEPARATE_VALUES.has(block.chart) || !drawnInEveryState.has(block.id)) return;

    const nodes = nodesShownBy(block);
    const metrics = metricsOf(block);
    const leftToTwoIntervals = comparisons.filter(
      (comparison) =>
        comparison.paired && metrics.includes(comparison.metric) && nodes.has(comparison.node) && !shownAsChange.has(comparison.id),
    );

    for (const comparison of leftToTwoIntervals)
      issues.push({
        severity: "error",
        rule: "V13",
        path: `blocks[${index}]`,
        message: `"${comparison.id}" is paired, so two separate intervals cannot show its result: show it as a headline, an effect chart or a comparison-rows chart too`,
      });
  });

  return issues;
}
