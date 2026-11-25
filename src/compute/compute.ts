import type { Comparison, Exclusion, Failure, Metric, Results, Value } from "../schema/benchmark.js";
import { applyFailureWarnings, effectOfDeclaredValues, failedAttemptsUnder, measuredEffect } from "./comparisons.js";
import { stored } from "./numbers.js";
import { collectObservations, DEFAULT_TUKEY_K, type MetricObservations } from "./observations.js";
import { ComputeError, type RawFile } from "./raw-data.js";
import { deriveSeed } from "./rng.js";
import { buildSample } from "./sample.js";
import { newcombe } from "./stats.js";
import { descendantsOf, hasAncestorIn, nodeTreeOf, type NodeId, type NodeTree } from "./structure.js";
import { declaredValuesWithAggregates, measuredValue, VALUE_INTERVAL_LEVEL } from "./values.js";
import { verdictOf, withEnoughParticipants } from "./verdict.js";

export { applyFailureWarnings } from "./comparisons.js";
export { ComputeError, parseRaw, type RawFile, type RawRow } from "./raw-data.js";

/** Bumped whenever a change to the methods can alter a stored digit. */
export const METHODS_VERSION = "9";
export const RESAMPLES = 10000;
export const ALPHA = 0.05;

const PERCENT = 100;

export interface ComputeOptions {
  /** Tool name and version, written in the stamp. */
  by?: string;
  resamples?: number;
}

const valueKey = (metric: string, node: NodeId, candidate: string) => `${metric}\u0000${node ?? ""}\u0000${candidate}`;

/** "wall_time__small__quickmark"; a pair without the baseline names its other side: "wall_time__small__quickmark__vs__inkdown". */
export function comparisonId(metric: string, node: NodeId, candidate: string, against?: string): string {
  const pair = against === undefined ? candidate : `${candidate}__vs__${against}`;

  return node === undefined ? `${metric}__${pair}` : `${metric}__${node}__${pair}`;
}

export interface Pair {
  candidate: string;
  vs: string;
}

/**
 * The pairs a plan compares: every pair by default, the baseline always on the "vs" side and otherwise the later
 * candidate against the earlier, so that each candidate is compared in its own right; each candidate against the
 * baseline only; or the pairs the plan names. Pairs with the baseline first.
 */
export function pairsOf(plan: Pick<Results, "candidates" | "baseline" | "analysis">): Pair[] {
  const ids = plan.candidates.map((candidate) => candidate.id);
  const declared = plan.analysis?.pairs ?? "all";

  if (Array.isArray(declared)) return declared;

  const withBaseline = ids.filter((id) => id !== plan.baseline).map((candidate) => ({ candidate, vs: plan.baseline }));

  if (declared === "baseline") return withBaseline;

  const others = ids.filter((id) => id !== plan.baseline);

  return [
    ...withBaseline,
    ...others.flatMap((earlier, index) => others.slice(index + 1).map((later) => ({ candidate: later, vs: earlier }))),
  ];
}

/**
 * Resamples for a primary comparison: enough that each end of its adjusted interval still rests on at least a fifth of
 * the resampled values a single 95% interval has beyond each end (50 of 250 with the default 10,000).
 */
export const primaryResamplesOf = (resamples: number, primaryCount: number) =>
  Math.max(resamples, Math.ceil((resamples * primaryCount) / 5));

/** The declared values the agent wrote itself: those with no declared value on a node below them. */
export function declaredInputs(results: Results, tree: NodeTree = nodeTreeOf(results)): Value[] {
  const declared = (results.values ?? []).filter((value) => value.source === "declared");
  const declaredKeys = new Set(declared.map((value) => valueKey(value.metric, value.node, value.candidate)));
  const hasDeclaredValueBelow = (value: Value) =>
    value.node !== undefined &&
    descendantsOf(tree, value.node).some((descendant) => declaredKeys.has(valueKey(value.metric, descendant, value.candidate)));

  return declared.filter((value) => !hasDeclaredValueBelow(value));
}

