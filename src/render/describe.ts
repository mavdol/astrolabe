import { resultsHash } from "../compute/files.js";
import { descendantsOf, hasAncestorIn, nodeTreeOf, type NodeTree } from "../compute/structure.js";
import { VALUE_INTERVAL_LEVEL } from "../compute/values.js";
import type { Benchmark, Comparison, Metric, Results, Value } from "../schema/benchmark.js";
import {
  decimalsForPercentage,
  decimalsForUncertainty,
  decimalsWithoutUncertainty,
  formatInterval,
  formatLevel,
  formatNumber,
  type Decimals,
} from "./number-format.js";

export interface BuildContext {
  /** Version of the generator writing the output. */
  generatorVersion: string;
  /** Day of the build, YYYY-MM-DD. */
  buildDate: string;
  /** Present when the build runs in CI: the commit and a link to the run. */
  continuousIntegration?: { commit: string; runUrl?: string };
  /** The README card to show at the top of the Markdown, as a <picture> with paths relative to it. */
  cardPicture?: string;
}

export const SHORT_HASH_LENGTH = 12;
export const STATISTIC_WORD: Record<Metric["statistic"], string> = {
  mean: "Mean",
  median: "Median",
  p50: "Median",
  p95: "95th percentile",
  p99: "99th percentile",
  rate: "Rate",
  share: "Share",
  total: "Total",
};

export interface Lookup {
  results: Results;
  tree: NodeTree;
  candidateName: Map<string, string>;
  nodeLabel: Map<string, string>;
  nodeDepth: Map<string, number>;
  metricById: Map<string, Metric>;
}

export function lookupOf(results: Results): Lookup {
  const tree = nodeTreeOf(results);
  const nodeDepth = new Map<string, number>();
  const depthOf = (node: string): number => {
    const parent = tree.parentOf.get(node);

    return parent === undefined ? 0 : depthOf(parent) + 1;
  };

  for (const node of results.structure?.nodes ?? []) nodeDepth.set(node.id, depthOf(node.id));

  return {
    results,
    tree,
    candidateName: new Map(results.candidates.map((candidate) => [candidate.id, candidate.name])),
    nodeLabel: new Map((results.structure?.nodes ?? []).map((node) => [node.id, node.label])),
    nodeDepth,
    metricById: new Map(results.metrics.map((metric) => [metric.id, metric])),
  };
}

/**
 * Whether the comparison rests on scores from judges who knew which candidate was which,
 * which validate only accepts for data gathered before the plan.
 */
export function restsOnUnblindedJudges(lookup: Lookup, comparison: Comparison): boolean {
  const { judge, structure } = lookup.results;

  if (judge?.blinded !== false) return false;

  const metric = lookup.metricById.get(comparison.metric)!;

  if (metric.kind === "preference") return true;

  if (metric.kind !== "quality") return false;

  if (!lookup.tree.hasStructure) return true;

  const judgedNodes = new Set([
    ...(judge.used_for ?? []),
    ...(structure?.nodes ?? []).filter((node) => node.scoring === "judge").map((node) => node.id),
  ]);

  if (comparison.node === undefined) return judgedNodes.size > 0;

  return (
    judgedNodes.has(comparison.node) ||
    hasAncestorIn(lookup.tree, comparison.node, judgedNodes) ||
    descendantsOf(lookup.tree, comparison.node).some((node) => judgedNodes.has(node))
  );
}

export const isPercentage = (metric: Metric) => metric.unit === "%";

/** "Wall time" becomes "wall time" inside a sentence; "SUS score" keeps its acronym. */
export const lowerFirstLetterOfWord = (label: string) =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;

export function effectUnit(metric: Metric): string {
  if (metric.compare_as === "relative") return "%";

  return isPercentage(metric) ? " points" : ` ${metric.unit}`;
}

export function effectDecimals(metric: Metric, comparison: Comparison): Decimals | null {
  const isInPercent = metric.compare_as === "relative" || isPercentage(metric);

  if (isInPercent) return decimalsForPercentage(comparison.effect);

  const supportedByInterval = decimalsForUncertainty(undefined, comparison.ci, comparison.ci_level);

  if (supportedByInterval !== null || comparison.source === "declared") return supportedByInterval;

  return decimalsWithoutUncertainty(comparison.effect);
}

/** One number of decimals down a column, so values compare by eye: the finest any of its rows needs. */
export function finestDecimals(decimalsOfRows: (Decimals | null)[]): Decimals | null {
  const known = decimalsOfRows.filter((decimals): decimals is Decimals => decimals !== null);

  return known.length > 0 ? Math.max(...known) : null;
}

export function valueDecimals(metric: Metric, value: Value): Decimals | null {
  if (isPercentage(metric)) return decimalsForPercentage(value.value);

  const supportedByInterval = decimalsForUncertainty(value.se, value.ci, value.ci_level);

  if (supportedByInterval !== null || value.source === "declared") return supportedByInterval;

  const { min, max } = value.percentiles ?? {};
  const supportedByRange =
    min !== undefined && max !== undefined ? decimalsForUncertainty(undefined, [min, max], VALUE_INTERVAL_LEVEL) : null;

  return supportedByRange ?? decimalsWithoutUncertainty(value.value);
}

export function verdictLabel(comparison: Comparison): string {
  return comparison.qualifier ? `${comparison.qualifier} ${comparison.verdict}` : comparison.verdict;
}

