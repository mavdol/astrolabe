import { KINDS_MEASURED_ON_YOUR_MACHINES, type Benchmark, type Comparison, type Metric, type Value } from "../schema/benchmark.js";
import { capitalised, withUnit } from "./chart/chart-content.js";
import {
  effectAndInterval,
  labelDecimals,
  lookupOf,
  lowerFirstLetterOfWord,
  provenanceParts,
  resolveTemplates,
  restsOnUnblindedJudges,
  STATISTIC_WORD,
  verdictLabel,
  type BuildContext,
  type Lookup,
} from "./describe.js";
import { seriesStylesOf, THEME, type Colours, type Mode } from "../themes/astrolabe.js";
import { formatNumber } from "./number-format.js";
import {
  comparisonsOfChart,
  countsByVerdict,
  effectRangeOf,
  likelyPartOf,
  pluralOf,
  summaryKeyOf,
  legendOf,
  barLayoutOf,
  countGroupsOf,
  summaryChartOf,
  summaryChartsOf,
  summaryClaimOf,
  barsOf,
  type BarSide,
  type Summary,
  type SummaryChart,
  type SummaryDrawing,
  type VerdictBar,
} from "./summary.js";
import { CAP_HEIGHT_RATIO, escapeXml, SvgTextRenderer, type TextStyle } from "./svg-text.js";

export type CardMode = Mode;

const WIDTH = 800;
/** Space between the frame and the text of the header and the footer. */
const PADDING = 36;
/** Space between the hairlines of a cell and its content. */
const CELL_PADDING = 28;
/** The least space a cell keeps inside its hairlines, when a verdict needs the room. */
const SMALLEST_CELL_PADDING = 16;
/** A summary's stacked bars, one per candidate under its name, and their legend. */
const STACK_HEIGHT = 26;
const STACK_GAP = 14;
const LEGEND_SWATCH = 10;
const LEGEND_GAP = 16;
/** The likely part of a segment: its side's colour, lighter. */
const LIKELY_OPACITY = 0.38;
/** The sizes a figure steps down through, all of them, so that every figure fits its column. */
const EFFECT_SIZES = [56, 48, 40, 32];
const STRIP_HEIGHT = 28;
const STRIP_SCALE_ROW = 22;
const CHIP_HEIGHT = 26;
const CHIP_PADDING = 10;
const CHIP_DOT_SIZE = 6;
const CHIP_GAP = 8;
const CHIP_STROKE_OPACITY = 0.4;
const BAR_ROW = 26;
const BAR_HEIGHT = 12;
const WARNING_ICON_SIZE = 12;

export const TICK_MARK_WIDTH = 28;
/** The gap between the groups of the top line, a small dot in its middle, as on the site. */
const EYEBROW_GAP = 22;
const HALO_RADIUS = 10;
const HALO_OPACITY = 0.16;

export const MAX_HEADLINES = 3;

/**
 * Every size is at least 12 px at the card's own width, the smallest text readable once shown in a README.
 * Labels, verdicts and the small print are in Geist Mono, the question and the figures in Inter, as on the site.
 */
export const STYLE = {
  eyebrow: { weight: 400, size: 12, lineHeight: 16, tracking: 0.04, mono: true },
  title: { weight: 500, size: 24, lineHeight: 30, tracking: -0.02 },
  label: { weight: 400, size: 12, lineHeight: 17, tracking: 0.04, mono: true },
  effect: { weight: 500, size: 56, lineHeight: 56, tabular: true, tracking: -0.05 },
  effectUnit: { weight: 400, size: 18 },
  heading: { weight: 500, size: 14, lineHeight: 20 },
  chip: { weight: 400, size: 12, tracking: 0.06, mono: true },
  name: { weight: 500, size: 13, lineHeight: 18 },
  detail: { weight: 400, size: 12, lineHeight: 18, mono: true },
  warning: { weight: 500, size: 12, lineHeight: 18, mono: true },
  scale: { weight: 400, size: 12, mono: true },
  counts: { weight: 400, size: 14, lineHeight: 21, mono: true },
} as const;

export interface CardHeadline {
  comparison: Comparison;
  /** The block title, with its templates; absent for the default card. */
  title?: string;
}

export interface CardContent {
  headlines: CardHeadline[];
  /** Summary cells instead of headlines, when the answer is a pattern across many comparisons: a card shows one kind or the other. */
  charts?: SummaryChart[];
  /** Primary comparisons the card does not show, counted by verdict in its footer. */
  omitted: Comparison[];
}

interface HeadlineBlock {
  id: string;
  type: string;
  comparison?: string;
  title?: string;
  metric?: string;
  candidates?: string[];
  chart?: SummaryDrawing;
  sort?: "value" | "declared";
  count?: "verdicts" | "best";
}

/** Every comparison the card's cells stand for: one per headline, all those a summary counts. */
const shownComparisonsOf = (content: CardContent): Comparison[] => [
  ...content.headlines.map(({ comparison }) => comparison),
  ...(content.charts ?? []).flatMap(comparisonsOfChart),
];

/**
 * The headlines of a card: the headline blocks an export names, or by default
 * the first primary comparisons. Other kinds of blocks cannot be drawn on a card yet.
 * Either way the card counts the primary comparisons it leaves out, so a card that shows
 * only some of the results says so.
 */
export function cardContentOf(benchmark: Benchmark, blockIds?: string[]): CardContent {
  const comparisonById = new Map((benchmark.results.comparisons ?? []).map((comparison) => [comparison.id, comparison]));
  const primary = (benchmark.results.comparisons ?? []).filter((comparison) => comparison.role === "primary");

  if (blockIds) {
    const blocks = (benchmark.blocks ?? []) as HeadlineBlock[];
    const named = blockIds.map((blockId) => {
      const block = blocks.find((candidate) => candidate.id === blockId);

      if (!block) throw new Error(`the export names block "${blockId}", which does not exist`);

      if (block.type !== "headline" && block.type !== "summary")
        throw new Error(`block "${blockId}" is a ${block.type}: a card can only show headline or summary blocks for now`);

      return block;
    });

    if (named.every((block) => block.type === "summary")) {
      const charts = named.map((block) => summaryChartOf(benchmark.results, { ...block, metric: block.metric ?? "" }));
      const counted = new Set(charts.flatMap(comparisonsOfChart));

      return { headlines: [], charts, omitted: primary.filter((comparison) => !counted.has(comparison)) };
    }

    const headlines = named.map((block) => {
      if (block.type !== "headline")
        throw new Error(`block "${block.id}" is a summary: a card shows either headline blocks or summary blocks`);

      const comparison = comparisonById.get(block.comparison ?? "");

      if (!comparison) throw new Error(`block "${block.id}" names no existing comparison`);

      return { comparison, title: block.title };
    });

    const shown = new Set(headlines.map(({ comparison }) => comparison.id));

    return { headlines, omitted: primary.filter((comparison) => !shown.has(comparison.id)) };
  }

  const charts = summaryChartsOf(benchmark.results).slice(0, MAX_HEADLINES);

  if (primary.length > MAX_HEADLINES && charts.length > 0) {
    const counted = new Set(charts.flatMap(comparisonsOfChart));

    return { headlines: [], charts, omitted: primary.filter((comparison) => !counted.has(comparison)) };
  }

  return {
    headlines: primary.slice(0, MAX_HEADLINES).map((comparison) => ({ comparison })),
    omitted: primary.slice(MAX_HEADLINES),
  };
}

