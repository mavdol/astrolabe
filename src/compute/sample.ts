import type { MetricObservations, Statistic } from "./observations.js";
import { ComputeError } from "./raw-data.js";
import type { Xoshiro128 } from "./rng.js";
import { mean, minObservations, quantileSelect, quantileSorted } from "./stats.js";
import { aggregationPlanFor, type Aggregation, type NodeId, type NodeTree } from "./structure.js";

export type GroupsAggregation = "macro" | "micro";

/** One unit on one data node: its observations, and their mean on the scale of the statistic. */
export interface UnitEntry {
  dataNodeIndex: number;
  unitId: string;
  scaledMean: number;
  observations: number[];
}

/**
 * The observations of one candidate under one node, arranged for resampling.
 * A resampling group is a unit, or a cluster of units; groups are in
 * code-unit order of their keys so that every implementation draws alike.
 */
export interface Sample {
  aggregation: Aggregation;
  dataNodeCount: number;
  groupKeys: string[];
  groups: UnitEntry[][];
  unitEntryCount: number;
}

export function buildSample(
  observations: MetricObservations,
  tree: NodeTree,
  candidate: string,
  node: NodeId,
  keepUnit?: (dataNode: NodeId, unitId: string) => boolean,
): Sample | null {
  const cellsByNode = observations.cellsByCandidate.get(candidate);

  if (!cellsByNode) return null;

  const plan = aggregationPlanFor(tree, node, new Set(cellsByNode.keys()));

  if (!plan) return null;

  const scale = observations.statistic.type === "quantile" ? 1 : observations.statistic.scale;
  const entriesByGroupKey = new Map<string, UnitEntry[]>();
  let unitEntryCount = 0;

  plan.dataNodes.forEach((dataNode, dataNodeIndex) => {
    for (const unit of cellsByNode.get(dataNode)!.units.values()) {
      if (unit.observations.length === 0) continue;

      if (keepUnit && !keepUnit(dataNode, unit.id)) continue;

      const groupKey = observations.hasClusters ? (unit.cluster ?? unit.id) : unit.id;
      let entries = entriesByGroupKey.get(groupKey);

      if (!entries) entriesByGroupKey.set(groupKey, (entries = []));

      entries.push({ dataNodeIndex, unitId: unit.id, scaledMean: mean(unit.observations) * scale, observations: unit.observations });
      unitEntryCount++;
    }
  });
  const groupKeys = [...entriesByGroupKey.keys()].sort();

  return {
    aggregation: plan.aggregation,
    dataNodeCount: plan.dataNodes.length,
    groupKeys,
    groups: groupKeys.map((key) => entriesByGroupKey.get(key)!),
    unitEntryCount,
  };
}

/** The statistic of a sample; given group indexes, the statistic of that resample. */
export type Estimator = (resampledGroups?: Int32Array) => number;

