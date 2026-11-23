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

export const pluralOf = (word: string) =>
  /(s|x|sh|ch)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;

/**
 * The answer when it is a pattern rather than one result: every primary comparison of one candidate on one
 * metric, such as one candidate's build time on each of thirty files.
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

/** What one summary block draws: a stacked bar per candidate, each counting its primary comparisons on one metric. */
export interface SummaryChart {
  metric: string;
  summaries: Summary[];
}

/** The candidates a summary block draws: those it names, or every candidate compared with the baseline. */
export function summaryCandidatesOf(results: Results, block: { candidates?: string[] }): string[] {
  return block.candidates ?? results.candidates.map((candidate) => candidate.id).filter((candidate) => candidate !== results.baseline);
}

export function summaryChartOf(results: Results, block: { metric: string; candidates?: string[] }): SummaryChart {
  return {
    metric: block.metric,
    summaries: summaryCandidatesOf(results, block).map((candidate) => summaryOf(results, candidate, block.metric)),
  };
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

/** One chart per metric with something to count, metrics in declared order, each with the candidates it can count. */
export function summaryChartsOf(results: Results): SummaryChart[] {
  return results.metrics.flatMap((metric) => {
    const summaries = results.candidates
      .map((candidate) => summaryOf(results, candidate.id, metric.id))
      .filter((summary) => isCountable(results, summary));

    return summaries.length > 0 ? [{ metric: metric.id, summaries }] : [];
  });
}

/** Every comparison a summary chart counts. */
export const comparisonsOfChart = (chart: SummaryChart) => chart.summaries.flatMap((summary) => summary.comparisons);

/** "Model A and Model C compared with Model B": who a summary chart compares, with whom. */
export function chartPairOf(lookup: Lookup, chart: SummaryChart): string {
  const names = chart.summaries.map((summary) => lookup.candidateName.get(summary.candidate) ?? summary.candidate);
  const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

  return `${listed} compared with ${lookup.candidateName.get(lookup.results.baseline)}`;
}

/** "12 files": how many parts the summary counts, named after their level. */
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

export type BarSide = "better" | "same" | "worse" | "unclear";

/** One bar of a summary: how many comparisons fell on one side, and how many of those only likely. */
export interface VerdictBar {
  side: BarSide;
  /** The side in the reader's words: "faster", "about the same", "slower", "unclear". */
  words: string;
  count: number;
  likely: number;
}

const barSideOf = (comparison: Comparison): BarSide =>
  comparison.verdict === "better"
    ? "better"
    : comparison.verdict === "worse"
      ? "worse"
      : comparison.verdict === "equivalent"
        ? "same"
        : "unclear";

/**
 * The bars of a summary, in reading order: better, about the same, worse, each drawn even at zero so two summaries
 * read alike; unclear only when some comparison is.
 */
export function verdictBarsOf(metric: Metric, comparisons: Comparison[]): VerdictBar[] {
  const words = directionWordsOf(metric);
  const wordsOf: Record<BarSide, string> = { better: words.better, same: "about the same", worse: words.worse, unclear: "unclear" };

  return (["better", "same", "worse", "unclear"] as const).flatMap((side) => {
    const onSide = comparisons.filter((comparison) => barSideOf(comparison) === side);

    if (side === "unclear" && onSide.length === 0) return [];

    return [{ side, words: wordsOf[side], count: onSide.length, likely: onSide.filter((comparison) => comparison.qualifier).length }];
  });
}

/** What follows a bar's count when some of it is only likely: " likely" when all of it is, " · 1 likely" otherwise. */
export const likelyPartOf = (bar: VerdictBar) => (bar.likely === 0 ? "" : bar.likely === bar.count ? " likely" : ` · ${bar.likely} likely`);

/** "3, 1 of them likely": a bar's count in words. */
export const barCountOf = (bar: VerdictBar) =>
  bar.likely === 0
    ? String(bar.count)
    : bar.likely === bar.count
      ? `${bar.count}, all likely`
      : `${bar.count}, ${bar.likely} of them likely`;

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

/** "quickmark compared with markly, build time on 12 files: faster on 3 (1 likely), about the same on 8, slower on 1." */
export function summaryClaimOf(lookup: Lookup, summary: Summary): string {
  const metric = lookup.metricById.get(summary.metric)!;
  const pair = `${lookup.candidateName.get(summary.candidate)} compared with ${lookup.candidateName.get(lookup.results.baseline)}`;
  const counts = verdictBarsOf(metric, summary.comparisons)
    .filter((bar) => bar.count > 0)
    .map((bar) => `${bar.words} on ${bar.count}${bar.likely > 0 ? ` (${bar.likely} likely)` : ""}`);

  return `${pair}, ${lowerFirstLetterOfWord(metric.label)} on ${partsOf(lookup, summary)}: ${counts.join(", ")}.`;
}

/** "Each bar: the 12 files, by their result against markly.": what a bar of a summary chart stands for. */
export function stacksKeyOf(lookup: Lookup, chart: SummaryChart): string {
  return `Each bar: the ${partsOf(lookup, chart.summaries[0])}, by their result against ${lookup.candidateName.get(lookup.results.baseline)}.`;
}
