import type { Comparison, Metric, Results, Value } from "../schema/benchmark.js";
import type { MetricObservations } from "./observations.js";
import { ComputeError } from "./raw-data.js";
import { generatorFor } from "./rng.js";
import {
  buildSample,
  createEstimator,
  drawGroupsWithReplacement,
  fewestGroupsForBootstrap,
  percentileInterval,
  TOO_FEW_FOR_AN_INTERVAL,
  requireResamplableSize,
  type Sample,
} from "./sample.js";
import { tInterval, welch } from "./stats.js";
import { aggregationPlanFor, descendantsOf, nodeTreeOf, type NodeId, type NodeTree } from "./structure.js";
import { failureWarningOf } from "./verdict.js";

/** An effect and its interval, before rounding. */
export interface Effect {
  effect: number;
  ci: [number, number] | null;
  paired: boolean;
  method: string;
}

/** The candidate's value against the baseline's: a difference, or a percentage of the baseline. */
function effectBetween(metric: Metric, candidateValue: number, baselineValue: number): number {
  if (metric.compare_as === "difference") return candidateValue - baselineValue;

  return baselineValue === 0 ? NaN : (100 * (candidateValue - baselineValue)) / Math.abs(baselineValue);
}

const ZERO_BASELINE_MESSAGE = "a relative comparison needs a baseline value other than zero";

export function effectOfDeclaredValues(metric: Metric, candidateValue: Value, baselineValue: Value): Effect {
  const effect = effectBetween(metric, candidateValue.value, baselineValue.value);

  if (Number.isNaN(effect)) throw new ComputeError("S3", `results.metrics[${metric.id}]`, ZERO_BASELINE_MESSAGE);

  return { effect, ci: [effect, effect], paired: false, method: "declared values" };
}

interface EffectRequest {
  observations: MetricObservations;
  tree: NodeTree;
  candidate: string;
  baseline: string;
  node: NodeId;
  level: number;
  seed: string;
  resamples: number;
}

export function measuredEffect({ observations, tree, candidate, baseline, node, level, seed, resamples }: EffectRequest): Effect {
  const { metric, statistic } = observations;
  const groupsAggregation = metric.aggregation?.groups ?? "micro";
  const path = `results.metrics[${metric.id}]`;

  const matched = matchedSamples(observations, tree, candidate, baseline, node);
  const paired = matched !== null;
  const candidateSample = matched?.candidateSample ?? buildSample(observations, tree, candidate, node)!;
  const baselineSample = matched?.baselineSample ?? buildSample(observations, tree, baseline, node)!;

  const bothReadOneDataNode = candidateSample.dataNodeCount === 1 && baselineSample.dataNodeCount === 1;
  const hasClosedFormInterval =
    bothReadOneDataNode && statistic.type === "mean" && metric.compare_as === "difference" && !observations.hasClusters;

  if (hasClosedFormInterval) {
    const candidateUnitMeans = candidateSample.groups.map((group) => group[0].scaledMean);
    const baselineUnitMeans = baselineSample.groups.map((group) => group[0].scaledMean);

    if (paired) {
      const differences = candidateUnitMeans.map((candidateMean, unitIndex) => candidateMean - baselineUnitMeans[unitIndex]);
      const interval = tInterval(differences, level);

      return { effect: interval.estimate, ci: interval.ci, paired, method: "paired t" };
    }

    const interval = welch(candidateUnitMeans, baselineUnitMeans, level);

    return { effect: interval.estimate, ci: interval.ci, paired, method: "welch" };
  }

  const estimateCandidate = createEstimator(candidateSample, statistic, groupsAggregation);
  const estimateBaseline = createEstimator(baselineSample, statistic, groupsAggregation);
  const effect = effectBetween(metric, estimateCandidate(), estimateBaseline());

  if (Number.isNaN(effect)) throw new ComputeError("S3", path, ZERO_BASELINE_MESSAGE);

  const bootstrapMethod = paired ? "bootstrap, paired by item" : "bootstrap";
  const fewestGroups = fewestGroupsForBootstrap(statistic, level);
  const enoughGroupsOnBothSides = candidateSample.groups.length >= fewestGroups && baselineSample.groups.length >= fewestGroups;

  if (!enoughGroupsOnBothSides) return { effect, ci: null, paired, method: `${bootstrapMethod} (${TOO_FEW_FOR_AN_INTERVAL})` };

  requireResamplableSize(Math.max(candidateSample.groups.length, baselineSample.groups.length), path);

  // A paired resample draws the same items on both sides; an unpaired one draws the candidate's groups first, then the baseline's.
  const generator = generatorFor(seed, "comparison", metric.id, node, candidate);
  const resampledCandidateGroups = new Int32Array(candidateSample.groups.length);
  const resampledBaselineGroups = paired ? resampledCandidateGroups : new Int32Array(baselineSample.groups.length);
  const resampledEffects = new Float64Array(resamples);
  let finiteCount = 0;

  for (let resample = 0; resample < resamples; resample++) {
    drawGroupsWithReplacement(generator, resampledCandidateGroups);

    if (!paired) drawGroupsWithReplacement(generator, resampledBaselineGroups);

    const resampledEffect = effectBetween(metric, estimateCandidate(resampledCandidateGroups), estimateBaseline(resampledBaselineGroups));

    if (!Number.isNaN(resampledEffect)) resampledEffects[finiteCount++] = resampledEffect;
  }

  return { effect, ci: percentileInterval(resampledEffects, finiteCount, level), paired, method: bootstrapMethod };
}

