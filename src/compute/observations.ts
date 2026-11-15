import type { Metric, Results } from "../schema/benchmark.js";
import { ComputeError, type RawFile } from "./raw-data.js";
import { quantileSorted } from "./stats.js";
import type { NodeId, NodeTree } from "./structure.js";

export type Statistic = { type: "mean" | "total"; scale: number } | { type: "quantile"; probability: number };

const PERCENT = 100;

export function statisticOf(metric: Metric): Statistic {
  switch (metric.statistic) {
    case "mean":
      return { type: "mean", scale: 1 };
    case "share":
    case "rate":
      return { type: "mean", scale: PERCENT };
    case "total":
      return { type: "total", scale: 1 };
    case "median":
    case "p50":
      return { type: "quantile", probability: 0.5 };
    case "p95":
      return { type: "quantile", probability: 0.95 };
    case "p99":
      return { type: "quantile", probability: 0.99 };
  }
}

/** What is resampled and counted as one independent observation: an item, else a run, else a row. */
export type UnitKind = "item" | "run" | "row";

export interface MeasuredUnit {
  id: string;
  cluster?: string;
  observations: number[];
  lostAnObservationToTheOutlierRule: boolean;
}

/** Everything measured for one candidate on one node. */
export interface Cell {
  units: Map<string, MeasuredUnit>;
  attempts: number;
  failedAttempts: number;
  failuresByReason: Map<string, number>;
  observationsBeforeOutlierRule: number;
  observationsRemovedByOutlierRule: number;
}

export interface MetricObservations {
  metric: Metric;
  statistic: Statistic;
  unitKind: UnitKind;
  hasClusters: boolean;
  cellsByCandidate: Map<string, Map<NodeId, Cell>>;
}

const MINIMUM_OBSERVATIONS_FOR_TUKEY = 4;

export const DEFAULT_TUKEY_K = 1.5;

export function collectObservations(
  results: Results,
  metric: Metric,
  rawFiles: Record<string, RawFile>,
  tree: NodeTree,
): MetricObservations {
  const metricIndex = results.metrics.indexOf(metric);
  const path = `results.metrics[${metricIndex}].from`;
  const source = metric.from!;
  const rawFile = rawFiles[source.raw];

  if (!rawFile) throw new ComputeError("F16", path, `raw file "${source.raw}" was not found or is not listed in raw_data`);

  const rows = rawFile.rows.filter((row) => row.measure === source.measure);

  if (rows.length === 0) throw new ComputeError("F18", path, `raw file "${source.raw}" has no row with measure "${source.measure}"`);

  const knownCandidates = new Set(results.candidates.map((candidate) => candidate.id));
  const unitKind: UnitKind = rows.some((row) => row.item !== undefined)
    ? "item"
    : rows.some((row) => row.run !== undefined)
      ? "run"
      : "row";
  const cellsByCandidate = new Map<string, Map<NodeId, Cell>>();

  rows.forEach((row, rowIndex) => {
    if (!knownCandidates.has(row.candidate)) throw new ComputeError("F18", path, `raw row names an unknown candidate "${row.candidate}"`);

    let node: NodeId;

    if (tree.hasStructure) {
      if (row.node === undefined)
        throw new ComputeError("Q9", path, `the file has a structure, so every row of "${source.measure}" needs a node`);

      if (!tree.parentOf.has(row.node)) throw new ComputeError("Q9", path, `raw row names an unknown node "${row.node}"`);

      node = row.node;
    }

    const cell = cellFor(cellsByCandidate, row.candidate, node);
    const unitId = unitKind === "item" ? row.item : unitKind === "run" ? row.run : `#${rowIndex}`;

    if (unitId === undefined) throw new ComputeError("F18", path, `some rows of "${source.measure}" have "${unitKind}" and others do not`);

    let unit = cell.units.get(unitId);

    if (!unit)
      cell.units.set(unitId, (unit = { id: unitId, cluster: row.cluster, observations: [], lostAnObservationToTheOutlierRule: false }));

    cell.attempts++;
    const statusSaysFailed = row.status !== undefined && row.status !== "ok";

    if (row.value !== null && !statusSaysFailed) {
      unit.observations.push(row.value);

      return;
    }

    if (metric.failures_count_as === undefined) {
      throw new ComputeError(
        "T8",
        `results.metrics[${metricIndex}].failures_count_as`,
        `raw data of "${metric.id}" has failed observations: declare failures_count_as ("zero" or "excluded")`,
      );
    }

    const reason = statusSaysFailed ? row.status! : "failed";

    cell.failedAttempts++;
    cell.failuresByReason.set(reason, (cell.failuresByReason.get(reason) ?? 0) + 1);

    if (metric.failures_count_as === "zero") unit.observations.push(0);
  });

  const outlierRule = results.analysis?.outliers;
  const tukeyApplies = outlierRule?.rule === "tukey" && (outlierRule.metrics === undefined || outlierRule.metrics.includes(metric.id));

  if (tukeyApplies) {
    for (const cellsByNode of cellsByCandidate.values())
      for (const cell of cellsByNode.values()) removeTukeyOutliers(cell, outlierRule.k ?? DEFAULT_TUKEY_K);
  }

  return { metric, statistic: statisticOf(metric), unitKind, hasClusters: rows.some((row) => row.cluster !== undefined), cellsByCandidate };
}

function cellFor(cellsByCandidate: Map<string, Map<NodeId, Cell>>, candidate: string, node: NodeId): Cell {
  let cellsByNode = cellsByCandidate.get(candidate);

  if (!cellsByNode) cellsByCandidate.set(candidate, (cellsByNode = new Map()));

  let cell = cellsByNode.get(node);

  if (!cell) {
    cell = {
      units: new Map(),
      attempts: 0,
      failedAttempts: 0,
      failuresByReason: new Map(),
      observationsBeforeOutlierRule: 0,
      observationsRemovedByOutlierRule: 0,
    };
    cellsByNode.set(node, cell);
  }

  return cell;
}

/** Tukey's fences on the observations of one candidate and node. The raw file is never edited. */
function removeTukeyOutliers(cell: Cell, k: number): void {
  const sorted = [...cell.units.values()].flatMap((unit) => unit.observations).sort((a, b) => a - b);

  cell.observationsBeforeOutlierRule = sorted.length;

  if (sorted.length < MINIMUM_OBSERVATIONS_FOR_TUKEY) return;

  const firstQuartile = quantileSorted(sorted, 0.25);
  const thirdQuartile = quantileSorted(sorted, 0.75);
  const lowerFence = firstQuartile - k * (thirdQuartile - firstQuartile);
  const upperFence = thirdQuartile + k * (thirdQuartile - firstQuartile);

  for (const unit of cell.units.values()) {
    const kept = unit.observations.filter((observation) => observation >= lowerFence && observation <= upperFence);

    if (kept.length === unit.observations.length) continue;

    cell.observationsRemovedByOutlierRule += unit.observations.length - kept.length;
    unit.lostAnObservationToTheOutlierRule = true;
    unit.observations = kept;
  }
}
