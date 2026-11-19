import type { Benchmark, Comparison, Metric } from "../schema/benchmark.js";
import {
  effectAndInterval,
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
import { THEME, type Colours, type Mode } from "../themes/astrolabe.js";
import { formatLevel, formatNumber } from "./number-format.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer, type TextStyle } from "./svg-text.js";

export type CardMode = Mode;

const WIDTH = 800;
const PADDING = 40;
/** Space on each side of the thin rule between two headline columns. */
const COLUMN_GUTTER = 24;
const CORNER_RADIUS = 12;
const STRIP_HEIGHT = 24;
const STRIP_SCALE_ROW = 20;
const BADGE_HEIGHT = 22;
const BADGE_PADDING = 10;
const BADGE_ICON_SIZE = 10;
const WARNING_ICON_SIZE = 12;

export const MAX_HEADLINES = 3;

/** Every size is at least 12 px at the card's own width, the smallest text readable once shown in a README. */
export const STYLE = {
  eyebrow: { weight: 500, size: 14, lineHeight: 18 },
  title: { weight: 600, size: 22, lineHeight: 28, tracking: -0.01 },
  label: { weight: 600, size: 13, lineHeight: 18 },
  effect: { weight: 700, size: 44, lineHeight: 48, tabular: true, tracking: -0.03 },
  effectUnit: { weight: 500, size: 16 },
  heading: { weight: 500, size: 14, lineHeight: 20 },
  badge: { weight: 600, size: 12, tracking: 0.04 },
  detail: { weight: 400, size: 12, lineHeight: 17 },
  warning: { weight: 600, size: 12, lineHeight: 17 },
  scale: { weight: 400, size: 12, tabular: true },
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
  const pairs = new Set(content.headlines.map(({ comparison }) => pairOf(lookup, comparison)));

  return pairs.size === 1 ? [...pairs][0] : null;
}

const directionWords = (metric: Metric) => (metric.direction === "lower" ? "lower is better" : "higher is better");

const normalizedWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}%+−.]+/gu, " ");

/**
 * A block title is left out when it only restates what the card already
 * shows: the candidates, the metric, the effect and the verdict.
 */
function addsInformation(resolvedTitle: string, lookup: Lookup, comparison: Comparison): boolean {
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

  const otherWords = remaining.split(/\s+/).filter((word) => word.length > 2 && !["vs", "against", "and"].includes(word));

  return otherWords.length > 1;
}

