import type { Comparison, Metric, Results } from "../schema/benchmark.js";
import type { SUMMARY_CHARTS } from "../schema/presentation.js";
import { comparesEveryPair, primaryNodesOf, standingsOn, type Standing } from "./standing.js";
import { capitalised } from "./chart/chart-content.js";
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
  standings?: { node: string | undefined; standing: Standing }[];
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

/**
 * How counts are drawn when the block does not say. Who is best: one bar per candidate from the left, best first, behind
 * last; every candidate counts the same parts, so best starts and behind ends at the same place on every bar. Verdicts
 * against the baseline: around a line that stands for no difference, better on its right.
 */
const defaultDrawingOf = (count: "verdicts" | "best"): SummaryDrawing => (count === "best" ? "stacked-bar" : "diverging-bar");

function chartOf(results: Results, metric: string, summaries: Summary[], request: Omit<SummaryRequest, "metric">): SummaryChart {
  const metricEntry = results.metrics.find((entry) => entry.id === metric)!;

  const count = request.count ?? "verdicts";

  return {
    metric,
    drawing: request.chart ?? defaultDrawingOf(count),
    count,
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
    standings: standingsByNode.map(({ node, standings }) => ({ node, standing: standings.get(candidate)! })),
  }));
}

/**
 * What a summary counts when its block does not say: who is best among three candidates or more whose every pair is
 * compared, so that no candidate is the measure of the others; verdicts against the baseline otherwise.
 */
export const defaultCountOf = (results: Results): "verdicts" | "best" =>
  results.candidates.length >= 3 && comparesEveryPair(results) ? "best" : "verdicts";

export function summaryChartOf(results: Results, request: SummaryRequest): SummaryChart {
  const block = { ...request, count: request.count ?? defaultCountOf(results) };
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
  if (defaultCountOf(results) === "best")
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

/** How many parts a summary counts, and the name of a number of them: "file" and "files" after their level. */
function countedPartsOf(lookup: Lookup, summary: Summary): { count: number; nameFor: (count: number) => string } {
  const level = lookup.results.structure?.nodes.find((node) => node.id === summary.comparisons[0]?.node)?.level ?? "comparison";

  return {
    count: summary.standings?.length ?? summary.comparisons.length,
    nameFor: (count) => (count === 1 ? level : pluralOf(level)),
  };
}

/** "12 files": how many parts the summary counts, named after their level. */
export function partsOf(lookup: Lookup, summary: Summary): string {
  const { count, nameFor } = countedPartsOf(lookup, summary);

  return `${count} ${nameFor(count)}`;
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
  /** The parts counted on this bar, for a reader who asks which they are, each saying whether it is only likely. */
  parts: { node: string | undefined; likely: boolean }[];
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

    return [
      {
        side,
        words: wordsOf[side],
        parts: onSide.map((comparison) => ({ node: comparison.node, likely: Boolean(comparison.qualifier) })),
        count: onSide.length,
        likely: onSide.filter((comparison) => comparison.qualifier).length,
      },
    ];
  });
}

