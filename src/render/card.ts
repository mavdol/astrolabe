import type { Benchmark, Comparison, Metric } from "../schema/benchmark.js";
import {
  effectAndInterval,
  lookupOf,
  lowerFirstLetterOfWord,
  provenanceParts,
  resolveTemplates,
  STATISTIC_WORD,
  verdictLabel,
  type BuildContext,
  type Lookup,
} from "./describe.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer, type TextStyle } from "./svg-text.js";

export type CardMode = "light" | "dark";

/** Black on white and white on black, hierarchy by weight and size; every grey that carries text keeps at least 7:1 contrast. */
const THEME: Record<CardMode, { background: string; ink: string; secondary: string; rule: string; band: string; inkOnFill: string }> = {
  light: { background: "#ffffff", ink: "#0a0a0a", secondary: "#5c5c5c", rule: "#e5e5e5", band: "#f2f2f2", inkOnFill: "#ffffff" },
  dark: { background: "#0a0a0a", ink: "#fafafa", secondary: "#a3a3a3", rule: "#2a2a2a", band: "#1c1c1c", inkOnFill: "#0a0a0a" },
};

const WIDTH = 800;
const PADDING = 40;
/** Space on each side of the thin rule between two headline columns. */
const COLUMN_GUTTER = 24;
const CORNER_RADIUS = 12;
const STRIP_HEIGHT = 24;
const BADGE_HEIGHT = 22;
const BADGE_PADDING = 10;

export const MAX_HEADLINES = 3;

/** Every size is at least 12 px at the card's own width, the smallest text readable once shown in a README. */
const STYLE = {
  eyebrow: { weight: 500, size: 14, lineHeight: 18 },
  title: { weight: 600, size: 22, lineHeight: 28, tracking: -0.01 },
  label: { weight: 600, size: 13, lineHeight: 18 },
  effect: { weight: 700, size: 44, lineHeight: 48, tabular: true, tracking: -0.03 },
  effectUnit: { weight: 500, size: 16 },
  heading: { weight: 500, size: 14, lineHeight: 20 },
  badge: { weight: 600, size: 12, tracking: 0.04 },
  detail: { weight: 400, size: 12, lineHeight: 17 },
} as const;

export interface CardHeadline {
  comparison: Comparison;
  /** The block title, with its templates; absent for the default card. */
  title?: string;
}

export interface CardContent {
  headlines: CardHeadline[];
  /** Primary comparisons left out of a default card, which shows at most three. */
  omittedCount: number;
}

interface HeadlineBlock {
  id: string;
  type: string;
  comparison?: string;
  title?: string;
}

/**
 * The headlines of a card: the headline blocks an export names, or by default
 * the first primary comparisons. Other kinds of blocks cannot be drawn on a card yet.
 */
export function cardContentOf(benchmark: Benchmark, blockIds?: string[]): CardContent {
  const comparisonById = new Map((benchmark.results.comparisons ?? []).map((comparison) => [comparison.id, comparison]));

  if (blockIds) {
    const blocks = (benchmark.blocks ?? []) as HeadlineBlock[];
    const headlines = blockIds.map((blockId) => {
      const block = blocks.find((candidate) => candidate.id === blockId);

      if (!block) throw new Error(`the export names block "${blockId}", which does not exist`);

      if (block.type !== "headline") throw new Error(`block "${blockId}" is a ${block.type}: a card can only show headline blocks for now`);

      const comparison = comparisonById.get(block.comparison ?? "");

      if (!comparison) throw new Error(`block "${blockId}" names no existing comparison`);

      return { comparison, title: block.title };
    });

    return { headlines, omittedCount: 0 };
  }

  const primary = (benchmark.results.comparisons ?? []).filter((comparison) => comparison.role === "primary");

  return {
    headlines: primary.slice(0, MAX_HEADLINES).map((comparison) => ({ comparison })),
    omittedCount: Math.max(0, primary.length - MAX_HEADLINES),
  };
}