/**
 * A comparison is paired when the same items were measured on both sides. A
 * pair is dropped when either side lost it to a failure or to the outlier rule.
 */
function matchedSamples(
  observations: MetricObservations,
  tree: NodeTree,
  candidate: string,
  baseline: string,
  node: NodeId,
): { candidateSample: Sample; baselineSample: Sample } | null {
  if (observations.unitKind !== "item") return null;

  const pairKey = (dataNode: NodeId, unitId: string) => `${dataNode ?? ""}\u0000${unitId}`;
  const usablePairKeysOf = (candidateId: string) => {
    const cellsByNode = observations.cellsByCandidate.get(candidateId)!;
    const usable = new Set<string>();

    for (const dataNode of aggregationPlanFor(tree, node, new Set(cellsByNode.keys()))?.dataNodes ?? []) {
      for (const unit of cellsByNode.get(dataNode)!.units.values()) {
        if (unit.observations.length > 0 && !unit.lostAnObservationToTheOutlierRule) usable.add(pairKey(dataNode, unit.id));
      }
    }

    return usable;
  };
  const usableForBaseline = usablePairKeysOf(baseline);
  const matchedPairKeys = new Set([...usablePairKeysOf(candidate)].filter((key) => usableForBaseline.has(key)));

  if (matchedPairKeys.size === 0) return null;

  const keepMatched = (dataNode: NodeId, unitId: string) => matchedPairKeys.has(pairKey(dataNode, unitId));
  const candidateSample = buildSample(observations, tree, candidate, node, keepMatched);
  const baselineSample = buildSample(observations, tree, baseline, node, keepMatched);
  const sameGroupsOnBothSides =
    candidateSample !== null &&
    baselineSample !== null &&
    candidateSample.groupKeys.length === baselineSample.groupKeys.length &&
    candidateSample.groupKeys.every((key, index) => key === baselineSample.groupKeys[index]);

  return sameGroupsOnBothSides ? { candidateSample: candidateSample!, baselineSample: baselineSample! } : null;
}

export function failedAttemptsUnder(
  observations: MetricObservations,
  tree: NodeTree,
  candidate: string,
  node: NodeId,
): { failed: number; attempts: number } {
  const cellsByNode = observations.cellsByCandidate.get(candidate)!;
  let failed = 0;
  let attempts = 0;

  for (const dataNode of aggregationPlanFor(tree, node, new Set(cellsByNode.keys()))?.dataNodes ?? []) {
    failed += cellsByNode.get(dataNode)!.failedAttempts;
    attempts += cellsByNode.get(dataNode)!.attempts;
  }

  return { failed, attempts };
}

/**
 * Sets failure_warning from the stored failure shares. A parent node's
 * comparison carries the warning too when a node below it warns on its
 * adjusted interval, and names those nodes: the pooled share of a suite would
 * otherwise dilute a large gap on one task.
 */
export function applyFailureWarnings(comparisons: Comparison[], treeOrResults: NodeTree | Results): void {
  const tree = "nodesInDeclaredOrder" in treeOrResults ? treeOrResults : nodeTreeOf(treeOrResults);
  const key = (metric: string, node: NodeId, candidate: string) => `${metric}\u0000${node ?? ""}\u0000${candidate}`;
  const warnsOnItsOwnShares = new Map<string, boolean>();
  const warnsForItsParents = new Map<string, boolean>();

  for (const comparison of comparisons) {
    const share = comparison.failure_share;

    if (!share) continue;

    const comparisonKey = key(comparison.metric, comparison.node, comparison.candidate);

    warnsOnItsOwnShares.set(comparisonKey, failureWarningOf(share));
    warnsForItsParents.set(
      comparisonKey,
      failureWarningOf({ ...share, difference_ci: share.difference_ci_adjusted ?? share.difference_ci }),
    );
  }

  for (const comparison of comparisons) {
    delete comparison.failure_warning;
    delete comparison.failure_warning_nodes;

    if (!comparison.failure_share) continue;

    const warningNodesBelow =
      comparison.node === undefined
        ? []
        : descendantsOf(tree, comparison.node).filter(
            (descendant) => warnsForItsParents.get(key(comparison.metric, descendant, comparison.candidate)) === true,
          );
    const warnsHere = warnsOnItsOwnShares.get(key(comparison.metric, comparison.node, comparison.candidate)) === true;

    comparison.failure_warning = warnsHere || warningNodesBelow.length > 0;

    if (warningNodesBelow.length > 0) comparison.failure_warning_nodes = warningNodesBelow;
  }
}
