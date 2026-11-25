import type { Metric, Results, Value } from "../schema/benchmark.js";
import type { MetricObservations } from "./observations.js";
import { ComputeError } from "./raw-data.js";
import { generatorFor, type Xoshiro128 } from "./rng.js";
import {
  createEstimator,
  drawGroupsWithReplacement,
  percentileInterval,
  TOO_FEW_FOR_AN_INTERVAL,
  fewestGroupsForBootstrap,
  requireResamplableSize,
  type Estimator,
  type GroupsAggregation,
  type Sample,
  yesNoAnswersOf,
} from "./sample.js";
import { mean, orderStatRanks, quantileSorted, tInterval, wilson } from "./stats.js";
import { aggregationPlanFor, type Aggregation, type NodeId, type NodeTree } from "./structure.js";

export const VALUE_INTERVAL_LEVEL = 0.95;

const UNIT_KIND_PLURAL = { item: "items", run: "runs", row: "observations" } as const;

interface ValueRequest {
  observations: MetricObservations;
  sample: Sample;
  groupsAggregation: GroupsAggregation;
  candidate: string;
  node: NodeId;
  seed: string;
  resamples: number;
}

/** The value of one candidate on one node, before rounding. */
export function measuredValue({ observations, sample, groupsAggregation, candidate, node, seed, resamples }: ValueRequest): Value {
  const { metric, statistic } = observations;
  const entries = sample.groups.flat();
  const estimate = createEstimator(sample, statistic, groupsAggregation);
  const value: Value = {
    candidate,
    metric: metric.id,
    ...(node !== undefined ? { node } : {}),
    value: estimate(),
    n: sample.unitEntryCount,
    source: "computed",
  };
  const sortedObservations = () => entries.flatMap((entry) => entry.observations).sort((a, b) => a - b);
  const readsOneDataNodeWithoutClusters = sample.dataNodeCount === 1 && !observations.hasClusters;
  const everyUnitHasOneObservation = entries.every((entry) => entry.observations.length === 1);
  const answers = yesNoAnswersOf(observations, sample, groupsAggregation);

  if (answers) {
    const [lower, upper] = wilson(
      answers.reduce((sum, answer) => sum + answer, 0),
      answers.length,
      VALUE_INTERVAL_LEVEL,
    );

    value.ci = [100 * lower, 100 * upper];
    value.method = "wilson";
  } else if (readsOneDataNodeWithoutClusters && statistic.type !== "quantile") {
    const unitMeans = entries.map((entry) => entry.scaledMean);
    const interval = tInterval(unitMeans, VALUE_INTERVAL_LEVEL);
    const totalFactor = statistic.type === "total" ? unitMeans.length : 1;

    if (interval.ci) value.ci = [totalFactor * interval.ci[0], totalFactor * interval.ci[1]];

    if (unitMeans.length > 1) value.se = totalFactor * interval.se;

    value.method = statistic.type === "total" ? "t, scaled to the total" : "t";
  } else if (readsOneDataNodeWithoutClusters && statistic.type === "quantile" && everyUnitHasOneObservation) {
    const sorted = sortedObservations();
    const ranks = orderStatRanks(sorted.length, statistic.probability, VALUE_INTERVAL_LEVEL);

    if (ranks) value.ci = [sorted[ranks[0] - 1], sorted[ranks[1] - 1]];

    value.method = ranks ? "order statistics" : `order statistics (${TOO_FEW_FOR_AN_INTERVAL})`;
  } else {
    const groupCount = sample.groups.length;
    const bootstrapMethod = `bootstrap, resampling ${observations.hasClusters ? "clusters" : UNIT_KIND_PLURAL[observations.unitKind]}`;
    const enoughGroups = groupCount >= fewestGroupsForBootstrap(statistic, VALUE_INTERVAL_LEVEL);

    if (enoughGroups) {
      const interval = bootstrapInterval(
        estimate,
        groupCount,
        generatorFor(seed, "value", metric.id, node, candidate),
        resamples,
        `results.metrics[${metric.id}]`,
      );

      if (interval) value.ci = interval;
    }

    value.method = enoughGroups ? bootstrapMethod : `${bootstrapMethod} (${TOO_FEW_FOR_AN_INTERVAL})`;
  }

  if (value.ci) value.ci_level = VALUE_INTERVAL_LEVEL;

  const isMedianLatency = metric.kind === "latency" && statistic.type === "quantile" && statistic.probability === 0.5;

  if (isMedianLatency) {
    const sorted = sortedObservations();

    value.percentiles = { p95: quantileSorted(sorted, 0.95), p99: quantileSorted(sorted, 0.99), max: sorted[sorted.length - 1] };
  }

  const isInTheUnitOfTheObservations = statistic.type === "quantile" || (statistic.type === "mean" && statistic.scale === 1);
  const rangeIsTheOnlySpread = value.ci === undefined;
  const carriesItsRange =
    sample.dataNodeCount === 1 && isInTheUnitOfTheObservations && (metric.kind === "run_time" || rangeIsTheOnlySpread);

  if (carriesItsRange) {
    const sorted = sortedObservations();

    if (sorted.length > 1) value.percentiles = { min: sorted[0], ...value.percentiles, max: sorted[sorted.length - 1] };
  }

  return value;
}

