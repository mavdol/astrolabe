import type { RawFile } from "../../compute/raw-data.js";
import { descendantsOf, type NodeId } from "../../compute/structure.js";
import type { Benchmark, Comparison, Metric, Value } from "../../schema/benchmark.js";
import type { ChartBlock, Filter } from "../../schema/presentation.js";
import type { Lookup } from "../describe.js";

/** The option chosen in each filter, by filter id. */
export type FilterState = Record<string, string>;

export const EVERY_OPTION = "all";

/** A chart that cannot be drawn from its data, tied to the rule it would break. */
export class ChartError extends Error {
  constructor(
    public rule: string,
    message: string,
  ) {
    super(message);
  }
}

/** More states than this and the page would be too heavy to render every one in advance. */
export const MAX_FILTER_STATES = 24;

export interface ValueGroup {
  node: NodeId;
  /** The label of the node, when the chart shows several. */
  heading?: string;
  values: Value[];
}

export interface ComparisonGroup {
  node: NodeId;
  heading?: string;
  comparisons: Comparison[];
}

/** The state a page opens in and a static output shows: the default of every filter. */
export function defaultFilterState(benchmark: Benchmark): FilterState {
  return Object.fromEntries((benchmark.filters ?? []).map((filter) => [filter.id, filter.default]));
}

export function filterOf(benchmark: Benchmark, filterId: string, blockId: string): Filter {
  const filter = (benchmark.filters ?? []).find((candidate) => candidate.id === filterId);

  if (!filter) throw new ChartError("schema", `block "${blockId}" listens to the filter "${filterId}", which does not exist`);

  return filter;
}

/** The options a reader can choose in a filter, "all" first when it is allowed. */
export function optionsOf(filter: Filter, lookup: Lookup): string[] {
  const listed =
    filter.options === "from_structure"
      ? (lookup.results.structure?.nodes ?? []).filter((node) => node.level === filter.level).map((node) => node.id)
      : filter.options;

  return filter.allow_all ? [EVERY_OPTION, ...listed] : listed;
}

/** Every state a block can be seen in: each combination of the options of its filters, the others at their default. */
export function filterStatesOf(block: { id: string; filters?: string[] }, benchmark: Benchmark, lookup: Lookup): FilterState[] {
  return (block.filters ?? []).reduce<FilterState[]>(
    (states, filterId) => {
      const options = optionsOf(filterOf(benchmark, filterId, block.id), lookup);

      return states.flatMap((state) => options.map((option) => ({ ...state, [filterId]: option })));
    },
    [defaultFilterState(benchmark)],
  );
}

function nodesAllowedBy(filter: Filter, option: string, lookup: Lookup): Set<string> | null {
  if (option === EVERY_OPTION) return null;

  return new Set([option, ...descendantsOf(lookup.tree, option)]);
}

/**
 * The nodes a block shows, in declared order: the nodes of its breakdown level under its node,
 * narrowed by the filters it listens to; or its single node; or the top of the structure.
 */
export interface NodeSelection {
  id: string;
  node?: string;
  breakdown?: string;
  filters?: string[];
}

export function nodesOf(block: NodeSelection, benchmark: Benchmark, lookup: Lookup, filterState: FilterState): NodeId[] {
  const structure = lookup.results.structure;

  if (!structure) return [undefined];

  if (!block.breakdown) return [block.node ?? structure.nodes.find((node) => node.parent === undefined)!.id];

  const underBlockNode = block.node ? new Set(descendantsOf(lookup.tree, block.node)) : null;
  const allowedByFilters = (block.filters ?? []).map((filterId) => {
    const filter = filterOf(benchmark, filterId, block.id);

    return nodesAllowedBy(filter, filterState[filterId] ?? filter.default, lookup);
  });

  return structure.nodes
    .filter((node) => node.level === block.breakdown)
    .filter((node) => !underBlockNode || underBlockNode.has(node.id))
    .filter((node) => allowedByFilters.every((allowed) => !allowed || allowed.has(node.id)))
    .map((node) => node.id);
}

export function metricOf(block: ChartBlock, lookup: Lookup, field: "metric" | "x" | "y" = "metric"): Metric {
  const metricId = block[field];
  const metric = metricId ? lookup.metricById.get(metricId) : undefined;

  if (!metric) throw new ChartError("V1", `block "${block.id}" needs the id of a metric in "${field}"`);

  return metric;
}

export const isBetter = (metric: Metric, first: number, second: number) => (metric.direction === "lower" ? first < second : first > second);

/**
 * Candidates best first on the first group shown, and in that same order in every group;
 * or as declared. The order never depends on which candidate the page is about.
 */