export function pairOf(lookup: Lookup, comparison: Comparison): string {
  return `${lookup.candidateName.get(comparison.candidate)} against ${lookup.candidateName.get(comparison.vs)}`;
}

/** No structure, or the one node at its top: several top nodes, such as scripts side by side, are each a part. */
export function isTheWholeBenchmark(lookup: Lookup, node: string | undefined): boolean {
  if (node === undefined) return true;

  const topNodes = lookup.tree.nodesInDeclaredOrder.filter((id) => id !== undefined && lookup.tree.parentOf.get(id) === undefined);

  return topNodes.length === 1 && topNodes[0] === node;
}

/** The metric, and the group it is measured on unless that group is the whole benchmark. */
export function measuredOf(lookup: Lookup, comparison: Comparison): string {
  const metric = lookup.metricById.get(comparison.metric)!;

  return isTheWholeBenchmark(lookup, comparison.node) ? metric.label : `${metric.label}, ${lookup.nodeLabel.get(comparison.node!)}`;
}

/** When every headline compares the same two candidates, they are named once above the question. */
function sharedPairOf(lookup: Lookup, content: CardContent): string | null {
  const pairs = new Set(shownComparisonsOf(content).map((comparison) => pairOf(lookup, comparison)));

  return pairs.size === 1 ? [...pairs][0] : null;
}

const directionWords = (metric: Metric) => (metric.direction === "lower" ? "lower is better" : "higher is better");

/** The direction every headline of the card shares, said once under the cells; undefined when they differ, so each cell says its own. */
function sharedDirectionOf(lookup: Lookup, content: CardContent): Metric["direction"] | undefined {
  const directions = new Set(shownComparisonsOf(content).map((comparison) => lookup.metricById.get(comparison.metric)!.direction));

  return directions.size === 1 ? [...directions][0] : undefined;
}

/**
 * The machine, its system and where it ran, when a headline was measured on the author's own machines: a time or a
 * memory read on its own would seem to hold anywhere. Undefined for other benchmarks (an API, a model, people).
 */
function machineOf(benchmark: Benchmark, content: CardContent): string[] | undefined {
  const { results } = benchmark;
  const measuredOnYourMachines = shownComparisonsOf(content).some((comparison) =>
    KINDS_MEASURED_ON_YOUR_MACHINES.has(results.metrics.find((metric) => metric.id === comparison.metric)!.kind),
  );
  const parts = ["hardware", "os", "host"]
    .map((key) => results.environment[key])
    .filter((setting): setting is string => typeof setting === "string" && setting !== "")
    .map(essentialOf);

  return measuredOnYourMachines && parts.length > 0 ? parts : undefined;
}

/**
 * The first clause of an environment setting, which names the thing: "Apple M2" for "Apple M2 (Mac14,7), 8 cores, 8 GB
 * RAM", "Bare metal" for "Bare metal: a laptop, not a virtual machine". The page keeps the whole setting.
 */
const essentialOf = (setting: string) => setting.split(/ \(|, |: |; /)[0].trim();

const normalizedWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}%+−.]+/gu, " ");

/** Words that only say the verdict again, in the comparison's own terms: the chip beside the figure already says it. */
const VERDICT_WORDS = new Set(
  "is are was likely better worse faster slower quicker more less fewer higher lower larger smaller uses use needs takes same equivalent inconclusive than".split(
    " ",
  ),
);

/**
 * A block title is left out when it only restates what the card already
 * shows: the candidates, the metric, the effect and the verdict.
 */
export function addsInformation(resolvedTitle: string, lookup: Lookup, comparison: Comparison): boolean {
  const metric = lookup.metricById.get(comparison.metric)!;
  const alreadyShown = [
    effectAndInterval(metric, comparison).effect,
    verdictLabel(comparison),
    metric.label,
    comparison.node ? (lookup.nodeLabel.get(comparison.node) ?? "") : "",
    lookup.candidateName.get(comparison.candidate) ?? "",
    lookup.candidateName.get(comparison.vs) ?? "",
  ];
  let remaining = ` ${normalizedWords(resolvedTitle)} `;

  for (const shown of alreadyShown.filter(Boolean).sort((first, second) => second.length - first.length)) {
    remaining = remaining.split(` ${normalizedWords(shown).trim()} `).join(" ");
  }

  const metricWords = new Set(normalizedWords(metric.label).split(/\s+/));
  const otherWords = remaining
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["vs", "against", "and"].includes(word) && !VERDICT_WORDS.has(word) && !metricWords.has(word));

  return otherWords.length > 1;
}

/**
 * A headline on a group never stands alone: it gives the range of the groups
 * just below it, so a gain on one task cannot pass for the whole.
 */
function rangeOfChildren(lookup: Lookup, comparison: Comparison): string | null {
  if (comparison.node === undefined) return null;

  const children = new Set(lookup.tree.childrenOf.get(comparison.node) ?? []);
  const childComparisons = (lookup.results.comparisons ?? []).filter(
    (candidate) =>
      candidate.metric === comparison.metric &&
      candidate.candidate === comparison.candidate &&
      candidate.vs === comparison.vs &&
      candidate.node !== undefined &&
      children.has(candidate.node),
  );

  if (childComparisons.length < 2) return null;

  const metric = lookup.metricById.get(comparison.metric)!;
  const sorted = [...childComparisons].sort((first, second) => first.effect - second.effect);
  const lowest = effectAndInterval(metric, sorted[0]);
  const highest = effectAndInterval(metric, sorted[sorted.length - 1]);
  const childLevel = lookup.results.structure?.nodes.find((node) => node.id === sorted[0].node)?.level ?? "group";
  const groups = pluralOf(childLevel);

  // A range stays in its unit: a factor after it would read as the factor of the whole range.
  const [lowestText, highestText] = [lowest, highest].map((end) => `${end.effectNumber}${end.unit}`);

  if (lowestText === highestText) return `${lowestText} in every one of the ${groups}`;

  return `From ${lowest.effectNumber} to ${highestText} across ${groups}`;
}

function observationsOf(lookup: Lookup, comparison: Comparison): string | null {
  const countOf = (candidate: string) =>
    (lookup.results.values ?? []).find(
      (value) => value.metric === comparison.metric && value.candidate === candidate && value.node === comparison.node,
    )?.n;
  const candidateCount = countOf(comparison.candidate);
  const baselineCount = countOf(comparison.vs);

  if (candidateCount === undefined || baselineCount === undefined) return null;

  if (candidateCount === baselineCount) return `n = ${candidateCount} each`;

  return `n = ${candidateCount} (${lookup.candidateName.get(comparison.candidate)}), ${baselineCount} (${lookup.candidateName.get(comparison.vs)})`;
}

export interface Detail {
  text: string;
  isWarning?: boolean;
}