const pluralOf = (word: string) => (word.endsWith("y") ? `${word.slice(0, -1)}ies` : word.endsWith("s") ? word : `${word}s`);

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

  if (lowest.effect === highest.effect) return `${lowest.effect} in every one of the ${groups}`;

  return `From ${lowest.effectNumber} to ${highest.effect} across ${groups}`;
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
  const { interval, level } = effectAndInterval(metric, comparison);
  const details: Detail[] = [];

  if (comparison.source === "declared") details.push({ text: "Declared values, no interval" });
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

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The text alternative: every headline in words, for screen readers and for the alt of the README image. */
export function cardAltText(benchmark: Benchmark, content: CardContent): string {
  const lookup = lookupOf(benchmark.results);
  const sharedPair = sharedPairOf(lookup, content);
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

const round = (value: number) => String(Math.round(value * 10) / 10);

/** A check for better, a cross for worse, an equals sign for equivalent; inconclusive has no direction to show. */
function verdictIcon(comparison: Comparison, x: number, centreY: number, colour: string): string {
  const top = centreY - BADGE_ICON_SIZE / 2;
  const shapes = {
    better: `M${x} ${top + 5.2}L${x + 3.6} ${top + 8.6}L${x + 10} ${top + 1.6}`,
    worse: `M${x + 1} ${top + 1}L${x + 9} ${top + 9}M${x + 9} ${top + 1}L${x + 1} ${top + 9}`,
    equivalent: `M${x + 1} ${top + 3.4}H${x + 9}M${x + 1} ${top + 6.6}H${x + 9}`,
    inconclusive: "",
  };
  const shape = shapes[comparison.verdict];

  return shape
    ? `<path d="${shape}" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
}

function warningIcon(x: number, top: number, colour: string): string {
  const size = WARNING_ICON_SIZE;

  return [
    `<path d="M${x + size / 2} ${top + 0.8}L${x + size - 0.4} ${top + size - 0.8}H${x + 0.4}Z" fill="none" stroke="${colour}" stroke-width="1.4" stroke-linejoin="round"/>`,
    `<path d="M${x + size / 2} ${top + 4.4}V${top + 7.6}" stroke="${colour}" stroke-width="1.4" stroke-linecap="round"/>`,
    `<circle cx="${x + size / 2}" cy="${top + 9.3}" r="0.8" fill="${colour}"/>`,
  ].join("");
}

/** A small arrow pointing right, drawn as a path because the bundled font has no arrows. */
function rightArrow(x: number, centreY: number, colour: string): string {
  return `<path d="M${x} ${centreY}H${x + 9}M${x + 5.5} ${centreY - 3.5}L${x + 9} ${centreY}L${x + 5.5} ${centreY + 3.5}" fill="none" stroke="${colour}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Share of the strip's range left empty on each side, so the caps and the dot never touch its ends. */
const STRIP_PADDING = 0.08;

/**
 * The strip is drawn in gain: better is always on the right, whatever the
 * direction of the metric. The axis is linear and never cut: it always holds
 * zero, the whole band and the whole interval, so a large effect looks large.
 */
function stripScale(gainInterval: [number, number], minimum: number, x: number, width: number): (gain: number) => number {
  const lowest = Math.min(-minimum, gainInterval[0]);
  const highest = Math.max(minimum, gainInterval[1]);
  const padding = (highest - lowest) * STRIP_PADDING;
  const domainLow = lowest - padding;
  const domainHigh = highest + padding;

  return (gain) => x + ((gain - domainLow) / (domainHigh - domainLow)) * width;
}

/** The value of the band's edge on the better side, in the metric's own sign: −10% for a time, +3 points for a score. */
function thresholdLabels(metric: Metric): { better: string; worse: string } {
  const unit = metric.compare_as === "relative" ? "%" : "";
  const betterValue = metric.direction === "higher" ? metric.minimum_meaningful : -metric.minimum_meaningful;

  return {
    better: `${formatNumber(betterValue, null, { signed: true })}${unit}`,
    worse: `${formatNumber(-betterValue, null, { signed: true })}${unit}`,
  };
}

interface StripDrawing {
  marks: string;
  scaleLabels: { text: string; centreX: number }[];
}

/**
 * The effect as a dot, its interval as a capped line, zero as a rule and the
 * smallest difference that matters as a shaded band: the reader sees why the
 * verdict is what it is. Each strip has its own scale.
 */
function effectStrip(metric: Metric, comparison: Comparison, x: number, y: number, width: number, colours: Colours): StripDrawing {
  const toGain = (effect: number) => (metric.direction === "higher" ? effect : -effect);
  const minimum = metric.minimum_meaningful;
  const measuredInterval = comparison.source === "declared" ? undefined : comparison.ci;
  const gainEffect = toGain(comparison.effect);
  const gainInterval: [number, number] = measuredInterval
    ? [
        Math.min(toGain(measuredInterval[0]), toGain(measuredInterval[1])),
        Math.max(toGain(measuredInterval[0]), toGain(measuredInterval[1])),
      ]
    : [gainEffect, gainEffect];
  const positionOf = stripScale(gainInterval, minimum, x, width);
  const middle = y + STRIP_HEIGHT / 2;
  const left = positionOf(-minimum);
  const right = positionOf(minimum);
  const zero = positionOf(0);
  const marks: string[] = [];

  marks.push(`<path d="M${x} ${middle}H${round(x + width)}" stroke="${colours.rule}" stroke-width="1"/>`);

  marks.push(`<rect x="${round(left)}" y="${y}" width="${round(right - left)}" height="${STRIP_HEIGHT}" fill="${colours.band}"/>`);
  marks.push(
    `<path d="M${round(left)} ${y}V${y + STRIP_HEIGHT}M${round(right)} ${y}V${y + STRIP_HEIGHT}" stroke="${colours.secondary}" stroke-width="1" stroke-dasharray="2 2"/>`,
  );
  marks.push(`<path d="M${round(zero)} ${y - 2}V${y + STRIP_HEIGHT + 2}" stroke="${colours.secondary}" stroke-width="1"/>`);

  if (measuredInterval) {
    const start = positionOf(gainInterval[0]);
    const end = positionOf(gainInterval[1]);

    marks.push(
      `<path d="M${round(start)} ${middle}H${round(end)}M${round(start)} ${middle - 5}V${middle + 5}M${round(end)} ${middle - 5}V${middle + 5}" stroke="${colours.ink}" stroke-width="2.5" stroke-linecap="round"/>`,
    );
  }

  marks.push(
    `<circle cx="${round(positionOf(gainEffect))}" cy="${middle}" r="4.5" fill="${colours.ink}" stroke="${colours.background}" stroke-width="1.5"/>`,
  );

  const thresholds = thresholdLabels(metric);

  return {
    marks: marks.join(""),
    scaleLabels: [
      { text: "0", centreX: zero },
      { text: thresholds.better, centreX: right },
      { text: thresholds.worse, centreX: left },
    ],
  };
}

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
  const columns = content.headlines.map(({ comparison, title }) => {
    const metric = lookup.metricById.get(comparison.metric)!;
    const measured = `${measuredOf(lookup, comparison)}${sharedPair ? "" : ` · ${lookup.candidateName.get(comparison.candidate)}`}`;
    const oneLineLabel = `${measured} · ${directionWords(metric)}`;
    const labelLines =
      text.measure(oneLineLabel, STYLE.label) <= columnWidth
        ? [oneLineLabel]
        : [...text.wrap(measured, STYLE.label, columnWidth), directionWords(metric)];
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
      labelLines,
      titleLines:
        resolvedTitle && addsInformation(resolvedTitle, lookup, comparison) ? text.wrap(resolvedTitle, STYLE.heading, columnWidth) : [],
      details,
    };
  });
  const rowHeight = (linesOf: (column: (typeof columns)[number]) => string[], lineHeight: number) =>
    Math.max(0, ...columns.map((column) => linesOf(column).length)) * lineHeight;
  const columnsTop = cursorY;
  const effectTop = columnsTop + rowHeight((column) => column.labelLines, STYLE.label.lineHeight) + 8;
  const titleTop = effectTop + STYLE.effect.lineHeight + 4;
  const titleRowHeight = rowHeight((column) => column.titleLines, STYLE.heading.lineHeight);
  const badgeTop = titleTop + titleRowHeight + (titleRowHeight > 0 ? 12 : 8);
  const stripTop = badgeTop + BADGE_HEIGHT + 24;
  const detailsTop = stripTop + STRIP_HEIGHT + STRIP_SCALE_ROW + 8;
  const columnsBottom = detailsTop + rowHeight((column) => column.details.flatMap((detail) => detail.lines), STYLE.detail.lineHeight);

  columns.forEach(({ comparison, metric, labelLines, titleLines, details }, index) => {
    const x = columnX(index);
    const { effectNumber, unit } = effectAndInterval(metric, comparison);
    const effectBaseline = baselineOf(effectTop, STYLE.effect);
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
    const hasIcon = comparison.verdict !== "inconclusive";
    const iconSpace = hasIcon ? BADGE_ICON_SIZE + 6 : 0;
    const badgeWidth = text.measure(verdict, STYLE.badge) + 2 * BADGE_PADDING + iconSpace;
    const firm = isFirmVerdict(comparison);
    const badgeInk = firm ? colours.inkOnFill : colours.ink;
    const badgeCentreY = badgeTop + BADGE_HEIGHT / 2;

    marks.push(
      firm
        ? `<rect x="${x}" y="${badgeTop}" width="${round(badgeWidth)}" height="${BADGE_HEIGHT}" rx="${BADGE_HEIGHT / 2}" fill="${colours.ink}"/>`
        : `<rect x="${x + 0.5}" y="${badgeTop + 0.5}" width="${round(badgeWidth - 1)}" height="${BADGE_HEIGHT - 1}" rx="${(BADGE_HEIGHT - 1) / 2}" fill="none" stroke="${colours.secondary}"/>`,
    );
    marks.push(verdictIcon(comparison, x + BADGE_PADDING, badgeCentreY, badgeInk));
    marks.push(
      text.draw(verdict, x + BADGE_PADDING + iconSpace, badgeCentreY + (STYLE.badge.size * CAP_HEIGHT_RATIO) / 2, {
        ...STYLE.badge,
        fill: badgeInk,
      }),
    );
    textLines.push(verdict);

    const strip = effectStrip(metric, comparison, x, stripTop, columnWidth, colours);
    const scaleBaseline = stripTop + STRIP_HEIGHT + 6 + STYLE.scale.size * CAP_HEIGHT_RATIO;
    const betterBaseline = stripTop - 6;
    const betterWidth = text.measure("better", STYLE.scale);
    const arrowWidth = 13;
    const occupied: [number, number][] = [];
    const drawnScaleLabels: { text: string; start: number }[] = [];

    marks.push(strip.marks);
    marks.push(
      text.draw("better", x + columnWidth - arrowWidth - betterWidth, betterBaseline, { ...STYLE.scale, fill: colours.secondary }),
    );
    marks.push(rightArrow(x + columnWidth - arrowWidth + 4, betterBaseline - (STYLE.scale.size * CAP_HEIGHT_RATIO) / 2, colours.secondary));
    textLines.push("better →");

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

    let detailY = detailsTop;

    for (const detail of details) {
      if (detail.isWarning) {
        marks.push(warningIcon(x, detailY + 2, colours.ink));
        detailY = drawLines(detail.lines, STYLE.warning, colours.ink, x + WARNING_ICON_SIZE + 6, detailY);
      } else {
        detailY = drawLines(detail.lines, STYLE.detail, colours.secondary, x, detailY);
      }
    }
  });

  for (let column = 1; column < columnCount; column++) {
    const ruleX = columnX(column) - COLUMN_GUTTER;

    marks.push(`<path d="M${round(ruleX)} ${columnsTop}V${round(columnsBottom)}" stroke="${colours.rule}" stroke-width="1"/>`);
  }

  cursorY = columnsBottom + 28;
  marks.push(`<path d="M${PADDING} ${cursorY}H${WIDTH - PADDING}" stroke="${colours.rule}" stroke-width="1"/>`);
  cursorY += 16;

  const primaryCount = results.computed.primary_comparisons;
  const everyHeadlineAdjusted = content.headlines.every(({ comparison }) => comparison.adjusted);
  const isSingle = content.headlines.length === 1;
  const possessive = isSingle ? "its" : "their";
  const intervalNoun = isSingle ? "interval" : "intervals";
  const intervalPhrase =
    sharedLevel && everyHeadlineAdjusted
      ? `${possessive} ${formatLevel(1 - results.computed.alpha)}% ${intervalNoun}, adjusted for ${primaryCount} comparisons`
      : sharedLevel
        ? `${possessive} ${sharedLevel} ${intervalNoun}`
        : `${possessive} ${intervalNoun}`;
  const legend = [
    `${isSingle ? "Effect" : "Effects"} against ${lookup.candidateName.get(results.baseline)}, with ${intervalPhrase}. Shaded band: too small to matter.`,
    ...(content.omittedCount > 0
      ? [`${content.omittedCount} more primary comparison${content.omittedCount === 1 ? "" : "s"} in the full results.`]
      : []),
  ].join(" ");

  cursorY = drawLines(text.wrap(legend, STYLE.detail, innerWidth), STYLE.detail, colours.secondary, PADDING, cursorY);
  cursorY += 6;

  const provenance = provenanceParts(benchmark, context);
  const provenanceText = [
    provenance.source.replace(/^https?:\/\//, ""),
    `results ${provenance.hash}`,
    provenance.date,
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
    ...(provenance.attribution ? ["Built with Astrolabe"] : []),
  ].join(" · ");

  cursorY = drawLines(text.wrap(provenanceText, STYLE.detail, innerWidth), STYLE.detail, colours.secondary, PADDING, cursorY);

  const height = Math.ceil(cursorY + PADDING - 12);
  const altText = cardAltText(benchmark, content);
  const longDescription = [altText, legend, provenanceText].join(" ");
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
