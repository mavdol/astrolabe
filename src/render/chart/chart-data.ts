import { descendantsOf, type NodeId } from "../../compute/structure.js";
import type { Benchmark, Comparison, Metric, Value } from "../../schema/benchmark.js";
import type { ChartBlock, Filter } from "../../schema/presentation.js";
import type { Lookup } from "../describe.js";

/** The option chosen in each filter, by filter id. */
export type FilterState = Record<string, string>;

export const EVERY_OPTION = "all";

export class ChartError extends Error {}

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

function nodesAllowedBy(filter: Filter, option: string, lookup: Lookup): Set<string> | null {
  if (option === EVERY_OPTION) return null;

  return new Set([option, ...descendantsOf(lookup.tree, option)]);
}

/**
 * The nodes a block shows, in declared order: the nodes of its breakdown level under its node,
 * narrowed by the filters it listens to; or its single node; or the top of the structure.
 */
export function nodesOf(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, filterState: FilterState): NodeId[] {
  const structure = lookup.results.structure;

  if (!structure) return [undefined];

  if (!block.breakdown) return [block.node ?? structure.nodes.find((node) => node.parent === undefined)!.id];

  const underBlockNode = block.node ? new Set(descendantsOf(lookup.tree, block.node)) : null;
  const allowedByFilters = (block.filters ?? []).map((filterId) => {
    const filter = (benchmark.filters ?? []).find((candidate) => candidate.id === filterId);

    if (!filter) throw new ChartError(`block "${block.id}" listens to the filter "${filterId}", which does not exist`);

    return nodesAllowedBy(filter, filterState[filterId] ?? filter.default, lookup);
  });

  return structure.nodes
    .filter((node) => node.level === block.breakdown)
    .filter((node) => !underBlockNode || underBlockNode.has(node.id))
    .filter((node) => allowedByFilters.every((allowed) => !allowed || allowed.has(node.id)))
    .map((node) => node.id);
}

export function metricOf(block: ChartBlock, lookup: Lookup): Metric {
  const metric = block.metric ? lookup.metricById.get(block.metric) : undefined;

  if (!metric) throw new ChartError(`block "${block.id}" needs the id of a metric in "metric"`);

  return metric;
}

const isBetter = (metric: Metric, first: number, second: number) => (metric.direction === "lower" ? first < second : first > second);

/**
 * Candidates best first on the first group shown, and in that same order in every group;
 * or as declared. The order never depends on which candidate the page is about.
 */
function candidateOrder(block: ChartBlock, metric: Metric, lookup: Lookup, firstGroup: Value[]): string[] {
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

  if (nodesWithValues.length === 0) throw new ChartError(`block "${block.id}" has no value of "${metric.id}" to show`);

  const order = candidateOrder(block, metric, lookup, valuesAt(nodesWithValues[0]));

  return nodesWithValues.map((node) => ({
    node,
    ...(nodesWithValues.length > 1 && node !== undefined ? { heading: lookup.nodeLabel.get(node) ?? node } : {}),
    values: order.flatMap((candidate) => valuesAt(node).filter((value) => value.candidate === candidate)),
  }));
}

/** The comparisons with the baseline a block charts: one group per node, best effect first within it. */
export function comparisonGroupsOf(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, filterState: FilterState): ComparisonGroup[] {
  const metric = metricOf(block, lookup);
  const nodes = nodesOf(block, benchmark, lookup, filterState);
  const declaredOrder = lookup.results.candidates.map((candidate) => candidate.id);
  const comparisonsAt = (node: NodeId) =>
    (lookup.results.comparisons ?? [])
      .filter((comparison) => comparison.metric === metric.id && comparison.node === node)
      .sort((first, second) => {
        if (block.sort === "declared" || first.effect === second.effect)
          return declaredOrder.indexOf(first.candidate) - declaredOrder.indexOf(second.candidate);

        return isBetter(metric, first.effect, second.effect) ? -1 : 1;
      });
  const nodesWithComparisons = nodes.filter((node) => comparisonsAt(node).length > 0);

  if (nodesWithComparisons.length === 0) throw new ChartError(`block "${block.id}" has no comparison on "${metric.id}" to show`);

  return nodesWithComparisons.map((node) => ({
    node,
    ...(nodesWithComparisons.length > 1 && node !== undefined ? { heading: lookup.nodeLabel.get(node) ?? node } : {}),
    comparisons: comparisonsAt(node),
  }));
}