/** The level is written once in the legend when every headline shares it, as primary comparisons do. */
export function detailsOf(lookup: Lookup, comparison: Comparison, sharedLevel: string | null): Detail[] {
  const metric = lookup.metricById.get(comparison.metric)!;
  const { interval, level, exact } = effectAndInterval(metric, comparison);
  const details: Detail[] = [];

  if (comparison.source === "declared") details.push({ text: "Declared values, no interval" });
  else if (exact) details.push({ text: "Exact: every observation the same" });
  else if (interval) details.push({ text: level === sharedLevel ? `Interval ${interval}` : `${level} interval: ${interval}` });
  else details.push({ text: "No interval: too few observations" });

  const observations = observationsOf(lookup, comparison);

  details.push({ text: [STATISTIC_WORD[metric.statistic], observations].filter(Boolean).join(", ") });

  const range = rangeOfChildren(lookup, comparison);

  if (range) details.push({ text: range });

  if (comparison.indicative) details.push({ text: "Indicative: fewer than 20 participants", isWarning: true });

  if (comparison.successful_only) details.push({ text: "Successful attempts only" });

  if (comparison.failure_warning) details.push({ text: "The candidates did not fail equally often", isWarning: true });

  if (restsOnUnblindedJudges(lookup, comparison)) details.push({ text: "The judges knew which candidate was which", isWarning: true });

  return details;
}

/** The text alternative: every headline in words, for screen readers and for the alt of the README image. */
export function cardAltText(benchmark: Benchmark, content: CardContent): string {
  const lookup = lookupOf(benchmark.results);
  const sharedPair = sharedPairOf(lookup, content);

  if (content.charts && content.charts.length > 0)
    return content.charts.flatMap((chart) => chart.summaries.map((summary) => summaryClaimOf(lookup, summary))).join(" ");

  const sentences = content.headlines.map(({ comparison }) => {
    const metric = lookup.metricById.get(comparison.metric)!;
    const measured = `${lowerFirstLetterOfWord(measuredOf(lookup, comparison))} (${directionWords(metric)})`;
    const subject = sharedPair ? measured : `${pairOf(lookup, comparison)}, ${measured}`;

    const unblinded = restsOnUnblindedJudges(lookup, comparison) ? " (the judges knew which candidate was which)" : "";

    return `${subject} ${effectAndInterval(metric, comparison).effect}, ${verdictLabel(comparison)}${unblinded}`;
  });

  return sharedPair ? `${sharedPair}: ${sentences.join("; ")}.` : `${sentences.join("; ")}.`;
}

export interface RenderedCard {
  svg: string;
  altText: string;
  /** Every line of text the card draws, in reading order: the paths cannot be read back. */
  textLines: string[];
  charactersWithoutGlyph: string[];
}

/** Firm conclusions are filled; "likely" and "inconclusive" stay outlined, so the eye tells them apart without colour. */
export function isFirmVerdict(comparison: Comparison): boolean {
  return comparison.qualifier === undefined && comparison.verdict !== "inconclusive";
}

/** The colour of a verdict, always drawn beside its word: better and worse have their own, the others the ink. */
export function verdictColourOf(comparison: Comparison, colours: Colours): string {
  if (comparison.verdict === "better") return colours.good;

  return comparison.verdict === "worse" ? colours.bad : colours.ink;
}

const round = (value: number) => String(Math.round(value * 10) / 10);

/** A percent sign sits against its number, a word unit a space away, as on the site. */
const unitGapOf = (unit: string) => (unit === "%" ? 3 : 8);

/** The colour of a verdict's chip, its word and its strip: better and worse have their own, the others stay grey. */
const chipColourOf = (comparison: Comparison, colours: Colours) =>
  comparison.verdict === "better" ? colours.good : comparison.verdict === "worse" ? colours.bad : colours.secondary;

const chipWidthOf = (text: SvgTextRenderer, verdict: string) =>
  CHIP_PADDING + CHIP_DOT_SIZE + CHIP_GAP + text.measure(verdict, STYLE.chip) + CHIP_PADDING;

/** The verdict as on the site: its word after a dot, in a hairline frame, all in the verdict's colour. */
function verdictChip(text: SvgTextRenderer, verdict: string, x: number, top: number, colour: string, colours: Colours): string {
  const centreY = top + CHIP_HEIGHT / 2;
  const width = chipWidthOf(text, verdict);
  const stroke =
    colour === colours.secondary ? `stroke="${colours.ruleStrong}"` : `stroke="${colour}" stroke-opacity="${CHIP_STROKE_OPACITY}"`;

  return [
    `<rect x="${round(x + 0.5)}" y="${round(top + 0.5)}" width="${round(width - 1)}" height="${CHIP_HEIGHT - 1}" rx="6" fill="none" ${stroke}/>`,
    `<circle cx="${round(x + CHIP_PADDING + CHIP_DOT_SIZE / 2)}" cy="${round(centreY)}" r="${CHIP_DOT_SIZE / 2}" fill="${colour}"/>`,
    text.draw(verdict, x + CHIP_PADDING + CHIP_DOT_SIZE + CHIP_GAP, centreY + (STYLE.chip.size * CAP_HEIGHT_RATIO) / 2, {
      ...STYLE.chip,
      fill: colour,
    }),
  ].join("");
}

export interface ValueFromZero {
  candidate: string;
  value: Value;
}

/**
 * A change in percent is drawn as the two values it compares, from zero, so the ratio is seen rather than read;
 * null when the change is a difference, or a value is missing or below zero.
 */
export function valuesDrawnFromZero(lookup: Lookup, comparison: Comparison): ValueFromZero[] | null {
  const metric = lookup.metricById.get(comparison.metric)!;
  const valueOf = (candidate: string) =>
    (lookup.results.values ?? []).find(
      (value) => value.metric === comparison.metric && value.node === comparison.node && value.candidate === candidate,
    );
  const [subject, baseline] = [valueOf(comparison.candidate), valueOf(comparison.vs)];

  if (metric.compare_as !== "relative" || !subject || !baseline || subject.value < 0 || baseline.value < 0) return null;

  return [
    { candidate: comparison.candidate, value: subject },
    { candidate: comparison.vs, value: baseline },
  ];
}

const valuesHeight = (rows: number) => (rows - 1) * BAR_ROW + BAR_HEIGHT + 2;

