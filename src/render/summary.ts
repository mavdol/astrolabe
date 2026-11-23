import type { Comparison, Metric, Results } from "../schema/benchmark.js";
import type { SUMMARY_CHARTS } from "../schema/presentation.js";
import { comparesEveryPair, primaryNodesOf, standingsOn, type Standing } from "./standing.js";
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
  /** Where the candidate stands among the others on each part, when the summary counts who is best. */
  standings?: Standing[];
}

export function summaryOf(results: Results, candidate: string, metric: string): Summary {
  const comparisons = (results.comparisons ?? []).filter(
    (comparison) =>
      comparison.role === "primary" &&
      comparison.candidate === candidate &&
      comparison.metric === metric &&
      comparison.vs === results.baseline,
  );

  return { candidate, metric, comparisons };
}

export type SummaryDrawing = (typeof SUMMARY_CHARTS)[number];

/**
 * What one summary block draws: a bar per candidate, counting either its primary comparisons with the baseline by
 * verdict, or the parts where it is best, tied for best or behind among the candidates shown.
 */
export interface SummaryChart {
  metric: string;
  drawing: SummaryDrawing;
  count: "verdicts" | "best";
  summaries: Summary[];
}

interface SummaryRequest {
  metric: string;
  candidates?: string[];
  chart?: SummaryDrawing;
  sort?: "value" | "declared";
  count?: "verdicts" | "best";
}

/** The candidate with most better (or best) parts first, then the one with fewest worse; ties keep the declared order. */
function byResults(metric: Metric, summaries: Summary[]): Summary[] {
  const countOn = (summary: Summary, side: BarSide) => barsOf(metric, summary).find((bar) => bar.side === side)?.count ?? 0;

  return [...summaries].sort(
    (first, second) => countOn(second, "better") - countOn(first, "better") || countOn(first, "worse") - countOn(second, "worse"),
  );
}

function chartOf(results: Results, metric: string, summaries: Summary[], request: Omit<SummaryRequest, "metric">): SummaryChart {
  const metricEntry = results.metrics.find((entry) => entry.id === metric)!;

  return {
    metric,
    drawing: request.chart ?? "diverging-bar",
    count: request.count ?? "verdicts",
    summaries: request.sort === "declared" ? summaries : byResults(metricEntry, summaries),
  };
}

/** The candidates a summary block draws: those it names; otherwise every candidate compared with the baseline, or all of them when it counts who is best. */
export function summaryCandidatesOf(results: Results, block: { candidates?: string[]; count?: "verdicts" | "best" }): string[] {
  const every = results.candidates.map((candidate) => candidate.id);

  return block.candidates ?? (block.count === "best" ? every : every.filter((candidate) => candidate !== results.baseline));
}

/** The parts of a metric where every pair of the candidates was compared, with each candidate's standing there. */
export function bestSummariesOf(results: Results, metric: string, candidates: string[]): Summary[] {
  const standingsByNode = primaryNodesOf(results, metric).flatMap((node) => {
    const standings = standingsOn(results, metric, node, candidates);

    return standings ? [{ node, standings }] : [];
  });
  const shown = new Set(candidates);
  const counted = new Set(standingsByNode.map(({ node }) => node));

  return candidates.map((candidate) => ({
    candidate,
    metric,
    comparisons: (results.comparisons ?? []).filter(
      (comparison) =>
        comparison.role === "primary" &&
        comparison.metric === metric &&
        counted.has(comparison.node) &&
        shown.has(comparison.candidate) &&
        shown.has(comparison.vs) &&
        (comparison.candidate === candidate || comparison.vs === candidate),
    ),
    standings: standingsByNode.map(({ standings }) => standings.get(candidate)!),
  }));
}