export function candidateOrder(block: ChartBlock, metric: Metric, lookup: Lookup, firstGroup: Value[]): string[] {
  const declared = lookup.results.candidates.map((candidate) => candidate.id);

  if (block.sort === "declared") return declared;

  const valueOf = new Map(firstGroup.map((value) => [value.candidate, value.value]));

  return [...declared].sort((first, second) => {
    const [firstValue, secondValue] = [valueOf.get(first), valueOf.get(second)];

    if (firstValue === undefined || secondValue === undefined || firstValue === secondValue) return 0;

    return isBetter(metric, firstValue, secondValue) ? -1 : 1;
  });
}

/** The values of one metric a block charts: one group per node, one value per candidate. */
export function valueGroupsOf(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, filterState: FilterState): ValueGroup[] {
  const metric = metricOf(block, lookup);
  const nodes = nodesOf(block, benchmark, lookup, filterState);
  const valuesAt = (node: NodeId) => (lookup.results.values ?? []).filter((value) => value.metric === metric.id && value.node === node);
  const nodesWithValues = nodes.filter((node) => valuesAt(node).length > 0);

  if (nodesWithValues.length === 0) throw new ChartError("V1", `block "${block.id}" has no value of "${metric.id}" to show`);

  const order = candidateOrder(block, metric, lookup, valuesAt(nodesWithValues[0]));

  return nodesWithValues.map((node) => ({
    node,
    ...(nodesWithValues.length > 1 && node !== undefined ? { heading: lookup.nodeLabel.get(node) ?? node } : {}),
    values: order.flatMap((candidate) => valuesAt(node).filter((value) => value.candidate === candidate)),
  }));
}

/**
 * The comparisons with the baseline a block charts: one group per node, best effect first within it; with sort "effect",
 * the nodes too, by the mean effect of the candidates compared there, so that no candidate decides the order.
 */
export function comparisonGroupsOf(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, filterState: FilterState): ComparisonGroup[] {
  const metric = metricOf(block, lookup);
  const nodes = nodesOf(block, benchmark, lookup, filterState);
  const declaredOrder = lookup.results.candidates.map((candidate) => candidate.id);
  const comparisonsAt = (node: NodeId) =>
    (lookup.results.comparisons ?? [])
      .filter(
        (comparison) =>
          comparison.metric === metric.id && comparison.node === node && comparison.vs === (block.vs ?? lookup.results.baseline),
      )
      .sort((first, second) => {
        if (block.sort === "declared" || first.effect === second.effect)
          return declaredOrder.indexOf(first.candidate) - declaredOrder.indexOf(second.candidate);

        return isBetter(metric, first.effect, second.effect) ? -1 : 1;
      });
  const meanEffectAt = (node: NodeId) => {
    const effects = comparisonsAt(node).map((comparison) => comparison.effect);

    return effects.reduce((sum, effect) => sum + effect, 0) / effects.length;
  };
  const withComparisons = nodes.filter((node) => comparisonsAt(node).length > 0);
  const nodesWithComparisons =
    block.sort === "effect"
      ? [...withComparisons].sort((first, second) => {
          const [firstEffect, secondEffect] = [meanEffectAt(first), meanEffectAt(second)];

          return firstEffect === secondEffect ? 0 : isBetter(metric, firstEffect, secondEffect) ? -1 : 1;
        })
      : withComparisons;

  if (nodesWithComparisons.length === 0) throw new ChartError("V1", `block "${block.id}" has no comparison on "${metric.id}" to show`);

  return nodesWithComparisons.map((node) => ({
    node,
    ...(nodesWithComparisons.length > 1 && node !== undefined ? { heading: lookup.nodeLabel.get(node) ?? node } : {}),
    comparisons: comparisonsAt(node),
  }));
}

export interface Observations {
  values: number[];
  failedAttempts: number;
}

/**
 * Every successful observation of a metric in its raw file, by candidate, for the rows that belong to
 * the node or below it. Failed attempts are counted, not drawn.
 */
export function observationsOf(
  block: ChartBlock,
  metric: Metric,
  node: NodeId,
  lookup: Lookup,
  rawFiles: Record<string, RawFile>,
): Map<string, Observations> {
  const source = metric.from;

  if (!source) throw new ChartError("V1", `block "${block.id}": "${metric.id}" has no raw data, so its distribution cannot be drawn`);

  const rawFile = rawFiles[source.raw];

  if (!rawFile)
    throw new ChartError("F16", `block "${block.id}" draws every observation of "${metric.id}": the raw file "${source.raw}" is needed`);

  const nodes = node === undefined || !lookup.results.structure ? null : new Set([node, ...descendantsOf(lookup.tree, node)]);
  const byCandidate = new Map<string, Observations>();

  for (const row of rawFile.rows) {
    if (row.measure !== source.measure || (nodes && (row.node === undefined || !nodes.has(row.node)))) continue;

    const observations = byCandidate.get(row.candidate) ?? { values: [], failedAttempts: 0 };
    const failed = row.value === null || (row.status !== undefined && row.status !== "ok");

    if (failed) observations.failedAttempts++;
    else observations.values.push(row.value!);

    byCandidate.set(row.candidate, observations);
  }

  return byCandidate;
}