export function createEstimator(sample: Sample, statistic: Statistic, groupsAggregation: GroupsAggregation): Estimator {
  const { groups, aggregation, dataNodeCount } = sample;
  const groupCount = groups.length;
  const allEntries = groups.flat();
  const entryCount = allEntries.length;

  const firstEntryOfGroup = new Int32Array(groupCount + 1);

  groups.forEach((group, groupIndex) => (firstEntryOfGroup[groupIndex + 1] = firstEntryOfGroup[groupIndex] + group.length));
  const dataNodeOfEntry = Int32Array.from(allEntries, (entry) => entry.dataNodeIndex);

  const meanOfChildren = (valueOfDataNode: (dataNodeIndex: number) => number): number => {
    const valueOf = (part: Aggregation): number => {
      if ("dataNodeIndex" in part) return valueOfDataNode(part.dataNodeIndex);

      let sum = 0;
      let childrenWithAValue = 0;

      for (const child of part.children) {
        const childValue = valueOf(child);

        if (Number.isNaN(childValue)) continue;

        sum += childValue;
        childrenWithAValue++;
      }

      return childrenWithAValue > 0 ? sum / childrenWithAValue : NaN;
    };

    return valueOf(aggregation);
  };

  if (statistic.type !== "quantile") {
    const scaledMeanOfEntry = Float64Array.from(allEntries, (entry) => entry.scaledMean);
    const sumByDataNode = new Float64Array(dataNodeCount);
    const countByDataNode = new Float64Array(dataNodeCount);

    return (resampledGroups) => {
      sumByDataNode.fill(0);
      countByDataNode.fill(0);
      const drawCount = resampledGroups ? resampledGroups.length : groupCount;

      for (let draw = 0; draw < drawCount; draw++) {
        const group = resampledGroups ? resampledGroups[draw] : draw;

        for (let entry = firstEntryOfGroup[group]; entry < firstEntryOfGroup[group + 1]; entry++) {
          sumByDataNode[dataNodeOfEntry[entry]] += scaledMeanOfEntry[entry];
          countByDataNode[dataNodeOfEntry[entry]]++;
        }
      }

      if (statistic.type === "total" || groupsAggregation === "micro") {
        let sum = 0;
        let count = 0;

        for (let dataNode = 0; dataNode < dataNodeCount; dataNode++) {
          sum += sumByDataNode[dataNode];
          count += countByDataNode[dataNode];
        }

        return statistic.type === "total" ? sum : count > 0 ? sum / count : NaN;
      }

      return meanOfChildren((dataNode) => (countByDataNode[dataNode] > 0 ? sumByDataNode[dataNode] / countByDataNode[dataNode] : NaN));
    };
  }

  const firstObservationOfEntry = new Int32Array(entryCount + 1);

  allEntries.forEach(
    (entry, entryIndex) => (firstObservationOfEntry[entryIndex + 1] = firstObservationOfEntry[entryIndex] + entry.observations.length),
  );
  const observationValues = Float64Array.from(allEntries.flatMap((entry) => entry.observations));
  let largestGroupSize = 0;

  for (let group = 0; group < groupCount; group++) {
    const groupSize = firstObservationOfEntry[firstEntryOfGroup[group + 1]] - firstObservationOfEntry[firstEntryOfGroup[group]];

    largestGroupSize = Math.max(largestGroupSize, groupSize);
  }

  const probability = statistic.probability;
  const poolsAllDataNodes = groupsAggregation === "micro" || dataNodeCount === 1;
  const pools = Array.from(
    { length: poolsAllDataNodes ? 1 : dataNodeCount },
    () => new Float64Array(Math.max(1, largestGroupSize * groupCount)),
  );
  const poolSizes = new Int32Array(pools.length);

  return (resampledGroups) => {
    poolSizes.fill(0);
    const drawCount = resampledGroups ? resampledGroups.length : groupCount;

    for (let draw = 0; draw < drawCount; draw++) {
      const group = resampledGroups ? resampledGroups[draw] : draw;

      for (let entry = firstEntryOfGroup[group]; entry < firstEntryOfGroup[group + 1]; entry++) {
        const poolIndex = poolsAllDataNodes ? 0 : dataNodeOfEntry[entry];
        const pool = pools[poolIndex];
        let size = poolSizes[poolIndex];

        for (let observation = firstObservationOfEntry[entry]; observation < firstObservationOfEntry[entry + 1]; observation++)
          pool[size++] = observationValues[observation];

        poolSizes[poolIndex] = size;
      }
    }

    const quantileOfPool = (poolIndex: number) =>
      poolSizes[poolIndex] > 0 ? quantileSelect(pools[poolIndex], poolSizes[poolIndex], probability) : NaN;

    return poolsAllDataNodes ? quantileOfPool(0) : meanOfChildren(quantileOfPool);
  };
}

export function drawGroupsWithReplacement(generator: Xoshiro128, resampledGroups: Int32Array): void {
  const groupCount = resampledGroups.length;

  for (let draw = 0; draw < groupCount; draw++) resampledGroups[draw] = generator.below(groupCount);
}

/** Percentile bootstrap interval; the bounds are type-7 quantiles of the resampled statistics. */
export function percentileInterval(resampledStatistics: Float64Array, count: number, level: number): [number, number] | null {
  if (count < 2) return null;

  const sorted = resampledStatistics.subarray(0, count).sort();
  const tailProbability = (1 - level) / 2;

  return [quantileSorted(sorted, tailProbability, count), quantileSorted(sorted, 1 - tailProbability, count)];
}

/**
 * A percentile bootstrap on a few groups gives intervals far too narrow. It is
 * held to the bar of a distribution-free interval: the observations that
 * interval would need for the statistic at this level (6 for a median at 95%,
 * 8 at 98.75%, 72 for a 95th percentile); a mean is held to the bar of a median.
 */
export function fewestGroupsForBootstrap(statistic: Statistic, level: number): number {
  return minObservations(statistic.type === "quantile" ? statistic.probability : 0.5, level);
}

export const TOO_FEW_FOR_AN_INTERVAL = "too few observations for an interval";

const LARGEST_RESAMPLED_GROUP_COUNT = 2097151;

export function requireResamplableSize(groupCount: number, path: string): void {
  if (groupCount > LARGEST_RESAMPLED_GROUP_COUNT) {
    throw new ComputeError(
      "S1",
      path,
      `${groupCount} resampling units: the bootstrap supports up to ${LARGEST_RESAMPLED_GROUP_COUNT.toLocaleString("en")}`,
    );
  }
}