/** The effect of a comparison and its interval, rounded to what the interval supports, with their unit. */
export function effectAndInterval(
  metric: Metric,
  comparison: Comparison,
): { effect: string; effectNumber: string; unit: string; interval: string | null; level: string | null } {
  const decimals = effectDecimals(metric, comparison);
  const unit = effectUnit(metric);
  const effectNumber = formatNumber(comparison.effect, decimals, { signed: true });
  const hasMeasuredInterval = comparison.ci !== undefined && comparison.source !== "declared";

  return {
    effect: `${effectNumber}${unit}`,
    effectNumber,
    unit,
    interval: hasMeasuredInterval ? `${formatInterval(comparison.ci!, decimals, { signed: true })}${unit}` : null,
    level: hasMeasuredInterval ? `${formatLevel(comparison.ci_level!)}%` : null,
  };
}

const LARGEST_FACTOR_DECIMALS = 2;

/** The word that says which way a factor goes, so that no factor is read as a gain when it is a loss. */
function factorWord(metric: Metric, ratioIsAboveOne: boolean): string {
  switch (metric.kind) {
    case "run_time":
    case "latency":
      return ratioIsAboveOne ? "slower" : "faster";
    case "memory":
    case "cpu":
    case "energy":
      return ratioIsAboveOne ? "more" : "less";
    case "cost":
      return ratioIsAboveOne ? "more expensive" : "cheaper";
    default:
      return ratioIsAboveOne ? "higher" : "lower";
  }
}

/**
 * A relative effect as a factor, the larger value over the smaller, with its word: "2.0× faster".
 * Its interval is the interval of the ratio turned the same way, or null when that interval reaches 1.
 */
export function effectAsFactor(metric: Metric, comparison: Comparison): { factor: string; interval: string | null } {
  const ratio = 1 + comparison.effect / 100;
  const isAboveOne = ratio >= 1;
  const hasMeasuredInterval = comparison.ci !== undefined && comparison.source !== "declared";
  const ratioInterval = hasMeasuredInterval ? comparison.ci!.map((effect) => 1 + effect / 100) : undefined;
  const staysOnOneSide = ratioInterval !== undefined && (isAboveOne ? ratioInterval[0] > 1 : ratioInterval[1] < 1 && ratioInterval[0] > 0);
  const factorInterval: [number, number] | undefined = staysOnOneSide
    ? isAboveOne
      ? [ratioInterval![0], ratioInterval![1]]
      : [1 / ratioInterval![1], 1 / ratioInterval![0]]
    : undefined;
  const supported = factorInterval ? decimalsForUncertainty(undefined, factorInterval, comparison.ci_level) : null;
  const decimals = Math.min(Math.max(supported ?? 1, 0), LARGEST_FACTOR_DECIMALS);
  const factor = isAboveOne ? ratio : 1 / ratio;

  return {
    factor: `${formatNumber(factor, decimals)}× ${factorWord(metric, isAboveOne)}`,
    interval: factorInterval ? `${formatInterval(factorInterval, decimals)}×` : null,
  };
}

export type EffectFormat = "percent" | "times";

const TEMPLATE = /\{(candidate|metric|node|effect|verdict):([^}]+)\}/g;

/** Fills the templates of a block title or description: names, effects and verdicts always come from the results. */
export function resolveTemplates(text: string, lookup: Lookup, effectFormat: EffectFormat = "percent"): string {
  const comparisonById = new Map((lookup.results.comparisons ?? []).map((comparison) => [comparison.id, comparison]));

  return text.replace(TEMPLATE, (template, kind: string, id: string) => {
    if (kind === "candidate") return lookup.candidateName.get(id) ?? template;

    if (kind === "metric") return lookup.metricById.get(id)?.label ?? template;

    if (kind === "node") return lookup.nodeLabel.get(id) ?? template;

    const comparison = comparisonById.get(id);

    if (!comparison) return template;

    const metric = lookup.metricById.get(comparison.metric)!;

    if (kind === "verdict") return verdictLabel(comparison);

    return effectFormat === "times" && metric.compare_as === "relative"
      ? effectAsFactor(metric, comparison).factor
      : effectAndInterval(metric, comparison).effect;
  });
}

/** The parts of the provenance line every output carries: hash of the results, date, source, CI run, generator. */
export function provenanceParts(
  benchmark: Benchmark,
  context: BuildContext,
): {
  hash: string;
  date: string;
  source: string;
  continuousIntegration?: { commit: string; runUrl?: string };
  generator: string;
  attribution: boolean;
} {
  const attribution = (benchmark.style as { attribution?: boolean } | undefined)?.attribution !== false;
  const commit = context.continuousIntegration?.commit.slice(0, SHORT_HASH_LENGTH);

  return {
    hash: resultsHash(benchmark.results).slice(0, SHORT_HASH_LENGTH),
    date: context.buildDate,
    source: benchmark.results.artifacts.repo,
    ...(commit ? { continuousIntegration: { commit, runUrl: context.continuousIntegration!.runUrl } } : {}),
    generator: attribution ? `built with astrolabe-bench ${context.generatorVersion}` : `astrolabe-bench ${context.generatorVersion}`,
    attribution,
  };
}

/** The build date: SOURCE_DATE_EPOCH when set, as reproducible builds expect, otherwise today. */
export function buildDateFrom(environment: NodeJS.ProcessEnv, now: Date = new Date()): string {
  const epoch = environment.SOURCE_DATE_EPOCH;
  const date = epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : now;

  return date.toISOString().slice(0, 10);
}

/** The commit and run link GitHub Actions exposes; other CI systems can be added here. */
export function continuousIntegrationFrom(environment: NodeJS.ProcessEnv): BuildContext["continuousIntegration"] {
  if (environment.GITHUB_ACTIONS !== "true" || !environment.GITHUB_SHA) return undefined;

  const runUrl =
    environment.GITHUB_SERVER_URL && environment.GITHUB_REPOSITORY && environment.GITHUB_RUN_ID
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`
      : undefined;

  return { commit: environment.GITHUB_SHA, runUrl };
}