/** Results without anything compute writes; declared input values are kept. */
export function planOf(results: Results): Results {
  const {
    values: _values,
    failures: _failures,
    exclusions: _exclusions,
    comparisons: _comparisons,
    observed: _observed,
    computed: _stamp,
    ...plan
  } = results;
  const declaredByAgent = declaredInputs(results);

  return {
    ...plan,
    raw_data: plan.raw_data.map(({ rows: _rows, sha256: _sha256, ...declaredFields }) => declaredFields),
    ...(declaredByAgent.length > 0 ? { values: declaredByAgent } : {}),
  } as Results;
}

/**
 * Reads the plan and the raw files, and returns results with every computed
 * field written. The same raw files always give the same digits.
 */
export function compute(input: Results, rawFiles: Record<string, RawFile>, options: ComputeOptions = {}): Results {
  const plan = planOf(input);
  const tree = nodeTreeOf(plan);
  const resamples = options.resamples ?? RESAMPLES;

  const rawSha256: Record<string, string> = {};

  for (const rawFile of plan.raw_data) {
    if (!rawFiles[rawFile.id]) throw new ComputeError("F16", `results.raw_data[${rawFile.id}]`, `raw file "${rawFile.path}" was not found`);

    rawSha256[rawFile.id] = rawFiles[rawFile.id].sha256;
  }

  const seed = deriveSeed(rawSha256);

  const measured = measureEveryMetric(plan, rawFiles, tree, seed, resamples);
  const { values, scaleOfMetric } = storeValues(measured.unroundedValues);
  const observed = observedLevelsAndTimestamps(plan, rawFiles);
  const comparisons = compareWithBaseline(
    plan,
    tree,
    values,
    scaleOfMetric,
    measured.observationsByMetric,
    seed,
    resamples,
    participantsOf(observed),
  );
  const primaryCount = comparisons.filter((comparison) => comparison.role === "primary").length;

  return {
    ...plan,
    raw_data: plan.raw_data.map((rawFile) => ({ ...rawFile, rows: rawFiles[rawFile.id].rows.length, sha256: rawFiles[rawFile.id].sha256 })),
    values,
    failures: measured.failures,
    exclusions: measured.exclusions,
    comparisons,
    observed,
    computed: {
      by: options.by ?? "astrolabe-bench",
      methods_version: METHODS_VERSION,
      resamples,
      seed,
      alpha: ALPHA,
      primary_comparisons: primaryCount,
      exploratory_comparisons: comparisons.length - primaryCount,
      raw_sha256: rawSha256,
    },
  };
}

interface Measured {
  observationsByMetric: Map<string, MetricObservations>;
  unroundedValues: Value[];
  failures: Failure[];
  exclusions: Exclusion[];
}

function measureEveryMetric(plan: Results, rawFiles: Record<string, RawFile>, tree: NodeTree, seed: string, resamples: number): Measured {
  const measured: Measured = { observationsByMetric: new Map(), unroundedValues: [], failures: [], exclusions: [] };
  const declaredByAgent = declaredInputs(plan, tree);
  const candidateIds = plan.candidates.map((candidate) => candidate.id);

  plan.metrics.forEach((metric, metricIndex) => {
    if (!metric.from) {
      measured.unroundedValues.push(...declaredValuesWithAggregates(plan, metric, declaredByAgent, tree));

      return;
    }

    if (declaredByAgent.some((value) => value.metric === metric.id)) {
      throw new ComputeError(
        "F18",
        `results.metrics[${metricIndex}]`,
        `"${metric.id}" reads raw data, so it cannot also have declared values`,
      );
    }

    const observations = collectObservations(plan, metric, rawFiles, tree);

    measured.observationsByMetric.set(metric.id, observations);
    const groupsAggregation = metric.aggregation?.groups ?? "micro";

    for (const node of tree.nodesInDeclaredOrder) {
      for (const candidate of candidateIds) {
        const sample = buildSample(observations, tree, candidate, node);

        if (!sample || sample.unitEntryCount === 0) continue;

        measured.unroundedValues.push(measuredValue({ observations, sample, groupsAggregation, candidate, node, seed, resamples }));
      }
    }

    for (const candidate of candidateIds) {
      for (const node of tree.nodesInDeclaredOrder) {
        const cell = observations.cellsByCandidate.get(candidate)?.get(node);

        if (!cell) continue;

        const position = { candidate, metric: metric.id, ...(node !== undefined ? { node } : {}) };

        for (const reason of [...cell.failuresByReason.keys()].sort()) {
          measured.failures.push({
            ...position,
            reason,
            count: cell.failuresByReason.get(reason)!,
            attempts: cell.attempts,
            unit: "attempts",
            counted_as: metric.failures_count_as!,
          });
        }

        if (cell.observationsRemovedByOutlierRule > 0) {
          const k = plan.analysis?.outliers?.k ?? DEFAULT_TUKEY_K;

          measured.exclusions.push({
            ...position,
            rule: `tukey, k=${k}`,
            count: cell.observationsRemovedByOutlierRule,
            of: cell.observationsBeforeOutlierRule,
          });
        }
      }
    }
  });

  return measured;
}