function bootstrapInterval(
  estimate: Estimator,
  groupCount: number,
  generator: Xoshiro128,
  resamples: number,
  path: string,
): [number, number] | null {
  requireResamplableSize(groupCount, path);

  const resampledGroups = new Int32Array(groupCount);
  const resampledStatistics = new Float64Array(resamples);
  let finiteCount = 0;

  for (let resample = 0; resample < resamples; resample++) {
    drawGroupsWithReplacement(generator, resampledGroups);

    const resampledStatistic = estimate(resampledGroups);

    if (!Number.isNaN(resampledStatistic)) resampledStatistics[finiteCount++] = resampledStatistic;
  }

  return percentileInterval(resampledStatistics, finiteCount, VALUE_INTERVAL_LEVEL);
}

/** Declared values of a metric that reads no raw data, and their aggregates on parent nodes. */
export function declaredValuesWithAggregates(results: Results, metric: Metric, declaredByAgent: Value[], tree: NodeTree): Value[] {
  const declaredForMetric = declaredByAgent.filter((value) => value.metric === metric.id);

  if (declaredForMetric.length === 0) {
    const path = `results.metrics[${results.metrics.indexOf(metric)}]`;

    throw new ComputeError(
      "F18",
      path,
      `"${metric.id}" has no "from", so it is declared: write its values in results.values with source "declared" and evidence`,
    );
  }

  const groupsAggregation = metric.aggregation?.groups ?? "micro";
  const values: Value[] = [];

  for (const node of tree.nodesInDeclaredOrder) {
    for (const candidate of results.candidates) {
      const declaredByNode = new Map(
        declaredForMetric.filter((value) => value.candidate === candidate.id).map((value) => [value.node, value]),
      );
      const declaredHere = declaredByNode.get(node);

      if (declaredHere) {
        values.push(declaredHere);
        continue;
      }

      const plan = aggregationPlanFor(tree, node, new Set(declaredByNode.keys()));

      if (!plan) continue;

      const declaredBelow = plan.dataNodes.map((dataNode) => declaredByNode.get(dataNode)!);
      const observationCount = declaredBelow.reduce((sum, value) => sum + (value.n ?? 1), 0);
      const meanOfChildren = (part: Aggregation): number =>
        "dataNodeIndex" in part ? declaredBelow[part.dataNodeIndex].value : mean(part.children.map(meanOfChildren));
      const weightedMean = declaredBelow.reduce((sum, value) => sum + value.value * (value.n ?? 1), 0) / observationCount;

      values.push({
        candidate: candidate.id,
        metric: metric.id,
        ...(node !== undefined ? { node } : {}),
        value: groupsAggregation === "macro" ? meanOfChildren(plan.aggregation) : weightedMean,
        n: observationCount,
        source: "declared",
      });
    }
  }

  return values;
}
