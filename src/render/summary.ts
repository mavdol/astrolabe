import type { Comparison, Metric, Results } from "../schema/benchmark.js";
import { effectAndInterval, lowerFirstLetterOfWord, verdictLabel, type Lookup } from "./describe.js";

export const VERDICTS_IN_READING_ORDER = ["better", "likely better", "equivalent", "inconclusive", "likely worse", "worse"];

/** The verdicts in words a reader uses when the comparisons mix metrics: "equivalent" is "about the same", "inconclusive" "unclear". */
const READER_WORDS: Record<string, string> = { equivalent: "about the same", inconclusive: "unclear" };

/** "5 better, 1 likely better, 6 about the same": the verdicts present, in reading order. */
export function countsByVerdict(comparisons: Comparison[]): string {
  return VERDICTS_IN_READING_ORDER.flatMap((verdict) => {
    const count = comparisons.filter((comparison) => verdictLabel(comparison) === verdict).length;

    return count > 0 ? [`${count} ${READER_WORDS[verdict] ?? verdict}`] : [];
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

/** The words a reader uses for the two directions of a metric: "faster" and "slower" for a run time rather than "better" and "worse". */
function directionWordsOf(metric: Metric): { better: string; worse: string } {
  switch (metric.kind) {
    case "run_time":
    case "latency":
      return { better: "faster", worse: "slower" };
    case "memory":
    case "cpu":
    case "energy":
      return { better: "lower", worse: "higher" };
    case "cost":
      return { better: "cheaper", worse: "more expensive" };
    case "throughput":
      return { better: "higher", worse: "lower" };
    default:
      return { better: "better", worse: "worse" };
  }
}

/** A verdict in the reader's words: "likely faster", "about the same", "unclear". */
export function plainVerdictOf(metric: Metric, comparison: Comparison): string {
  const words = directionWordsOf(metric);
  const word =
    comparison.verdict === "better"
      ? words.better
      : comparison.verdict === "worse"
        ? words.worse
        : comparison.verdict === "equivalent"
          ? "about the same"
          : "unclear";

  return comparison.qualifier ? `${comparison.qualifier} ${word}` : word;
}

/** The comparisons grouped by verdict, in reading order, each group with its words: "4 faster", "6 about the same". */
export function plainCountsOf(metric: Metric, comparisons: Comparison[]): { words: string; count: number; sample: Comparison }[] {
  return VERDICTS_IN_READING_ORDER.flatMap((verdict) => {
    const withVerdict = comparisons.filter((comparison) => verdictLabel(comparison) === verdict);

    return withVerdict.length > 0
      ? [{ words: plainVerdictOf(metric, withVerdict[0]), count: withVerdict.length, sample: withVerdict[0] }]
      : [];
  });
}

/**
 * The smallest and the largest change in the reader's words, so the counts are not read without their size:
 * "From 20% faster to 21% slower", "From 5% to 19% faster". Changes not in percent keep their signed figures.
 */
export function effectRangeOf(lookup: Lookup, summary: Summary): string {
  const metric = lookup.metricById.get(summary.metric)!;
  const sorted = [...summary.comparisons].sort((first, second) => first.effect - second.effect);
  const lowest = effectAndInterval(metric, sorted[0]);
  const highest = effectAndInterval(metric, sorted[sorted.length - 1]);

  if (lowest.unit.trim() !== "%")
    return lowest.effect === highest.effect ? `${lowest.effect} on every one` : `From ${lowest.effectNumber} to ${highest.effect}`;

  const words = directionWordsOf(metric);
  const sideOf = (effect: number) => (effect < 0 === (metric.direction === "lower") ? words.better : words.worse);
  const sizeOf = (effectNumber: string) => `${effectNumber.replace(/^[+−-]/, "")}%`;
  const [best, worst] = metric.direction === "lower" ? [sorted[0], sorted[sorted.length - 1]] : [sorted[sorted.length - 1], sorted[0]];
  const [bestText, worstText] = metric.direction === "lower" ? [lowest, highest] : [highest, lowest];

  if (best.effect === worst.effect) return `${sizeOf(bestText.effectNumber)} ${sideOf(best.effect)} on every one`;

  if (sideOf(best.effect) === sideOf(worst.effect)) {
    const [smaller, larger] = Math.abs(best.effect) < Math.abs(worst.effect) ? [bestText, worstText] : [worstText, bestText];

    return `From ${sizeOf(smaller.effectNumber)} to ${sizeOf(larger.effectNumber)} ${sideOf(best.effect)}`;
  }

  return `From ${sizeOf(bestText.effectNumber)} ${sideOf(best.effect)} to ${sizeOf(worstText.effectNumber)} ${sideOf(worst.effect)}`;
}

/** "Node.js 24 compared with Node.js 22, wall time on 12 workloads: faster on 4, about the same on 6, slower on 2." */
export function summaryClaimOf(lookup: Lookup, summary: Summary): string {
  const metric = lookup.metricById.get(summary.metric)!;
  const pair = `${lookup.candidateName.get(summary.candidate)} compared with ${lookup.candidateName.get(lookup.results.baseline)}`;
  const counts = plainCountsOf(metric, summary.comparisons).map(({ words, count }) => `${words} on ${count}`);

  return `${pair}, ${lowerFirstLetterOfWord(metric.label)} on ${partsOf(lookup, summary)}: ${counts.join(", ")}.`;
}

/** How to read the squares, said once under them: what a square is, what its colour and its outline mean. */
export function squaresKeyOf(lookup: Lookup, summaries: Summary[]): string {
  const levels = new Set(
    summaries.map(
      (summary) => lookup.results.structure?.nodes.find((node) => node.id === summary.comparisons[0]?.node)?.level ?? "comparison",
    ),
  );
  const each = levels.size === 1 ? [...levels][0] : "comparison";

  return `One square per ${each}: green when it does better than ${lookup.candidateName.get(lookup.results.baseline)}, orange when it does worse, grey when it is about the same; outlined when the difference is not certain yet.`;
}