/** The bars of a summary: its verdicts against the baseline, or where it stands among the others: best, tied for best, behind. */
export function barsOf(metric: Metric, summary: Summary): VerdictBar[] {
  if (!summary.standings) return verdictBarsOf(metric, summary.comparisons);

  const standings = summary.standings;
  const barOf = (side: BarSide, standing: Standing): VerdictBar => {
    const parts = standings.filter((entry) => entry.standing === standing).map((entry) => ({ node: entry.node, likely: false }));

    return { side, words: STANDING_WORDS[standing], parts, count: parts.length, likely: 0 };
  };

  return [barOf("better", "best"), barOf("same", "tied"), barOf("worse", "behind")];
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

/**
 * A summary's data: one row per part it counts, one column per candidate, each cell the result the bars count there
 * ("best", "tied for best", "behind", or a verdict in the metric's words), so every count can be traced to its parts.
 */
export function summaryTableOf(lookup: Lookup, chart: SummaryChart): { header: string[]; rows: string[][] } {
  const metric = lookup.metricById.get(chart.metric)!;
  const resultsBySummary = chart.summaries.map(
    (summary) =>
      new Map<string | undefined, string>(
        summary.standings
          ? summary.standings.map(({ node, standing }) => [node, STANDING_WORDS[standing]])
          : summary.comparisons.map((comparison) => [comparison.node, plainVerdictOf(metric, comparison)]),
      ),
  );
  const nodes = [...new Set(resultsBySummary.flatMap((results) => [...results.keys()]))];
  const level = lookup.results.structure?.nodes.find((node) => node.id === nodes[0])?.level;

  return {
    header: [
      level ? capitalised(level) : "Part",
      ...chart.summaries.map((summary) => lookup.candidateName.get(summary.candidate) ?? summary.candidate),
    ],
    rows: nodes.map((node) => [
      node === undefined ? "All" : (lookup.nodeLabel.get(node) ?? node),
      ...resultsBySummary.map((results) => results.get(node) ?? "—"),
    ]),
  };
}

const STANDING_WORDS: Record<Standing, string> = { best: "best", tied: "tied for best", behind: "behind" };

/** The longest title of a summary: one sentence a reader takes in before the chart under it. */
export const LONGEST_SUMMARY_TITLE = 50;

/** "3 (1 likely)": a bar's count, saying how much of it is only likely. */
const countWithLikelyOf = (bar: VerdictBar) => `${bar.count}${bar.likely > 0 ? ` (${bar.likely} likely)` : ""}`;

/** Who is best on most parts, in wordings from the fullest to the shortest. */
function bestTitlesOf(lookup: Lookup, chart: SummaryChart): string[] {
  const metric = lookup.metricById.get(chart.metric)!;
  const { count: total, nameFor } = countedPartsOf(lookup, chart.summaries[0]);
  const countOn = (summary: Summary, side: BarSide) => barsOf(metric, summary).find((bar) => bar.side === side)?.count ?? 0;
  const nameOf = (summary: Summary) => lookup.candidateName.get(summary.candidate) ?? summary.candidate;
  const most = Math.max(...chart.summaries.map((summary) => countOn(summary, "better")));

  if (most === 0)
    return chart.summaries.every((summary) => countOn(summary, "same") === total)
      ? [`Too close to separate on all ${total} ${nameFor(total)}`, `Too close to separate on all ${total}`]
      : [`No clear best on any of the ${total} ${nameFor(total)}`, `No clear best on any of the ${total}`];

  const leaders = chart.summaries.filter((summary) => countOn(summary, "better") === most);

  if (leaders.length > 1) {
    const names = listedNames(leaders.map(nameOf));

    return [
      `${names} are best on ${most} ${nameFor(most)} each`,
      `${names} are best on ${most} each`,
      `${leaders.length} candidates are best on ${most} ${nameFor(most)} each`,
    ];
  }

  const leader = nameOf(leaders[0]);
  const tied = countOn(leaders[0], "same");

  if (most === total) return [`${leader} is best on all ${total} ${nameFor(total)}`, `${leader} is best on all ${total}`];

  return [
    ...(tied > 0 ? [`${leader} is best on ${most} of ${total} ${nameFor(total)}, tied on ${tied}`] : []),
    `${leader} is best on ${most} of ${total} ${nameFor(total)}`,
    `${leader} is best on ${most} of ${total}`,
  ];
}

/** How the candidate with most better results compares with the baseline, in wordings from the fullest to the shortest. */
function verdictTitlesOf(lookup: Lookup, chart: SummaryChart): string[] {
  const metric = lookup.metricById.get(chart.metric)!;
  const words = directionWordsOf(metric);
  const baseline = lookup.candidateName.get(lookup.results.baseline) ?? lookup.results.baseline;
  const barOn = (summary: Summary, side: BarSide) =>
    barsOf(metric, summary).find((bar) => bar.side === side) ?? { side, words: "", parts: [], count: 0, likely: 0 };
  const leader = chart.summaries.reduce((most, summary) => (barOn(summary, "better").count > barOn(most, "better").count ? summary : most));
  const name = lookup.candidateName.get(leader.candidate) ?? leader.candidate;
  const { count: total, nameFor } = countedPartsOf(lookup, leader);
  const [better, worse, same] = [barOn(leader, "better"), barOn(leader, "worse"), barOn(leader, "same")];
  const outOf = `of ${total} ${nameFor(total)}`;

  if (better.count > 0)
    return [
      ...(worse.count > 0
        ? [`${name} is ${words.better} on ${countWithLikelyOf(better)} ${outOf}, ${words.worse} on ${countWithLikelyOf(worse)}`]
        : []),
      `${name} is ${words.better} than ${baseline} on ${countWithLikelyOf(better)} ${outOf}`,
      `${name} is ${words.better} on ${countWithLikelyOf(better)} ${outOf}`,
      `${name} is ${words.better} on ${countWithLikelyOf(better)} of ${total}`,
    ];

  if (worse.count > 0)
    return [
      `${name} is ${words.worse} than ${baseline} on ${countWithLikelyOf(worse)} ${outOf}`,
      `${name} is ${words.worse} on ${countWithLikelyOf(worse)} ${outOf}`,
      `${name} is ${words.worse} on ${countWithLikelyOf(worse)} of ${total}`,
    ];

  if (same.count === total)
    return [
      `${name} is about the same as ${baseline} on all ${total} ${nameFor(total)}`,
      `${name} is about the same on all ${total} ${nameFor(total)}`,
      `About the same on all ${total} ${nameFor(total)}`,
    ];

  return [
    `${name} is neither ${words.better} nor ${words.worse} on any ${nameFor(1)}`,
    `Neither ${words.better} nor ${words.worse} on any of the ${total}`,
  ];
}

/**
 * What a reader should take from a summary chart before reading it, in one sentence of at most LONGEST_SUMMARY_TITLE
 * characters: who is best on most parts, or how the candidate with most better results compares with the baseline.
 * The fullest wording that fits stands; the shortest when none does, with long names.
 */
export function summaryTitleOf(lookup: Lookup, chart: SummaryChart): string {
  const wordings = chart.count === "best" ? bestTitlesOf(lookup, chart) : verdictTitlesOf(lookup, chart);

  return wordings.find((wording) => wording.length <= LONGEST_SUMMARY_TITLE) ?? wordings[wordings.length - 1];
}

/** What a bar of a summary chart stands for, and on a diverging chart which side is which. */
export function summaryKeyOf(lookup: Lookup, chart: SummaryChart): string {
  const parts = partsOf(lookup, chart.summaries[0]);
  const baseline = lookup.candidateName.get(lookup.results.baseline);
  const words = directionWordsOf(lookup.metricById.get(chart.metric)!);

  if (chart.count === "best") {
    // Every part was measured on every candidate: said first, so the reader sees each part as a test they all took.
    const measuredOnAll = `each measured on all ${chart.summaries.length} candidates`;

    switch (chart.drawing) {
      case "diverging-bar":
        return `Each bar: the ${parts}, ${measuredOnAll}; best to the right of the line, behind to the left.`;
      case "stacked-bar":
        return `Each bar: the ${parts}, ${measuredOnAll}, by where this one placed.`;
      case "grouped-bar":
        return `Each bar: on how many of the ${parts}, ${measuredOnAll}, this one placed there.`;
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
      span: Math.max(...chart.summaries.map((summary) => summary.standings?.length ?? summary.comparisons.length)),
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
        parts: [],
        count: 0,
        likely: 0,
      },
    })),
  }));
}