function pairOf(lookup: Lookup, comparison: Comparison): string {
  return `${lookup.candidateName.get(comparison.candidate)} against ${lookup.candidateName.get(comparison.vs)}`;
}

function measuredOf(lookup: Lookup, comparison: Comparison): string {
  const metric = lookup.metricById.get(comparison.metric)!;
  const where = comparison.node ? `, ${lookup.nodeLabel.get(comparison.node)}` : "";

  return `${metric.label}${where}`;
}

function subjectOf(lookup: Lookup, comparison: Comparison): string {
  return `${pairOf(lookup, comparison)}: ${lowerFirstLetterOfWord(measuredOf(lookup, comparison))}`;
}

/** When every headline compares the same two candidates, they are named once under the title. */
function sharedPairOf(lookup: Lookup, content: CardContent): string | null {
  const pairs = new Set(content.headlines.map(({ comparison }) => pairOf(lookup, comparison)));

  return pairs.size === 1 ? [...pairs][0] : null;
}

/**
 * A headline on a group never stands alone: it names the best and the worst
 * of the groups just below it, so a gain on one task cannot pass for the whole.
 */
function rangeOfChildren(lookup: Lookup, comparison: Comparison): string | null {
  if (comparison.node === undefined) return null;

  const children = new Set(lookup.tree.childrenOf.get(comparison.node) ?? []);
  const childComparisons = (lookup.results.comparisons ?? []).filter(
    (candidate) =>
      candidate.metric === comparison.metric &&
      candidate.candidate === comparison.candidate &&
      candidate.node !== undefined &&
      children.has(candidate.node),
  );

  if (childComparisons.length < 2) return null;

  const sorted = [...childComparisons].sort((first, second) => first.effect - second.effect);
  const metric = lookup.metricById.get(comparison.metric)!;
  const describe = (child: Comparison) => `${effectAndInterval(metric, child).effect} (${lookup.nodeLabel.get(child.node!)})`;

  const lowest = effectAndInterval(metric, sorted[0]).effect;
  const highest = effectAndInterval(metric, sorted[sorted.length - 1]).effect;

  if (lowest === highest) return `${lowest} in each group below`;

  return `From ${describe(sorted[0])} to ${describe(sorted[sorted.length - 1])}`;
}

/** The level is written once in the legend when every headline shares it, as primary comparisons do. */
function detailsOf(lookup: Lookup, comparison: Comparison, sharedLevel: string | null): string[] {
  const metric = lookup.metricById.get(comparison.metric)!;
  const { interval, level } = effectAndInterval(metric, comparison);
  const details: string[] = [];

  if (comparison.source === "declared") details.push("Declared values, no interval");
  else if (interval) details.push(level === sharedLevel ? `Interval ${interval}` : `${level} interval: ${interval}`);
  else details.push("No interval: too few observations");

  const range = rangeOfChildren(lookup, comparison);

  if (range) details.push(range);

  if (comparison.successful_only) details.push("Successful attempts only");

  if (comparison.failure_warning) details.push("Warning: the candidates did not fail equally often");

  return details;
}

