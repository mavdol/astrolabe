import type { Comparison, Results } from "../schema/benchmark.js";
import { effectAndInterval, lowerFirstLetterOfWord, verdictLabel, type Lookup } from "./describe.js";

export const VERDICTS_IN_READING_ORDER = ["better", "likely better", "equivalent", "inconclusive", "likely worse", "worse"];

/** "5 better, 1 likely better, 6 equivalent": the verdicts present, in reading order. */
export function countsByVerdict(comparisons: Comparison[]): string {
  return VERDICTS_IN_READING_ORDER.flatMap((verdict) => {
    const count = comparisons.filter((comparison) => verdictLabel(comparison) === verdict).length;

    return count > 0 ? [`${count} ${verdict}`] : [];
  }).join(", ");
}

export const inReadingOrder = (comparisons: Comparison[]): Comparison[] =>
  [...comparisons].sort(
    (first, second) => VERDICTS_IN_READING_ORDER.indexOf(verdictLabel(first)) - VERDICTS_IN_READING_ORDER.indexOf(verdictLabel(second)),
  );

export const pluralOf = (word: string) =>
  /(s|x|sh|ch)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;

/**
 * The answer when it is a pattern rather than one result: every primary comparison of one candidate on one
 * metric, such as a new version's run time on each of twelve scripts.
 */
export interface Summary {
  candidate: string;
  metric: string;
  comparisons: Comparison[];
}

export function summaryOf(results: Results, candidate: string, metric: string): Summary {
  const comparisons = (results.comparisons ?? []).filter(
    (comparison) => comparison.role === "primary" && comparison.candidate === candidate && comparison.metric === metric,
  );

  return { candidate, metric, comparisons };
}

/** The levels of the structure a summary's comparisons sit on: one, so that a total is never counted with its own parts. */
export function levelsOf(results: Results, summary: Summary): Set<string | undefined> {
  return new Set(summary.comparisons.map((comparison) => results.structure?.nodes.find((node) => node.id === comparison.node)?.level));
}

/** Several primary comparisons, all on one level of the structure: what a summary can count. */
export function isCountable(results: Results, summary: Summary): boolean {
  const levels = levelsOf(results, summary);

  return summary.comparisons.length > 1 && levels.size === 1 && !levels.has(undefined);
}

/** One summary per candidate and metric it can count, candidates then metrics in declared order. */
export function summariesOf(results: Results): Summary[] {
  return results.candidates.flatMap((candidate) =>
    results.metrics.map((metric) => summaryOf(results, candidate.id, metric.id)).filter((summary) => isCountable(results, summary)),
  );
}

/** "12 workloads": how many parts the summary counts, named after their level. */
export function partsOf(lookup: Lookup, summary: Summary): string {
  const level = lookup.results.structure?.nodes.find((node) => node.id === summary.comparisons[0]?.node)?.level;
  const count = summary.comparisons.length;

  return level ? `${count} ${count === 1 ? level : pluralOf(level)}` : `${count} comparisons`;
}

/** "From −19 to +5.7%": the smallest and the largest effect, so the counts are not read without their size. */
export function effectRangeOf(lookup: Lookup, summary: Summary): string {
  const metric = lookup.metricById.get(summary.metric)!;
  const sorted = [...summary.comparisons].sort((first, second) => first.effect - second.effect);
  const lowest = effectAndInterval(metric, sorted[0]);
  const highest = effectAndInterval(metric, sorted[sorted.length - 1]);

  return lowest.effect === highest.effect ? `${lowest.effect} on every one` : `From ${lowest.effectNumber} to ${highest.effect}`;
}

/** "Node.js 26 against Node.js 22, wall time across 12 workloads: 5 better, 6 equivalent, 1 worse." */
export function summaryClaimOf(lookup: Lookup, summary: Summary): string {
  const pair = `${lookup.candidateName.get(summary.candidate)} against ${lookup.candidateName.get(lookup.results.baseline)}`;
  const metric = lowerFirstLetterOfWord(lookup.metricById.get(summary.metric)!.label);

  return `${pair}, ${metric} across ${partsOf(lookup, summary)}: ${countsByVerdict(summary.comparisons)}.`;
}