/** The two values as bars from zero, each in its candidate's colour, the name before and the value after. */
function valuesFromZero(
  text: SvgTextRenderer,
  metric: Metric,
  rows: { name: string; value: Value; colour: string }[],
  x: number,
  y: number,
  width: number,
  colours: Colours,
): { marks: string; textLines: string[] } {
  const shown = rows.map((row) => withUnit(formatNumber(row.value.value, labelDecimals(metric, row.value)), metric.unit));
  const nameWidth = Math.min(Math.max(...rows.map((row) => text.measure(row.name, STYLE.name))) + 12, width * 0.4);
  const valueWidth = Math.max(...shown.map((label) => text.measure(label, STYLE.scale))) + 8;
  const barRoom = width - nameWidth - valueWidth;
  const largest = Math.max(...rows.map((row) => row.value.value));
  const zero = x + nameWidth;
  const marks: string[] = [];
  const textLines: string[] = [];

  rows.forEach((row, index) => {
    const top = y + index * BAR_ROW;
    const centreY = top + 1 + BAR_HEIGHT / 2;
    const barWidth = largest > 0 ? (row.value.value / largest) * barRoom : 0;
    const name = text.fit(row.name, STYLE.name, nameWidth - 12);

    marks.push(text.draw(name, x, centreY + (STYLE.name.size * CAP_HEIGHT_RATIO) / 2, { ...STYLE.name, fill: colours.ink }));
    marks.push(
      `<rect x="${round(zero)}" y="${top + 1}" width="${round(Math.max(barWidth, 1))}" height="${BAR_HEIGHT}" rx="2" fill="${row.colour}"/>`,
    );
    marks.push(
      text.draw(shown[index], zero + barWidth + 8, centreY + (STYLE.scale.size * CAP_HEIGHT_RATIO) / 2, {
        ...STYLE.scale,
        fill: colours.secondary,
      }),
    );
    textLines.push(`${name}  ${shown[index]}`);
  });
  marks.push(`<path d="M${round(zero)} ${y - 2}V${y + valuesHeight(rows.length) + 2}" stroke="${colours.ruleStrong}" stroke-width="1"/>`);

  return { marks: marks.join(""), textLines };
}

function warningIcon(x: number, top: number, colour: string): string {
  const size = WARNING_ICON_SIZE;

  return [
    `<path d="M${x + size / 2} ${top + 0.8}L${x + size - 0.4} ${top + size - 0.8}H${x + 0.4}Z" fill="none" stroke="${colour}" stroke-width="1.4" stroke-linejoin="round"/>`,
    `<path d="M${x + size / 2} ${top + 4.4}V${top + 7.6}" stroke="${colour}" stroke-width="1.4" stroke-linecap="round"/>`,
    `<circle cx="${x + size / 2}" cy="${top + 9.3}" r="0.8" fill="${colour}"/>`,
  ].join("");
}

/** The mark before a label, as on the site: a short rule ending in a dot. */
export function tickMark(x: number, centreY: number, colours: Colours): string {
  return [
    `<path d="M${x} ${round(centreY)}H${x + 18}" stroke="${colours.quiet}" stroke-width="1"/>`,
    `<rect x="${x + 16}" y="${round(centreY - 2.5)}" width="5" height="5" rx="2.5" fill="${colours.secondary}"/>`,
  ].join("");
}

/** Share of the strip's range left empty on each side, so the caps and the dot never touch its ends. */
const STRIP_PADDING = 0.08;

/**
 * The strip is drawn in the effect's own sign, lower values on the left, as on
 * the charts: the arrow above it says which side is better. The axis is linear
 * and never cut: it always holds zero, the whole band and the whole interval,
 * so a large effect looks large.
 */
function stripScale(interval: [number, number], minimum: number, x: number, width: number): (effect: number) => number {
  const lowest = Math.min(-minimum, interval[0]);
  const highest = Math.max(minimum, interval[1]);
  const padding = (highest - lowest) * STRIP_PADDING;
  const domainLow = lowest - padding;
  const domainHigh = highest + padding;

  return (effect) => x + ((effect - domainLow) / (domainHigh - domainLow)) * width;
}

/** The values of the band's edges: −10% and +10% for a time, −3 and +3 points for a score. */
function bandEdgeLabels(metric: Metric): { lower: string; upper: string } {
  const unit = metric.compare_as === "relative" ? "%" : "";

  return {
    lower: `${formatNumber(-metric.minimum_meaningful, null, { signed: true })}${unit}`,
    upper: `${formatNumber(metric.minimum_meaningful, null, { signed: true })}${unit}`,
  };
}

interface StripDrawing {
  marks: string;
  scaleLabels: { text: string; centreX: number }[];
}

/**
 * The effect as a dot, its interval as a capped line, zero as a rule and the
 * smallest difference that matters as a shaded band: the reader sees why the
 * verdict is what it is. A faint stem joins zero to the effect. Each strip has its own scale.
 */
function effectStrip(
  metric: Metric,
  comparison: Comparison,
  x: number,
  y: number,
  width: number,
  colours: Colours,
  markColour: string,
): StripDrawing {
  const minimum = metric.minimum_meaningful;
  const measuredInterval = comparison.source === "declared" ? undefined : comparison.ci;
  const interval: [number, number] = measuredInterval
    ? [Math.min(...measuredInterval), Math.max(...measuredInterval)]
    : [comparison.effect, comparison.effect];
  const positionOf = stripScale(interval, minimum, x, width);
  const middle = y + STRIP_HEIGHT / 2;
  const left = positionOf(-minimum);
  const right = positionOf(minimum);
  const zero = positionOf(0);
  const effectX = positionOf(comparison.effect);
  const marks: string[] = [];

  marks.push(`<rect x="${round(left)}" y="${y}" width="${round(right - left)}" height="${STRIP_HEIGHT}" fill="${colours.band}"/>`);
  marks.push(`<path d="M${x} ${middle}H${round(x + width)}" stroke="${colours.ruleStrong}" stroke-width="1"/>`);
  marks.push(`<path d="M${round(zero)} ${y - 2}V${y + STRIP_HEIGHT + 2}" stroke="${colours.secondary}" stroke-width="1"/>`);
  marks.push(`<path d="M${round(zero)} ${middle}H${round(effectX)}" stroke="${markColour}" stroke-opacity="0.4" stroke-width="1"/>`);

  if (measuredInterval) {
    const start = positionOf(interval[0]);
    const end = positionOf(interval[1]);

    marks.push(
      `<path d="M${round(start)} ${middle}H${round(end)}M${round(start)} ${middle - 6}V${middle + 6}M${round(end)} ${middle - 6}V${middle + 6}" stroke="${markColour}" stroke-width="2.5" stroke-linecap="round"/>`,
    );
  }

  marks.push(`<circle cx="${round(effectX)}" cy="${middle}" r="${HALO_RADIUS}" fill="${markColour}" fill-opacity="${HALO_OPACITY}"/>`);
  marks.push(
    `<circle cx="${round(effectX)}" cy="${middle}" r="5" fill="${markColour}" stroke="${colours.background}" stroke-width="1.5"/>`,
  );

  const edges = bandEdgeLabels(metric);

  return {
    marks: marks.join(""),
    scaleLabels: [
      { text: "0", centreX: zero },
      { text: edges.lower, centreX: left },
      { text: edges.upper, centreX: right },
    ],
  };
}

/** The groups of the top line, in order, each a run of differently coloured pieces, as on the site. */
type EyebrowGroup = { text: string; fill: string }[];

/**
 * The README card, in the site's style: the benchmark and what it compares, the question, then one cell per
 * headline with its figure and verdict, its drawing, its claim and its details, then how to read it and the provenance.
 */