function howToReadMetric(lookup: Lookup, metric: Metric, comparison: Comparison): string {
  const observationsOf = (candidate: string) =>
    (lookup.results.values ?? []).find(
      (value) => value.metric === metric.id && value.candidate === candidate && value.node === comparison.node,
    )?.n;
  const baselineCount = observationsOf(comparison.vs);
  const candidateCount = observationsOf(comparison.candidate);
  const direction = metric.direction === "lower" ? "lower is better" : "higher is better";
  const observations =
    baselineCount === undefined || candidateCount === undefined
      ? ""
      : baselineCount === candidateCount
        ? `, n = ${baselineCount} per candidate`
        : `, n = ${baselineCount} (${lookup.candidateName.get(comparison.vs)}) and ${candidateCount} (${lookup.candidateName.get(comparison.candidate)})`;
  const smallestDifference = `${metric.minimum_meaningful}${metric.compare_as === "relative" ? "%" : metric.unit === "%" ? " points" : ` ${metric.unit}`}`;

  return `${metric.label}: ${STATISTIC_WORD[metric.statistic].toLowerCase()} in ${metric.unit}, ${direction}${observations}; smallest difference that matters: ${smallestDifference}.`;
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The text alternative: every headline in words, for screen readers and for the alt of the README image. */
export function cardAltText(benchmark: Benchmark, content: CardContent): string {
  const lookup = lookupOf(benchmark.results);
  const sharedPair = sharedPairOf(lookup, content);
  const sentences = content.headlines.map(({ comparison }) => {
    const metric = lookup.metricById.get(comparison.metric)!;
    const measured = lowerFirstLetterOfWord(measuredOf(lookup, comparison));
    const subject = sharedPair ? measured : `${pairOf(lookup, comparison)}, ${measured}`;

    return `${subject} ${effectAndInterval(metric, comparison).effect}, ${verdictLabel(comparison)}`;
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
function isFirmVerdict(comparison: Comparison): boolean {
  return comparison.qualifier === undefined && comparison.verdict !== "inconclusive";
}

/**
 * The effect as a dot, its interval as a line, zero as a rule and the smallest
 * difference that matters as a shaded band: the reader sees why the verdict is
 * what it is. Each strip has its own scale, centred on zero.
 */
function effectStrip(
  metric: Metric,
  comparison: Comparison,
  x: number,
  y: number,
  width: number,
  colours: (typeof THEME)[CardMode],
): string {
  const minimum = metric.minimum_meaningful;
  const interval = comparison.source === "declared" ? undefined : comparison.ci;
  const extent = Math.max(minimum, Math.abs(comparison.effect), ...(interval ? interval.map(Math.abs) : [])) * 1.15;
  const positionOf = (effect: number) => x + ((effect + extent) / (2 * extent)) * width;
  const middle = y + STRIP_HEIGHT / 2;
  const marks = [
    `<rect x="${round(positionOf(-minimum))}" y="${y}" width="${round(positionOf(minimum) - positionOf(-minimum))}" height="${STRIP_HEIGHT}" fill="${colours.band}"/>`,
    `<path d="M${round(positionOf(-minimum))} ${y}V${y + STRIP_HEIGHT}M${round(positionOf(minimum))} ${y}V${y + STRIP_HEIGHT}" stroke="${colours.secondary}" stroke-width="1" stroke-dasharray="2 2"/>`,
    `<path d="M${round(positionOf(0))} ${y - 2}V${y + STRIP_HEIGHT + 2}" stroke="${colours.secondary}" stroke-width="1"/>`,
  ];

  if (interval) {
    marks.push(
      `<path d="M${round(positionOf(interval[0]))} ${middle}H${round(positionOf(interval[1]))}" stroke="${colours.ink}" stroke-width="3" stroke-linecap="round"/>`,
    );
  }

  marks.push(
    `<circle cx="${round(positionOf(comparison.effect))}" cy="${middle}" r="4.5" fill="${colours.ink}" stroke="${colours.background}" stroke-width="1.5"/>`,
  );

  return marks.join("");
}

const round = (value: number) => String(Math.round(value * 10) / 10);

/** The README card: headlines with their verdicts and intervals, how to read them, and the provenance line. */
export function renderCard(benchmark: Benchmark, content: CardContent, mode: CardMode, context: BuildContext): RenderedCard {
  const results = benchmark.results;

  if (!results.computed) throw new Error("the results have not been computed: run astrolabe compute first");

  const lookup = lookupOf(results);
  const colours = THEME[mode];
  const text = new SvgTextRenderer();
  const marks: string[] = [];
  const textLines: string[] = [];
  const innerWidth = WIDTH - 2 * PADDING;
  let cursorY = PADDING;

  const drawLines = (lines: string[], style: TextStyle & { lineHeight: number }, fill: string, x: number, startY: number): number => {
    let y = startY;

    for (const line of lines) {
      textLines.push(line);
      marks.push(text.draw(line, x, y + style.size * CAP_HEIGHT_RATIO, { ...style, fill }));
      y += style.lineHeight;
    }

    return y;
  };

  const sharedPair = sharedPairOf(lookup, content);
  const eyebrow = sharedPair ?? `${results.candidates.length - 1} candidates against ${lookup.candidateName.get(results.baseline)}`;

  cursorY = drawLines([eyebrow], STYLE.eyebrow, colours.secondary, PADDING, cursorY);
  cursorY = drawLines(text.wrap(results.benchmark.goal, STYLE.title, innerWidth), STYLE.title, colours.ink, PADDING, cursorY + 8);
  cursorY += 28;

  const columnCount = Math.max(1, content.headlines.length);
  const columnWidth = (innerWidth - 2 * COLUMN_GUTTER * (columnCount - 1)) / columnCount;
  const columnX = (index: number) => PADDING + index * (columnWidth + 2 * COLUMN_GUTTER);
  const levels = new Set(
    content.headlines
      .map(({ comparison }) => effectAndInterval(lookup.metricById.get(comparison.metric)!, comparison).level)
      .filter(Boolean),
  );
  const sharedLevel = levels.size === 1 ? ([...levels][0] as string) : null;

  // Laid out in rows, each as tall as its tallest column, so labels, figures, verdicts and strips line up across columns.
  const columns = content.headlines.map(({ comparison, title }) => ({
    comparison,
    metric: lookup.metricById.get(comparison.metric)!,
    labelLines: text.wrap(
      measuredOf(lookup, comparison) + (sharedPair ? "" : ` · ${lookup.candidateName.get(comparison.candidate)}`),
      STYLE.label,
      columnWidth,
    ),
    titleLines: title ? text.wrap(resolveTemplates(title, lookup), STYLE.heading, columnWidth) : [],
    detailLines: detailsOf(lookup, comparison, sharedLevel).flatMap((detail) => text.wrap(detail, STYLE.detail, columnWidth)),
  }));
  const rowHeight = (linesOf: (column: (typeof columns)[number]) => string[], lineHeight: number) =>
    Math.max(0, ...columns.map((column) => linesOf(column).length)) * lineHeight;
  const columnsTop = cursorY;
  const effectTop = columnsTop + rowHeight((column) => column.labelLines, STYLE.label.lineHeight) + 8;
  const titleTop = effectTop + STYLE.effect.lineHeight + 4;
  const titleRowHeight = rowHeight((column) => column.titleLines, STYLE.heading.lineHeight);
  const badgeTop = titleTop + titleRowHeight + (titleRowHeight > 0 ? 12 : 8);
  const stripTop = badgeTop + BADGE_HEIGHT + 18;
  const detailsTop = stripTop + STRIP_HEIGHT + 10;
  const columnsBottom = detailsTop + rowHeight((column) => column.detailLines, STYLE.detail.lineHeight);

  columns.forEach(({ comparison, metric, labelLines, titleLines, detailLines }, index) => {
    const x = columnX(index);
    const { effectNumber, unit } = effectAndInterval(metric, comparison);
    const effectBaseline = effectTop + STYLE.effect.size * CAP_HEIGHT_RATIO;
    const numberWithPercent = unit === "%" ? `${effectNumber}%` : effectNumber;

    drawLines(labelLines, STYLE.label, colours.secondary, x, columnsTop);
    marks.push(text.draw(numberWithPercent, x, effectBaseline, { ...STYLE.effect, fill: colours.ink }));
    textLines.push(unit === "%" ? numberWithPercent : `${numberWithPercent} ${unit.trim()}`);

    if (unit !== "%") {
      const unitX = x + text.measure(numberWithPercent, STYLE.effect) + 6;

      marks.push(text.draw(unit.trim(), unitX, effectBaseline, { ...STYLE.effectUnit, fill: colours.secondary }));
    }

    drawLines(titleLines, STYLE.heading, colours.ink, x, titleTop);

    const verdict = `${verdictLabel(comparison)}${comparison.source === "declared" ? " (declared)" : ""}`.toUpperCase();
    const badgeWidth = text.measure(verdict, STYLE.badge) + 2 * BADGE_PADDING;
    const firm = isFirmVerdict(comparison);

    marks.push(
      firm
        ? `<rect x="${x}" y="${badgeTop}" width="${round(badgeWidth)}" height="${BADGE_HEIGHT}" rx="${BADGE_HEIGHT / 2}" fill="${colours.ink}"/>`
        : `<rect x="${x + 0.5}" y="${badgeTop + 0.5}" width="${round(badgeWidth - 1)}" height="${BADGE_HEIGHT - 1}" rx="${(BADGE_HEIGHT - 1) / 2}" fill="none" stroke="${colours.secondary}"/>`,
    );
    marks.push(
      text.draw(verdict, x + BADGE_PADDING, badgeTop + BADGE_HEIGHT / 2 + (STYLE.badge.size * CAP_HEIGHT_RATIO) / 2, {
        ...STYLE.badge,
        fill: firm ? colours.inkOnFill : colours.ink,
      }),
    );
    textLines.push(verdict);
    marks.push(effectStrip(metric, comparison, x, stripTop, columnWidth, colours));
    drawLines(detailLines, STYLE.detail, colours.secondary, x, detailsTop);
  });

  for (let column = 1; column < columnCount; column++) {
    const ruleX = columnX(column) - COLUMN_GUTTER;

    marks.push(`<path d="M${round(ruleX)} ${columnsTop}V${round(columnsBottom)}" stroke="${colours.rule}" stroke-width="1"/>`);
  }

  const tallestColumnBottom = columnsBottom;

  cursorY = tallestColumnBottom + 28;
  marks.push(`<path d="M${PADDING} ${cursorY}H${WIDTH - PADDING}" stroke="${colours.rule}" stroke-width="1"/>`);
  cursorY += 16;

  const firstHeadlineOfEachMetric = new Map<string, Comparison>();

  for (const { comparison } of content.headlines)
    if (!firstHeadlineOfEachMetric.has(comparison.metric)) firstHeadlineOfEachMetric.set(comparison.metric, comparison);

  const baselineName = lookup.candidateName.get(results.baseline);
  const readingNotes = [
    `Dot: effect against ${baselineName}. Line: ${sharedLevel ? `${sharedLevel} interval` : "interval"}. Shaded band: the smallest difference that matters.`,
    ...[...firstHeadlineOfEachMetric.values()].map((comparison) =>
      howToReadMetric(lookup, lookup.metricById.get(comparison.metric)!, comparison),
    ),
  ];

  if (content.omittedCount > 0) {
    readingNotes.push(`${content.omittedCount} more primary comparison${content.omittedCount === 1 ? "" : "s"} in the full results.`);
  }

  for (const note of readingNotes)
    cursorY = drawLines(text.wrap(note, STYLE.detail, innerWidth), STYLE.detail, colours.secondary, PADDING, cursorY);

  cursorY += 8;

  const provenance = provenanceParts(benchmark, context);
  const provenanceText = [
    `results sha256 ${provenance.hash}`,
    provenance.date,
    provenance.source.replace(/^https?:\/\//, ""),
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
    provenance.generator,
  ].join(" · ");

  cursorY = drawLines(text.wrap(provenanceText, STYLE.detail, innerWidth), STYLE.detail, colours.secondary, PADDING, cursorY);

  const height = Math.ceil(cursorY + PADDING - 12);
  const altText = cardAltText(benchmark, content);
  const longDescription = [altText, ...readingNotes, provenanceText].join(" ");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title description"`,
    ` data-results-sha256="${provenance.hash}" data-build-date="${provenance.date}" data-generator="astrolabe-bench ${context.generatorVersion}">`,
    `<title id="title">${escapeXml(altText)}</title>`,
    `<desc id="description">${escapeXml(longDescription)}</desc>`,
    text.definitions(),
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="${CORNER_RADIUS}" fill="${colours.background}" stroke="${colours.rule}"/>`,
    ...marks,
    "</svg>\n",
  ].join("");

  return { svg, altText, textLines, charactersWithoutGlyph: text.charactersWithoutGlyph() };
}