export function summaryChartOf(results: Results, block: SummaryRequest): SummaryChart {
  const candidates = summaryCandidatesOf(results, block);
  const summaries =
    block.count === "best"
      ? bestSummariesOf(results, block.metric, candidates)
      : candidates.map((candidate) => summaryOf(results, candidate, block.metric));

  return chartOf(results, block.metric, summaries, block);
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

/**
 * One chart per metric with something to count, metrics in declared order: where every candidate stands on each part
 * when the plan compares every pair, otherwise each candidate's verdicts against the baseline.
 */
export function summaryChartsOf(results: Results): SummaryChart[] {
  if (comparesEveryPair(results))
    return results.metrics.flatMap((metric) => {
      const summaries = bestSummariesOf(
        results,
        metric.id,
        results.candidates.map((candidate) => candidate.id),
      );
      const countable = summaries.length > 0 && (summaries[0].standings?.length ?? 0) > 1 && isCountable(results, summaries[0]);

      return countable ? [chartOf(results, metric.id, summaries, { count: "best", sort: "declared" })] : [];
    });

  return results.metrics.flatMap((metric) => {
    const summaries = results.candidates
      .map((candidate) => summaryOf(results, candidate.id, metric.id))
      .filter((summary) => isCountable(results, summary));

    return summaries.length > 0 ? [chartOf(results, metric.id, summaries, {})] : [];
  });
}

/** Every comparison a summary chart counts. */
export const comparisonsOfChart = (chart: SummaryChart) => chart.summaries.flatMap((summary) => summary.comparisons);

/** "Model A, Model B and Model C". */
export const listedNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

/** "Model A and Model C compared with Model B": who a summary chart compares, with whom; the candidates alone when it counts who is best. */
export function chartPairOf(lookup: Lookup, chart: SummaryChart): string {
  const listed = listedNames(chart.summaries.map((summary) => lookup.candidateName.get(summary.candidate) ?? summary.candidate));

  return chart.count === "best" ? listed : `${listed} compared with ${lookup.candidateName.get(lookup.results.baseline)}`;
}

/** "12 files": how many parts the summary counts, named after their level. */
export function partsOf(lookup: Lookup, summary: Summary): string {
  const level = lookup.results.structure?.nodes.find((node) => node.id === summary.comparisons[0]?.node)?.level;
  const count = summary.standings?.length ?? summary.comparisons.length;

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

/** The bars of a summary: its verdicts against the baseline, or where it stands among the others: best, tied for best, behind. */
export function barsOf(metric: Metric, summary: Summary): VerdictBar[] {
  if (!summary.standings) return verdictBarsOf(metric, summary.comparisons);

  const standings = summary.standings;
  const countOf = (standing: Standing) => standings.filter((entry) => entry === standing).length;

  return [
    { side: "better", words: "best", count: countOf("best"), likely: 0 },
    { side: "same", words: "tied for best", count: countOf("tied"), likely: 0 },
    { side: "worse", words: "behind", count: countOf("behind"), likely: 0 },
  ];
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
  const pair = summary.standings
    ? lookup.candidateName.get(summary.candidate)
    : `${lookup.candidateName.get(summary.candidate)} compared with ${lookup.candidateName.get(lookup.results.baseline)}`;
  const counts = barsOf(metric, summary)
    .filter((bar) => bar.count > 0)
    .map((bar) => `${bar.words} on ${bar.count}${bar.likely > 0 ? ` (${bar.likely} likely)` : ""}`);

  return `${pair}, ${lowerFirstLetterOfWord(metric.label)} on ${partsOf(lookup, summary)}: ${counts.join(", ")}.`;
}

/** What a bar of a summary chart stands for, and on a diverging chart which side is which. */
export function summaryKeyOf(lookup: Lookup, chart: SummaryChart): string {
  const parts = partsOf(lookup, chart.summaries[0]);
  const baseline = lookup.candidateName.get(lookup.results.baseline);
  const words = directionWordsOf(lookup.metricById.get(chart.metric)!);

  if (chart.count === "best") {
    const among = `among the ${chart.summaries.length}`;

    switch (chart.drawing) {
      case "diverging-bar":
        return `Each bar: the ${parts}, by where the candidate stands ${among}; best to the right of the line, behind to the left.`;
      case "stacked-bar":
        return `Each bar: the ${parts}, by where the candidate stands ${among}.`;
      case "grouped-bar":
        return `Each bar: on how many of the ${parts} the candidate stood there, ${among}.`;
    }
  }

  switch (chart.drawing) {
    case "diverging-bar":
      return `Each bar: the ${parts}, by their result against ${baseline}; ${words.better} to the right of the line, ${words.worse} to the left.`;
    case "stacked-bar":
      return `Each bar: the ${parts}, by their result against ${baseline}.`;
    case "grouped-bar":
      return `Each bar: how many of the ${parts} had that result against ${baseline}.`;
  }
}

/** The legend of a summary chart, in the order its bars read from left to right; "likely" when some part only likely is. */
export function legendOf(metric: Metric, chart: SummaryChart): { side: BarSide | "likely"; words: string }[] {
  const everyBar = chart.summaries.flatMap((summary) => barsOf(metric, summary));
  const present = barsOf(metric, chart.summaries[0]).filter(
    (bar) => bar.side !== "unclear" || everyBar.some((other) => other.side === "unclear" && other.count > 0),
  );
  const order: BarSide[] =
    chart.drawing === "diverging-bar" ? ["worse", "same", "better", "unclear"] : ["better", "same", "worse", "unclear"];
  const sides = order.flatMap((side) => present.filter((bar) => bar.side === side).map((bar) => ({ side, words: bar.words })));

  return [
    ...(chart.drawing === "grouped-bar" ? [] : sides),
    ...(everyBar.some((bar) => bar.likely > 0 && bar.side !== "unclear")
      ? [{ side: "likely" as const, words: "Faded: likely, not certain yet" }]
      : []),
  ];
}

/** One part of a bar, placed on the chart's span in counts from its left edge; its likely part first when that is nearer the line. */
export interface PlacedSegment {
  bar: VerdictBar;
  start: number;
  likelyFirst: boolean;
}

/** The bars of a stacked or diverging summary on one span; `zero` is where the line between worse and better sits. */
export interface BarLayout {
  span: number;
  zero?: number;
  bars: { summary: Summary; segments: PlacedSegment[] }[];
}

/** The space left between a diverging bar and its unclear part, as a share of the bar's span. */
const UNCLEAR_GAP_SHARE = 0.05;

/**
 * Where each part of each bar sits. Stacked: better, about the same, worse, unclear, from the left. Diverging: worse to
 * the left of a line and better to its right, so that both start from it; about the same centred on the line; unclear
 * set apart after the bar. A likely part sits next to the line and its firm part outside, as the stronger answers do.
 */
export function barLayoutOf(metric: Metric, chart: SummaryChart): BarLayout {
  const barsBySide = chart.summaries.map((summary) => new Map(barsOf(metric, summary).map((bar) => [bar.side, bar] as const)));
  const countOn = (bars: Map<BarSide, VerdictBar>, side: BarSide) => bars.get(side)?.count ?? 0;

  if (chart.drawing !== "diverging-bar") {
    return {
      span: Math.max(...chart.summaries.map((summary) => summary.comparisons.length)),
      bars: chart.summaries.map((summary, index) => {
        let start = 0;

        return {
          summary,
          segments: [...barsBySide[index].values()]
            .filter((bar) => bar.count > 0)
            .map((bar) => {
              const placed = { bar, start, likelyFirst: false };

              start += bar.count;

              return placed;
            }),
        };
      }),
    };
  }

  const left = Math.max(...barsBySide.map((bars) => countOn(bars, "worse") + countOn(bars, "same") / 2));
  const right = Math.max(...barsBySide.map((bars) => countOn(bars, "better") + countOn(bars, "same") / 2));
  const unclear = Math.max(...barsBySide.map((bars) => countOn(bars, "unclear")));
  const gap = unclear > 0 ? (left + right) * UNCLEAR_GAP_SHARE : 0;
  const startOf = (bars: Map<BarSide, VerdictBar>, side: BarSide) =>
    side === "worse"
      ? left - countOn(bars, "same") / 2 - countOn(bars, "worse")
      : side === "same"
        ? left - countOn(bars, "same") / 2
        : side === "better"
          ? left + countOn(bars, "same") / 2
          : left + right + gap;

  return {
    span: left + right + gap + unclear,
    zero: left,
    bars: chart.summaries.map((summary, index) => ({
      summary,
      segments: (["worse", "same", "better", "unclear"] as const).flatMap((side) => {
        const bar = barsBySide[index].get(side);

        return bar && bar.count > 0 ? [{ bar, start: startOf(barsBySide[index], side), likelyFirst: side === "better" }] : [];
      }),
    })),
  };
}

/** The bars of a grouped summary: one group per result, a bar per candidate in it, all on one scale from zero. */
export function countGroupsOf(
  metric: Metric,
  chart: SummaryChart,
): { side: BarSide; words: string; bars: { summary: Summary; bar: VerdictBar }[] }[] {
  const sides = legendOf(metric, { ...chart, drawing: "stacked-bar" }).filter((item) => item.side !== "likely");

  return sides.map(({ side, words }) => ({
    side: side as BarSide,
    words,
    bars: chart.summaries.map((summary) => ({
      summary,
      bar: barsOf(metric, summary).find((bar) => bar.side === side) ?? {
        side: side as BarSide,
        words,
        count: 0,
        likely: 0,
      },
    })),
  }));
}