export function renderCard(benchmark: Benchmark, content: CardContent, mode: CardMode, context: BuildContext): RenderedCard {
  const results = benchmark.results;

  if (!results.computed) throw new Error("the results have not been computed: run astrolabe compute first");

  const lookup = lookupOf(results);
  const colours = THEME[mode];
  const series = seriesStylesOf(
    results.candidates.map((candidate) => candidate.id),
    benchmark.style,
    mode,
  );
  const text = new SvgTextRenderer();
  const marks: string[] = [];
  const textLines: string[] = [];
  const innerWidth = WIDTH - 2 * PADDING;
  let cursorY = PADDING;

  const baselineOf = (top: number, style: { size: number }) => top + style.size * CAP_HEIGHT_RATIO;
  const drawLines = (lines: string[], style: TextStyle & { lineHeight: number }, fill: string, x: number, startY: number): number => {
    let y = startY;

    for (const line of lines) {
      textLines.push(line);
      marks.push(text.draw(line, x, baselineOf(y, style), { ...style, fill }));
      y += style.lineHeight;
    }

    return y;
  };
  const centreOfLine = (top: number, style: { size: number }) => baselineOf(top, style) - (style.size * CAP_HEIGHT_RATIO) / 2;

  const sharedPair = sharedPairOf(lookup, content);
  const countsWhoIsBest = content.charts?.some((chart) => chart.count === "best") ?? false;
  const compared = countsWhoIsBest
    ? `${results.candidates.length} candidates`
    : (sharedPair ?? `${results.candidates.length - 1} candidates against ${lookup.candidateName.get(results.baseline)}`);
  const eyebrowGroups: EyebrowGroup[] = [
    [
      { text: results.benchmark.id, fill: colours.ink },
      { text: ` v${results.benchmark.version}`, fill: colours.quiet },
    ],
    [{ text: compared.toUpperCase(), fill: colours.secondary }],
  ];
  const eyebrowStart = PADDING + TICK_MARK_WIDTH;
  const groupWidth = (group: EyebrowGroup) => group.reduce((width, piece) => width + text.measure(piece.text, STYLE.eyebrow), 0);
  const eyebrowLines: EyebrowGroup[][] = [];

  for (const group of eyebrowGroups) {
    const line = eyebrowLines[eyebrowLines.length - 1];
    const lineWidth = line ? line.reduce((width, placed) => width + groupWidth(placed) + EYEBROW_GAP, 0) : 0;

    if (line && eyebrowStart + lineWidth + groupWidth(group) <= WIDTH - PADDING) line.push(group);
    else eyebrowLines.push([group]);
  }

  marks.push(tickMark(PADDING, centreOfLine(cursorY, STYLE.eyebrow), colours));

  for (const line of eyebrowLines) {
    let x = eyebrowStart;

    line.forEach((group, index) => {
      if (index > 0) {
        marks.push(
          `<circle cx="${round(x + EYEBROW_GAP / 2)}" cy="${round(centreOfLine(cursorY, STYLE.eyebrow))}" r="1" fill="${colours.quiet}"/>`,
        );
        x += EYEBROW_GAP;
      }

      for (const piece of group) {
        marks.push(text.draw(piece.text, x, baselineOf(cursorY, STYLE.eyebrow), { ...STYLE.eyebrow, fill: piece.fill }));
        x += text.measure(piece.text, STYLE.eyebrow);
      }
    });
    textLines.push(line.map((group) => group.map((piece) => piece.text).join("")).join(" · "));
    cursorY += STYLE.eyebrow.lineHeight;
  }

  cursorY = drawLines(text.wrap(results.benchmark.goal, STYLE.title, innerWidth), STYLE.title, colours.ink, PADDING, cursorY + 16);
  cursorY += 30;

  const headerRuleY = cursorY;
  const sharedDirection = sharedDirectionOf(lookup, content);
  const shownComparisons = shownComparisonsOf(content);
  const levels = new Set(
    shownComparisons.map((comparison) => effectAndInterval(lookup.metricById.get(comparison.metric)!, comparison).level).filter(Boolean),
  );
  const sharedLevel = levels.size === 1 ? ([...levels][0] as string) : null;

  /** One cell per headline, laid out in rows so labels, figures, verdicts and drawings line up across columns. */
  const drawHeadlineCells = () => {
    const columnCount = Math.max(1, content.headlines.length);
    const cellWidth = WIDTH / columnCount;
    const verdictOf = (comparison: Comparison) =>
      `${verdictLabel(comparison)}${comparison.source === "declared" ? " (declared)" : ""}`.toUpperCase();
    const widestChip = Math.max(...content.headlines.map(({ comparison }) => chipWidthOf(text, verdictOf(comparison))));
    // Many cells give up some of their inner space before a verdict would run past its hairline.
    const cellPadding = Math.max(SMALLEST_CELL_PADDING, Math.min(CELL_PADDING, Math.floor((cellWidth - widestChip) / 2)));
    const columnWidth = cellWidth - 2 * cellPadding;
    const columnX = (index: number) => index * cellWidth + cellPadding;

    // Laid out in rows, each as tall as its tallest column, so labels, figures, verdicts and drawings line up across columns.
    const columns = content.headlines.map(({ comparison, title }) => {
      const metric = lookup.metricById.get(comparison.metric)!;
      const labelParts = [
        measuredOf(lookup, comparison),
        ...(sharedPair ? [] : [lookup.candidateName.get(comparison.candidate)!]),
        ...(sharedDirection ? [] : [directionWords(metric)]),
      ].map((part) => part.toUpperCase());
      const { effectNumber, unit } = effectAndInterval(metric, comparison);
      const verdict = verdictOf(comparison);
      const fromZero = valuesDrawnFromZero(lookup, comparison);
      const resolvedTitle = title ? resolveTemplates(title, lookup) : undefined;
      const details = detailsOf(lookup, comparison, sharedLevel).map((detail) => ({
        ...detail,
        lines: text.wrap(
          detail.text,
          detail.isWarning ? STYLE.warning : STYLE.detail,
          detail.isWarning ? columnWidth - WARNING_ICON_SIZE - 6 : columnWidth,
        ),
      }));

      return {
        comparison,
        metric,
        labelLines: text.wrapParts(labelParts, STYLE.label, columnWidth),
        effectNumber,
        unit: unit.trim(),
        verdict,
        fromZero,
        drawingHeight: fromZero ? valuesHeight(fromZero.length) : STRIP_HEIGHT + STRIP_SCALE_ROW,
        titleLines:
          resolvedTitle && addsInformation(resolvedTitle, lookup, comparison) ? text.wrap(resolvedTitle, STYLE.heading, columnWidth) : [],
        details,
      };
    });
    const rowHeight = (linesOf: (column: (typeof columns)[number]) => string[], lineHeight: number) =>
      Math.max(0, ...columns.map((column) => linesOf(column).length)) * lineHeight;
    const figureWidthOf = (column: (typeof columns)[number], style: TextStyle) =>
      text.measure(column.effectNumber, style) + unitGapOf(column.unit) + text.measure(column.unit, STYLE.effectUnit);
    const effectSizeThatFits =
      EFFECT_SIZES.find((size) => columns.every((column) => figureWidthOf(column, { ...STYLE.effect, size }) <= columnWidth)) ??
      EFFECT_SIZES[EFFECT_SIZES.length - 1];
    // One size for every figure of the card, so none looks larger than the others.
    const effectStyle = { ...STYLE.effect, size: effectSizeThatFits, lineHeight: effectSizeThatFits };
    const chipsBesideFigures = columns.every(
      (column) => figureWidthOf(column, effectStyle) + 16 + chipWidthOf(text, column.verdict) <= columnWidth,
    );
    const columnsTop = headerRuleY + 28;
    const effectTop = columnsTop + rowHeight((column) => column.labelLines, STYLE.label.lineHeight) + 24;
    const chipTop = chipsBesideFigures
      ? effectTop + (effectStyle.size * CAP_HEIGHT_RATIO - CHIP_HEIGHT) / 2
      : effectTop + effectStyle.lineHeight;
    const drawingTop = chipsBesideFigures ? effectTop + effectStyle.lineHeight + 12 : chipTop + CHIP_HEIGHT + 22;
    const titleTop = drawingTop + Math.max(...columns.map((column) => column.drawingHeight)) + 22;
    const titleRowHeight = rowHeight((column) => column.titleLines, STYLE.heading.lineHeight);
    const detailsTop = titleTop + titleRowHeight + (titleRowHeight > 0 ? 10 : 0);
    const columnsBottom = detailsTop + rowHeight((column) => column.details.flatMap((detail) => detail.lines), STYLE.detail.lineHeight);

    columns.forEach((column, index) => {
      const { comparison, metric, labelLines, effectNumber, unit, verdict, fromZero, titleLines, details } = column;
      const x = columnX(index);
      const effectBaseline = baselineOf(effectTop, effectStyle);
      const verdictColour = verdictColourOf(comparison, colours);

      drawLines(labelLines, STYLE.label, colours.secondary, x, columnsTop);
      marks.push(text.draw(effectNumber, x, effectBaseline, { ...effectStyle, fill: verdictColour }));
      marks.push(
        text.draw(unit, x + text.measure(effectNumber, effectStyle) + unitGapOf(unit), effectBaseline, {
          ...STYLE.effectUnit,
          fill: colours.secondary,
        }),
      );
      textLines.push(unit === "%" ? `${effectNumber}%` : `${effectNumber} ${unit}`);
      marks.push(
        verdictChip(
          text,
          verdict,
          chipsBesideFigures ? x + columnWidth - chipWidthOf(text, verdict) : x,
          chipTop,
          chipColourOf(comparison, colours),
          colours,
        ),
      );
      textLines.push(verdict);

      if (fromZero) {
        const drawn = valuesFromZero(
          text,
          metric,
          fromZero.map((entry) => ({
            name: lookup.candidateName.get(entry.candidate)!,
            value: entry.value,
            colour: series.get(entry.candidate)!.colour,
          })),
          x,
          drawingTop,
          columnWidth,
          colours,
        );

        marks.push(drawn.marks);
        textLines.push(...drawn.textLines);
      } else {
        const strip = effectStrip(metric, comparison, x, drawingTop, columnWidth, colours, chipColourOf(comparison, colours));
        const scaleBaseline = drawingTop + STRIP_HEIGHT + 8 + STYLE.scale.size * CAP_HEIGHT_RATIO;
        const occupied: [number, number][] = [];
        const drawnScaleLabels: { text: string; start: number }[] = [];

        marks.push(strip.marks);

        for (const label of strip.scaleLabels) {
          const labelWidth = text.measure(label.text, STYLE.scale);
          const start = Math.min(Math.max(label.centreX - labelWidth / 2, x), x + columnWidth - labelWidth);
          const end = start + labelWidth;

          if (occupied.some(([takenStart, takenEnd]) => start < takenEnd + 6 && end > takenStart - 6)) continue;

          occupied.push([start, end]);
          drawnScaleLabels.push({ text: label.text, start });
          marks.push(text.draw(label.text, start, scaleBaseline, { ...STYLE.scale, fill: colours.secondary }));
        }

        textLines.push(
          drawnScaleLabels
            .sort((first, second) => first.start - second.start)
            .map((label) => label.text)
            .join("  "),
        );
      }

      drawLines(titleLines, STYLE.heading, colours.ink, x, titleTop);

      let detailY = detailsTop;

      for (const detail of details) {
        if (detail.isWarning) {
          marks.push(warningIcon(x, detailY + 3, colours.ink));
          detailY = drawLines(detail.lines, STYLE.warning, colours.ink, x + WARNING_ICON_SIZE + 6, detailY);
        } else {
          detailY = drawLines(detail.lines, STYLE.detail, colours.secondary, x, detailY);
        }
      }
    });

    return { columnCount, cellWidth, columnsBottom, drawsStrips: columns.some((column) => !column.fromZero) };
  };

  /**
   * One cell per summary chart: its label, a legend of the sides, a stacked bar per candidate under its name with the
   * count inside each segment that has room (the others said under the bar), then the range of each candidate's changes.
   */
  const drawSummaryCells = (charts: SummaryChart[]) => {
    const columnCount = charts.length;
    const cellWidth = WIDTH / columnCount;
    const columnWidth = cellWidth - 2 * CELL_PADDING;
    const sideColourOf = (side: BarSide) => (side === "better" ? colours.good : side === "worse" ? colours.bad : colours.secondary);
    const nameOf = (summary: Summary) => lookup.candidateName.get(summary.candidate) ?? summary.candidate;

    /** One segment from x, `width` wide: firm filled, likely faded, unclear outlined, the count centred in its larger part. */
    const drawSegment = (
      bar: VerdictBar,
      left: number,
      width: number,
      top: number,
      height: number,
      likelyFirst: boolean,
      withCount: boolean,
    ) => {
      const colour = sideColourOf(bar.side);
      const inner = Math.max(width - 2, 0);
      const firm = bar.side === "unclear" ? 0 : bar.count - bar.likely;
      const firmWidth = (inner * firm) / bar.count;
      const [firmX, likelyX] = likelyFirst ? [left + 1 + inner - firmWidth, left + 1] : [left + 1, left + 1 + firmWidth];
      const countInFirm = firm >= bar.count - firm;

      if (bar.side === "unclear")
        marks.push(
          `<rect x="${round(left + 1.75)}" y="${round(top + 0.75)}" width="${round(Math.max(inner - 1.5, 0))}" height="${height - 1.5}" fill="none" stroke="${colour}" stroke-width="1.5"/>`,
        );
      else {
        if (firmWidth > 0)
          marks.push(`<rect x="${round(firmX)}" y="${round(top)}" width="${round(firmWidth)}" height="${height}" fill="${colour}"/>`);

        if (inner - firmWidth > 0)
          marks.push(
            `<rect x="${round(likelyX)}" y="${round(top)}" width="${round(inner - firmWidth)}" height="${height}" fill="${colour}" fill-opacity="${LIKELY_OPACITY}"/>`,
          );
      }

      if (!withCount) return;

      const [holderX, holderWidth] =
        bar.side === "unclear" ? [left + 1, inner] : countInFirm ? [firmX, firmWidth] : [likelyX, inner - firmWidth];
      const countWidth = text.measure(String(bar.count), STYLE.counts);

      marks.push(
        text.draw(
          String(bar.count),
          holderX + (holderWidth - countWidth) / 2,
          top + height / 2 + (STYLE.counts.size * CAP_HEIGHT_RATIO) / 2,
          {
            ...STYLE.counts,
            fill: countInFirm && bar.side !== "unclear" ? colours.background : colours.ink,
          },
        ),
      );
    };

    const cells = charts.map((chart) => {
      const metric = lookup.metricById.get(chart.metric)!;
      const legend = legendOf(metric, chart).map((item) => ({ ...item, words: capitalised(item.words) }));
      const legendLines: (typeof legend)[] = [[]];
      let lineWidth = 0;

      for (const item of legend) {
        const width = LEGEND_SWATCH + 6 + text.measure(item.words, STYLE.detail);

        if (lineWidth > 0 && lineWidth + LEGEND_GAP + width > columnWidth) {
          legendLines.push([]);
          lineWidth = 0;
        }

        legendLines[legendLines.length - 1].push(item);
        lineWidth += (lineWidth > 0 ? LEGEND_GAP : 0) + width;
      }

      return {
        chart,
        metric,
        labelLines: text.wrapParts(
          [metric.label, ...(sharedDirection || chart.count === "best" ? [] : [directionWords(metric)])].map((part) => part.toUpperCase()),
          STYLE.label,
          columnWidth,
        ),
        legendLines: legendLines.filter((line) => line.length > 0),
        details:
          chart.count === "best"
            ? []
            : chart.summaries.flatMap((summary) =>
                text.wrap(
                  chart.summaries.length > 1
                    ? `${nameOf(summary)}: ${lowerFirstLetterOfWord(effectRangeOf(lookup, summary))}`
                    : effectRangeOf(lookup, summary),
                  STYLE.detail,
                  columnWidth,
                ),
              ),
      };
    });

    type Cell = (typeof cells)[number];

    /** Stacked or diverging bars, the name above each; a count with no room in its segment said under the bar. Returns the height drawn. */
    const drawPlacedBars = (cell: Cell, x: number, top: number, draw: boolean) => {
      const layout = barLayoutOf(cell.metric, cell.chart);
      const scale = columnWidth / layout.span;
      const fits = (bar: VerdictBar) =>
        Math.max(bar.count - bar.likely, bar.likely) * scale >= text.measure(String(bar.count), STYLE.counts) + 8;
      let rowTop = top;
      const barTops: number[] = [];
      const firstMark = marks.length;

      for (const { summary, segments } of layout.bars) {
        const barTop = rowTop + STYLE.name.lineHeight + 6;
        const under = segments.filter(({ bar }) => !fits(bar)).map(({ bar }) => `${bar.count} ${bar.words}`);

        barTops.push(barTop);

        if (draw) {
          marks.push(text.draw(nameOf(summary), x, baselineOf(rowTop + 2, STYLE.name), { ...STYLE.name, fill: colours.ink }));

          for (const { bar, start, likelyFirst } of segments)
            drawSegment(bar, x + start * scale, bar.count * scale, barTop, STACK_HEIGHT, likelyFirst, fits(bar));

          if (under.length > 0) drawLines([under.join(" · ")], STYLE.detail, colours.secondary, x, barTop + STACK_HEIGHT + 4);

          textLines.push(
            `${nameOf(summary)}  ${barsOf(cell.metric, summary)
              .map((bar) => `${bar.count} ${bar.words}${likelyPartOf(bar)}`)
              .join("  ")}`,
          );
        }

        rowTop = barTop + STACK_HEIGHT + (under.length > 0 ? STYLE.detail.lineHeight + 2 : 0) + STACK_GAP;
      }

      if (draw && layout.zero !== undefined && barTops.length > 0) {
        const lineX = round(x + layout.zero * scale);

        // Under the bars, so that a part centred on it is not cut in two.
        marks.splice(
          firstMark,
          0,
          `<line x1="${lineX}" y1="${round(barTops[0] - 6)}" x2="${lineX}" y2="${round(barTops[barTops.length - 1] + STACK_HEIGHT + 6)}" stroke="${colours.secondary}" stroke-width="1"/>`,
        );
      }

      return rowTop - top;
    };

    /** One group per result under its heading, a bar per candidate from zero with its count after it. Returns the height drawn. */
    const drawCountGroups = (cell: Cell, x: number, top: number, draw: boolean) => {
      const groups = countGroupsOf(cell.metric, cell.chart);
      const nameWidth = Math.max(...cell.chart.summaries.map((summary) => text.measure(nameOf(summary), STYLE.name))) + 12;
      const countRoom = Math.max(
        ...groups.flatMap((group) => group.bars.map(({ bar }) => text.measure(`${bar.count}${likelyPartOf(bar)}`, STYLE.counts))),
      );
      const barRoom = Math.max(columnWidth - nameWidth - countRoom - 8, 0);
      const largest = Math.max(1, ...groups.flatMap((group) => group.bars.map(({ bar }) => bar.count)));
      const barHeight = 18;
      let rowTop = top;

      for (const group of groups) {
        if (draw) {
          const swatchTop = rowTop + (STYLE.detail.lineHeight - LEGEND_SWATCH) / 2;

          marks.push(
            group.side === "unclear"
              ? `<rect x="${round(x + 0.75)}" y="${round(swatchTop + 0.75)}" width="${LEGEND_SWATCH - 1.5}" height="${LEGEND_SWATCH - 1.5}" rx="2" fill="none" stroke="${colours.secondary}" stroke-width="1.5"/>`
              : `<rect x="${round(x)}" y="${round(swatchTop)}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" rx="2" fill="${sideColourOf(group.side)}"/>`,
          );
          marks.push(
            text.draw(capitalised(group.words), x + LEGEND_SWATCH + 6, baselineOf(rowTop + 3, STYLE.detail), {
              ...STYLE.detail,
              fill: colours.secondary,
            }),
          );
          textLines.push(capitalised(group.words));
        }

        rowTop += STYLE.detail.lineHeight + 6;

        for (const { summary, bar } of group.bars) {
          const width = (barRoom * bar.count) / largest;
          const count = `${bar.count}${likelyPartOf(bar)}`;

          if (draw) {
            marks.push(
              text.draw(nameOf(summary), x, rowTop + barHeight / 2 + (STYLE.name.size * CAP_HEIGHT_RATIO) / 2, {
                ...STYLE.name,
                fill: colours.ink,
              }),
            );

            if (bar.count > 0) drawSegment(bar, x + nameWidth - 1, width + 2, rowTop, barHeight, false, false);

            marks.push(
              text.draw(count, x + nameWidth + width + 8, rowTop + barHeight / 2 + (STYLE.counts.size * CAP_HEIGHT_RATIO) / 2, {
                ...STYLE.counts,
                fill: colours.ink,
              }),
            );
            textLines.push(`${nameOf(summary)}  ${count}`);
          }

          rowTop += barHeight + 8;
        }

        rowTop += 6;
      }

      return rowTop - top;
    };

    const drawBars = (cell: Cell, x: number, top: number, draw: boolean) =>
      cell.chart.drawing === "grouped-bar" ? drawCountGroups(cell, x, top, draw) : drawPlacedBars(cell, x, top, draw);
    const columnsTop = headerRuleY + 28;
    const legendTop = columnsTop + Math.max(...cells.map((cell) => cell.labelLines.length)) * STYLE.label.lineHeight + 16;
    const legendHeight = Math.max(...cells.map((cell) => cell.legendLines.length)) * STYLE.detail.lineHeight;
    const rowsTop = legendTop + legendHeight + (legendHeight > 0 ? 18 : 0);
    const detailsTop = rowsTop + Math.max(...cells.map((cell) => drawBars(cell, 0, rowsTop, false))) + 2;

    cells.forEach((cell, index) => {
      const x = index * cellWidth + CELL_PADDING;

      drawLines(cell.labelLines, STYLE.label, colours.secondary, x, columnsTop);

      cell.legendLines.forEach((line, lineIndex) => {
        let itemX = x;
        const top = legendTop + lineIndex * STYLE.detail.lineHeight;
        const swatchTop = top + (STYLE.detail.lineHeight - LEGEND_SWATCH) / 2;

        for (const item of line) {
          if (item.side === "likely") {
            const half = LEGEND_SWATCH / 2;

            marks.push(
              `<rect x="${round(itemX)}" y="${round(swatchTop)}" width="${half}" height="${LEGEND_SWATCH}" fill="${colours.good}" fill-opacity="${LIKELY_OPACITY}"/>`,
            );
            marks.push(
              `<rect x="${round(itemX + half)}" y="${round(swatchTop)}" width="${half}" height="${LEGEND_SWATCH}" fill="${colours.bad}" fill-opacity="${LIKELY_OPACITY}"/>`,
            );
          } else if (item.side === "unclear")
            marks.push(
              `<rect x="${round(itemX + 0.75)}" y="${round(swatchTop + 0.75)}" width="${LEGEND_SWATCH - 1.5}" height="${LEGEND_SWATCH - 1.5}" rx="2" fill="none" stroke="${colours.secondary}" stroke-width="1.5"/>`,
            );
          else
            marks.push(
              `<rect x="${round(itemX)}" y="${round(swatchTop)}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" rx="2" fill="${sideColourOf(item.side)}"/>`,
            );

          marks.push(
            text.draw(item.words, itemX + LEGEND_SWATCH + 6, baselineOf(top + 3, STYLE.detail), {
              ...STYLE.detail,
              fill: colours.secondary,
            }),
          );
          itemX += LEGEND_SWATCH + 6 + text.measure(item.words, STYLE.detail) + LEGEND_GAP;
        }

        textLines.push(line.map((item) => item.words).join("  "));
      });

      drawBars(cell, x, rowsTop, true);
      drawLines(cell.details, STYLE.detail, colours.secondary, x, detailsTop);
    });

    const columnsBottom = detailsTop + Math.max(...cells.map((cell) => cell.details.length)) * STYLE.detail.lineHeight;

    return { columnCount, cellWidth, columnsBottom, drawsStrips: false };
  };

  const { columnCount, cellWidth, columnsBottom, drawsStrips } =
    content.charts && content.charts.length > 0 ? drawSummaryCells(content.charts) : drawHeadlineCells();

  const footerRuleY = columnsBottom + 32;

  marks.push(`<path d="M1 ${headerRuleY}H${WIDTH - 1}" stroke="${colours.rule}" stroke-width="1"/>`);
  marks.push(`<path d="M1 ${footerRuleY}H${WIDTH - 1}" stroke="${colours.rule}" stroke-width="1"/>`);

  for (let column = 1; column < columnCount; column++)
    marks.push(`<path d="M${round(column * cellWidth)} ${headerRuleY}V${footerRuleY}" stroke="${colours.rule}" stroke-width="1"/>`);

  cursorY = footerRuleY + 22;

  // The footer keeps what a card read alone needs: what a mark is, the interval's level, the direction when it is
  // not already in the counts; the adjustment and the rest of the method are on the page.
  const isSingle = shownComparisons.length === 1;
  const intervals = `${sharedLevel ? `${sharedLevel} ` : ""}${isSingle ? "interval" : "intervals"}`;
  const readingOfCells =
    content.charts && content.charts.length > 0
      ? [...summaryKeysOf(lookup, content.charts), `Verdicts from ${intervals}.`]
      : [`${isSingle ? "Effect" : "Effects"} against ${lookup.candidateName.get(results.baseline)}, with ${intervals}.`];
  const legendSentences = [
    ...readingOfCells,
    ...(sharedDirection && !countsWhoIsBest ? [sharedDirection === "lower" ? "Lower is better." : "Higher is better."] : []),
    ...(drawsStrips ? ["Shaded band: too small to matter."] : []),
    ...(content.omitted.length > 0
      ? [
          `${content.omitted.length} more result${content.omitted.length === 1 ? "" : "s"} in the full report: ${countsByVerdict(content.omitted)}.`,
        ]
      : []),
  ];
  const legend = legendSentences.join(" ");
  const legendLines = text.wrap(legend, STYLE.detail, innerWidth).length === 1 ? [legend] : legendSentences;

  for (const sentence of legendLines)
    cursorY = drawLines(
      text.wrapParts(sentence.split(/(?<=,) /), STYLE.detail, innerWidth, " "),
      STYLE.detail,
      colours.secondary,
      PADDING,
      cursorY,
    );

  const machine = machineOf(benchmark, content);
  const machineText = machine ? `Measured on ${machine.join(" · ")}` : "";

  if (machine)
    cursorY = drawLines(text.wrapParts([machineText], STYLE.detail, innerWidth), STYLE.detail, colours.secondary, PADDING, cursorY);

  cursorY += 6;

  const provenance = provenanceParts(benchmark, context);
  const provenanceItems = [
    provenance.source.replace(/^https?:\/\//, ""),
    `results ${provenance.hash}`,
    provenance.date,
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
    ...(provenance.attribution ? ["Built with Astrolabe"] : []),
  ];
  const provenanceText = provenanceItems.join(" · ");

  cursorY = drawLines(text.wrapParts(provenanceItems, STYLE.detail, innerWidth), STYLE.detail, colours.quiet, PADDING, cursorY);

  const height = Math.ceil(cursorY + 24);
  const altText = cardAltText(benchmark, content);
  const longDescription = [altText, legend, machine ? `${machineText}.` : "", provenanceText].filter(Boolean).join(" ");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title description"`,
    ` data-results-sha256="${provenance.hash}" data-build-date="${provenance.date}" data-generator="astrolabe-bench ${context.generatorVersion}">`,
    `<title id="title">${escapeXml(altText)}</title>`,
    `<desc id="description">${escapeXml(longDescription)}</desc>`,
    text.definitions(),
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" fill="${colours.background}" stroke="${colours.ruleStrong}"/>`,
    ...marks,
    "</svg>\n",
  ].join("");

  return { svg, altText, textLines, charactersWithoutGlyph: text.charactersWithoutGlyph() };
}

/** The keys of the summaries on a card, once each: one uncounted key when they differ only by how many parts they count. */
function summaryKeysOf(lookup: Lookup, charts: SummaryChart[]): string[] {
  const counted = [...new Set(charts.map((chart) => summaryKeyOf(lookup, chart)))];
  const uncounted = [...new Set(charts.map((chart) => summaryKeyOf(lookup, chart, { counted: false })))];

  return counted.length > 1 && uncounted.length === 1 ? uncounted : counted;
}