/** Rounds every value to six significant digits, on the scale of its metric: the largest absolute value of that metric. */
function storeValues(unroundedValues: Value[]): { values: Value[]; scaleOfMetric: Map<string, number> } {
  const scaleOfMetric = new Map<string, number>();

  for (const value of unroundedValues)
    scaleOfMetric.set(value.metric, Math.max(scaleOfMetric.get(value.metric) ?? 0, Math.abs(value.value)));

  const values = unroundedValues.map((value) => {
    const writtenByAgent = value.source === "declared" && value.evidence !== undefined;

    if (writtenByAgent) return value;

    const scale = scaleOfMetric.get(value.metric)!;
    const storedValue: Value = { ...value, value: stored(value.value, scale) };

    if (value.ci) storedValue.ci = [stored(value.ci[0], scale), stored(value.ci[1], scale)];

    if (value.se !== undefined) storedValue.se = stored(value.se, scale);

    if (value.percentiles)
      storedValue.percentiles = Object.fromEntries(
        Object.entries(value.percentiles).map(([name, percentile]) => [name, stored(percentile, scale)]),
      );

    return storedValue;
  });

  return { values, scaleOfMetric };
}

interface PlannedComparison {
  metric: Metric;
  node: NodeId;
  candidate: string;
  vs: string;
  isPrimary: boolean;
}

/** Every pair the plan compares, for every metric, at every node where both sides have a value. */
function planComparisons(plan: Results, tree: NodeTree, valueByKey: Map<string, Value>): PlannedComparison[] {
  const pairs = pairsOf(plan);
  const planned: PlannedComparison[] = [];

  for (const metric of plan.metrics) {
    const hasValue = (node: NodeId, candidate: string) => valueByKey.has(valueKey(metric.id, node, candidate));
    const nodesWithValues = tree.nodesInDeclaredOrder.filter((node) => pairs.some((pair) => hasValue(node, pair.vs)));
    const primaryNodes = primaryNodesOf(plan, tree, metric, nodesWithValues);

    for (const node of nodesWithValues) {
      for (const { candidate, vs } of pairs) {
        if (hasValue(node, candidate) && hasValue(node, vs))
          planned.push({ metric, node, candidate, vs, isPrimary: primaryNodes.has(node) });
      }
    }
  }

  return planned;
}

/** The primary comparisons declared in the plan; by default, each metric at the highest nodes where it has values. */
function primaryNodesOf(plan: Results, tree: NodeTree, metric: Metric, nodesWithValues: NodeId[]): Set<NodeId> {
  const declaredPrimaries = plan.analysis?.primary;

  if (!declaredPrimaries) {
    const withValues = new Set(nodesWithValues);

    return new Set(nodesWithValues.filter((node) => !hasAncestorIn(tree, node, withValues)));
  }

  const declaredForMetric = declaredPrimaries.filter((primary) => primary.metric === metric.id);

  for (const primary of declaredForMetric) {
    if (!nodesWithValues.includes(primary.node)) {
      throw new ComputeError(
        "S11",
        "results.analysis.primary",
        `primary comparison on "${metric.id}"${primary.node ? ` at "${primary.node}"` : ""} has no values to compare`,
      );
    }
  }

  return new Set(declaredForMetric.map((primary) => primary.node));
}

function compareWithBaseline(
  plan: Results,
  tree: NodeTree,
  values: Value[],
  scaleOfMetric: Map<string, number>,
  observationsByMetric: Map<string, MetricObservations>,
  seed: string,
  resamples: number,
  participants: number | undefined,
): Comparison[] {
  const valueByKey = new Map(values.map((value) => [valueKey(value.metric, value.node, value.candidate), value]));
  const planned = planComparisons(plan, tree, valueByKey);
  const primaryCount = planned.filter((comparison) => comparison.isPrimary).length;
  const severalPrimaries = primaryCount > 1;
  const bonferroniLevel = severalPrimaries ? 1 - ALPHA / primaryCount : 1 - ALPHA;

  const nodesWithAParent = (metric: string, candidate: string, vs: string) =>
    planned.filter(
      (comparison) =>
        comparison.metric.id === metric &&
        comparison.candidate === candidate &&
        comparison.vs === vs &&
        tree.parentOf.get(comparison.node!) !== undefined,
    ).length;

  const comparisons = planned.map(({ metric, node, candidate, vs, isPrimary }): Comparison => {
    const level = isPrimary ? bonferroniLevel : 1 - ALPHA;
    const scale = metric.compare_as === "relative" ? PERCENT : scaleOfMetric.get(metric.id)!;
    const observations = observationsByMetric.get(metric.id);
    const againstBaseline = vs === plan.baseline;
    const unrounded = observations
      ? measuredEffect({
          observations,
          tree,
          candidate,
          baseline: vs,
          node,
          level,
          seed,
          resamples: isPrimary ? primaryResamplesOf(resamples, primaryCount) : resamples,
          ...(againstBaseline ? {} : { stream: `${candidate}|vs|${vs}` }),
        })
      : effectOfDeclaredValues(
          metric,
          valueByKey.get(valueKey(metric.id, node, candidate))!,
          valueByKey.get(valueKey(metric.id, node, vs))!,
        );

    // The verdict is read from the interval as stored, so anyone can check it from the file alone.
    const storedInterval: [number, number] | undefined = unrounded.ci
      ? [stored(unrounded.ci[0], scale), stored(unrounded.ci[1], scale)]
      : undefined;
    const verdict = withEnoughParticipants(
      storedInterval
        ? verdictOf(storedInterval, metric.direction, metric.minimum_meaningful)
        : { verdict: "inconclusive" as const, qualifier: undefined },
      metric.kind,
      participants,
    );

    const comparison: Comparison = {
      id: comparisonId(metric.id, node, candidate, againstBaseline ? undefined : vs),
      metric: metric.id,
      ...(node !== undefined ? { node } : {}),
      candidate,
      vs,
      effect: stored(unrounded.effect, scale),
      ...(storedInterval ? { ci: storedInterval } : {}),
      ci_level: stored(level, 1),
      verdict: verdict.verdict,
      ...(verdict.qualifier ? { qualifier: verdict.qualifier } : {}),
      ...(verdict.indicative ? { indicative: true } : {}),
      role: isPrimary ? "primary" : "exploratory",
      adjusted: isPrimary && severalPrimaries,
      paired: unrounded.paired,
      method: unrounded.method,
      source: observations ? "computed" : "declared",
    };

    if (observations && metric.failures_count_as === "excluded") {
      comparison.successful_only = true;
      const nodesCheckedTogether =
        node !== undefined && tree.parentOf.get(node) !== undefined ? nodesWithAParent(metric.id, candidate, vs) : 1;
      const failureShare = failureShareOf(observations, tree, candidate, vs, node, nodesCheckedTogether);

      if (failureShare) comparison.failure_share = failureShare;
    }

    return comparison;
  });

  applyFailureWarnings(comparisons, tree);

  return comparisons;
}

/**
 * The participants of a study: the units of the first level of repetition, as
 * observed, on the side with the fewest. Successful attempts are not the
 * measure: a participant who gave up still took part.
 */
export function participantsOf(observed: Results["observed"]): number | undefined {
  return observed?.levels[0]?.n;
}

/**
 * Failure shares of both sides in percent, with Newcombe's interval of their
 * difference; absent when nothing failed. A node below the root also gets the
 * interval adjusted for all the nodes checked with it (Bonferroni): only that
 * one may carry its warning up to its parents, otherwise a suite of 50 tasks
 * would show a warning on its headline most of the time by chance alone.
 */
function failureShareOf(
  observations: MetricObservations,
  tree: NodeTree,
  candidate: string,
  baseline: string,
  node: NodeId,
  nodesCheckedTogether: number,
): Comparison["failure_share"] {
  const ofCandidate = failedAttemptsUnder(observations, tree, candidate, node);
  const ofBaseline = failedAttemptsUnder(observations, tree, baseline, node);

  if (ofCandidate.failed + ofBaseline.failed === 0) return undefined;

  const differenceInterval = newcombe(
    ofCandidate.failed,
    ofCandidate.attempts,
    ofBaseline.failed,
    ofBaseline.attempts,
    VALUE_INTERVAL_LEVEL,
  );

  const inPercent = (interval: [number, number]): [number, number] => [
    stored(PERCENT * interval[0], PERCENT),
    stored(PERCENT * interval[1], PERCENT),
  ];
  const adjustedInterval =
    nodesCheckedTogether > 1
      ? newcombe(ofCandidate.failed, ofCandidate.attempts, ofBaseline.failed, ofBaseline.attempts, 1 - ALPHA / nodesCheckedTogether)
      : undefined;

  return {
    candidate: stored((PERCENT * ofCandidate.failed) / ofCandidate.attempts, PERCENT),
    baseline: stored((PERCENT * ofBaseline.failed) / ofBaseline.attempts, PERCENT),
    difference_ci: inPercent(differenceInterval),
    ...(adjustedInterval ? { difference_ci_adjusted: inPercent(adjustedInterval) } : {}),
  };
}

function observedLevelsAndTimestamps(plan: Results, rawFiles: Record<string, RawFile>): NonNullable<Results["observed"]> {
  const rows = plan.raw_data.flatMap((rawFile) => rawFiles[rawFile.id].rows);
  const levels = plan.runs.levels.map((level) => {
    const distinctByCandidate = new Map<string, Set<string>>();

    for (const row of rows) {
      const levelValue = row[level.field];

      if (levelValue === undefined) continue;

      let distinct = distinctByCandidate.get(row.candidate);

      if (!distinct) distinctByCandidate.set(row.candidate, (distinct = new Set()));

      distinct.add(levelValue);
    }

    const countPerCandidate = [...distinctByCandidate.values()].map((distinct) => distinct.size);
    const fewest = countPerCandidate.length > 0 ? Math.min(...countPerCandidate) : 0;
    const most = countPerCandidate.length > 0 ? Math.max(...countPerCandidate) : 0;

    return { level: level.level, field: level.field, n: fewest, ...(most !== fewest ? { n_max: most } : {}) };
  });

  const servicesNotControlled = new Set(plan.candidates.filter((candidate) => candidate.service).map((candidate) => candidate.id));
  const distinctTimestamps = new Set<string>();
  let first: string | undefined;
  let last: string | undefined;

  for (const row of rows) {
    if (row.ts === undefined) {
      if (servicesNotControlled.has(row.candidate)) {
        throw new ComputeError(
          "F15",
          "results.raw_data",
          `"${row.candidate}" is a service you do not control: every one of its raw rows needs a ts field`,
        );
      }

      continue;
    }

    const time = Date.parse(row.ts);

    if (Number.isNaN(time)) throw new ComputeError("F15", "results.raw_data", `ts "${row.ts}" is not a date-time`);

    distinctTimestamps.add(row.ts);

    if (first === undefined || time < Date.parse(first)) first = row.ts;

    if (last === undefined || time > Date.parse(last)) last = row.ts;
  }

  const timestamps = first !== undefined && last !== undefined ? { timestamps: { first, last, distinct: distinctTimestamps.size } } : {};

  return { levels, ...timestamps };
}
