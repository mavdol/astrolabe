import type { RawFile } from "../../compute/raw-data.js";
import type { Benchmark } from "../../schema/benchmark.js";
import type { ChartBlock } from "../../schema/presentation.js";
import { ASTROLABE } from "../../themes/astrolabe.js";
import { fontStackOf, type LinedTextStyle, type Mode } from "../../themes/theme.js";
import { lookupOf, provenanceParts, resolveTemplates, type BuildContext, type Lookup } from "../describe.js";
import { CAP_HEIGHT_RATIO, escapeXml, SvgTextRenderer } from "../svg-text.js";
import { tickMark, TICK_MARK_WIDTH } from "../card.js";
import {
  asSentence,
  capitalised,
  keyMarkOf,
  sentence,
  unionOf,
  type ChartContent,
  type ChartInputs,
  type DataTable,
  type KeyMark,
  type KeyPaint,
  type ReadingPart,
} from "./chart-content.js";
import { ChartError, filterStatesOf, type FilterState } from "./chart-data.js";
import { comparisonRowsContent } from "./comparison-rows.js";
import { lineContent } from "./line.js";
import { distributionContent, resultsContent, effectsContent, stackedContent, valuesContent } from "./rows-charts.js";
import { scatterContent } from "./scatter.js";
import { shadedTableContent } from "./shaded-table.js";

export type { DataTable };

export interface ChartOptions {
  /** Width in px at the size the chart is shown; text sizes are in the same px. */
  width: number;
  /** A fixed height, for an image of a set shape; without it the chart is as tall as its content needs. */
  height?: number;
  mode: Mode;
  filterState: FilterState;
  /** A file that travels alone carries its own background and its provenance line. */
  standalone: boolean;
  /** How much larger than its layout the file is shown: an image of a set shape is laid out small and enlarged. */
  enlargement?: number;
  /** The raw files, for the charts that draw every observation. */
  rawFiles?: Record<string, RawFile>;
  /**
   * The plot alone, inside a page that writes the title, the reading and how to read it around it,
   * with real text in the page's font rather than paths.
   */
  plotOnly?: boolean;
  /** Where the page describes a part, so that the chart can link the part's name there. */
  partLink?: (node: string) => string | undefined;
}

export interface RenderedChart {
  svg: string;
  width: number;
  height: number;
  title: string;
  /** What is measured and which way is better. */
  subtitle: string;
  /** The author's reading, its templates filled. */
  reading: string;
  /** The short text alternative: what the chart is and what its title claims. */
  altText: string;
  /** The long text alternative: what is plotted, every value, and the author's reading. */
  description: string;
  /** How to read the chart: what is measured, its direction, the observations and the intervals. */
  howToRead: string;
  /** The same, sentence by sentence, the sentences about a mark tagged with it, when the chart says it that way. */
  howToReadParts?: ReadingPart[];
  /** The same data as a table, for readers who cannot use the shapes. */
  table: DataTable;
  textLines: string[];
  charactersWithoutGlyph: string[];
}

const STYLE = ASTROLABE.text.chartImage;

const PADDING = 32;

/** The space between the parts around the plot; an image of a set shape keeps it tighter, to leave the plot its room. */
const SPACING = {
  roomy: { underLabel: 14, underHeading: 24, beforeFooter: 20, underRule: 14, inFooter: 10 },
  tight: { underLabel: 8, underHeading: 14, beforeFooter: 10, underRule: 6, inFooter: 6 },
} as const;
const KEY_MARK_WIDTH = 18;
const KEY_MARK_HEIGHT = 12;
const KEY_MARK_GAP = 10;
const KEY_COLUMN_GAP = 28;
const KEY_ROW_GAP = 8;

interface KeyEntry {
  mark: KeyMark;
  lines: string[];
  x: number;
  y: number;
}

/** The key as on the site: each mark with its words, side by side while they fit, a long entry on its own row. */
function keyLayoutOf(parts: ReadingPart[], text: SvgTextRenderer, width: number): { entries: KeyEntry[]; height: number } {
  const entries: KeyEntry[] = [];
  const textRoom = width - KEY_MARK_WIDTH - KEY_MARK_GAP;
  let [x, y, rowHeight] = [0, 0, 0];

  for (const part of parts) {
    const words = capitalised(part.text);
    const lines = text.wrap(words, STYLE.foot, textRoom);
    const entryWidth = lines.length === 1 ? KEY_MARK_WIDTH + KEY_MARK_GAP + text.measure(words, STYLE.foot) : width;

    if (x > 0 && x + entryWidth > width) {
      [x, y, rowHeight] = [0, y + rowHeight + KEY_ROW_GAP, 0];
    }

    entries.push({ mark: part.mark!, lines, x, y });
    x += entryWidth + KEY_COLUMN_GAP;
    rowHeight = Math.max(rowHeight, lines.length * STYLE.foot.lineHeight);
  }

  return { entries, height: entries.length > 0 ? y + rowHeight : 0 };
}

/** The chart types whose main axis can be shared with another block: the others have two axes, or one per row. */
const CHART_TYPES_WITH_ONE_VALUE_AXIS = new Set([
  "bar",
  "grouped-bar",
  "dot-interval",
  "effect",
  "distribution",
  "line",
  "stacked-bar",
  "shaded-table",
]);

function contentOf(inputs: ChartInputs): ChartContent {
  const { block } = inputs;

  if (block.effect_format === "times" && block.chart !== "comparison-rows")
    throw new ChartError(
      "V55",
      `block "${block.id}": factors are shown on comparison-rows charts; an ${block.chart} chart shows changes in percent`,
    );

  switch (block.chart) {
    case "bar":
    case "grouped-bar":
    case "dot-interval":
      return valuesContent(inputs);
    case "effect":
      return effectsContent(inputs);
    case "distribution":
      return distributionContent(inputs);
    case "stacked-bar":
      return stackedContent(inputs);
    case "comparison-rows":
      return comparisonRowsContent(inputs);
    case "scatter":
      return scatterContent(inputs);
    case "line":
      return lineContent(inputs);
    case "shaded-table":
      return shadedTableContent(inputs);
    case "results":
      return resultsContent(inputs);
  }
}

/**
 * The values the main axis covers in every state the reader can switch to, and in every block that
 * shares its scale: switching a filter, or looking from one panel to the next, never changes the scale.
 */
function sharedExtentOf(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, inputs: Omit<ChartInputs, "block" | "filterState">) {
  const sharedWith = (block.scale?.shared_with ?? []).map((blockId) => {
    const other = (benchmark.blocks ?? []).find((candidate) => candidate.id === blockId);

    if (!other || other.type !== "chart")
      throw new ChartError("V6", `block "${block.id}" shares its scale with "${blockId}", which is not a chart block`);

    if (
      other.metric !== block.metric ||
      !CHART_TYPES_WITH_ONE_VALUE_AXIS.has(other.chart) ||
      (other.chart === "effect") !== (block.chart === "effect")
    )
      throw new ChartError(
        "V6",
        `block "${block.id}" shares its scale with "${blockId}", which does not show the same measure on one axis`,
      );

    return other;
  });
  const namingThisBlock = (benchmark.blocks ?? []).filter(
    (other): other is ChartBlock =>
      other.type === "chart" && other.id !== block.id && (other.scale?.shared_with ?? []).includes(block.id) && !sharedWith.includes(other),
  );
  const related = [block, ...sharedWith, ...namingThisBlock];

  if (!CHART_TYPES_WITH_ONE_VALUE_AXIS.has(block.chart)) {
    if (related.length > 1) throw new ChartError("V6", `block "${block.id}": a ${block.chart} chart cannot share its scale`);

    return undefined;
  }

  if (related.length === 1 && (block.filters ?? []).length === 0) return undefined;

  let extent: [number, number] | undefined;

  for (const entry of related)
    for (const filterState of filterStatesOf(entry, benchmark, lookup)) {
      try {
        const stateExtent = contentOf({ ...inputs, block: entry, filterState }).axisExtent;

        if (stateExtent) extent = extent ? unionOf(extent, stateExtent) : stateExtent;
      } catch (failure) {
        if (!(failure instanceof ChartError)) throw failure;
      }
    }

  return extent;
}

/**
 * One chart as an SVG: its title, what is measured and which way is better, the plot, how to read it,
 * and for a file that travels alone its provenance. The same function draws every output.
 */
export function renderChart(benchmark: Benchmark, block: ChartBlock, options: ChartOptions, context: BuildContext): RenderedChart {
  const results = benchmark.results;

  if (!results.computed) throw new Error("the results have not been computed: run astrolabe compute first");

  const lookup = lookupOf(results);
  const colours = ASTROLABE.colours[options.mode];
  const common = {
    benchmark,
    lookup,
    mode: options.mode,
    compact: options.height !== undefined,
    rawFiles: options.rawFiles ?? {},
    partLink: options.partLink,
  };
  const sharedExtent = sharedExtentOf(block, benchmark, lookup, common);
  const content = contentOf({ ...common, block, filterState: options.filterState, sharedExtent });
  const plotOnly = options.plotOnly === true;
  const text = new SvgTextRenderer({ realText: plotOnly });
  const marks: string[] = [];
  const textLines: string[] = [];
  const padding = options.standalone && !plotOnly ? PADDING : 0;
  const innerWidth = options.width - 2 * padding;
  const title = resolveTemplates(block.title, lookup, block.effect_format);
  const reading = block.description ? resolveTemplates(block.description, lookup, block.effect_format) : "";
  const provenance = provenanceParts(benchmark, context);
  const provenanceItems = [
    provenance.source.replace(/^https?:\/\//, ""),
    `results ${provenance.hash}`,
    provenance.date,
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
    ...(provenance.attribution ? ["Built with Astrolabe"] : []),
  ];
  const provenanceText = provenanceItems.join(" · ");

  const decorated = !plotOnly;
  const spacing = options.height === undefined ? SPACING.roomy : SPACING.tight;
  const headingStyle = options.height === undefined ? STYLE.title : STYLE.tightTitle;
  const labelLines = decorated
    ? text.wrapParts(
        content.subtitle.split(" · ").map((part) => part.toUpperCase()),
        STYLE.subtitle,
        innerWidth - TICK_MARK_WIDTH,
      )
    : [];
  const claimed = (reading ? asSentence(title) : title).replace(/\s+/g, " ").trim();
  const headingLines = decorated ? text.wrap(reading ? `${claimed} ${reading}` : claimed, headingStyle, innerWidth) : [];
  const readingParts = (content.howToReadParts ?? []).filter((part) => part.text);
  const keyed = readingParts.filter((part) => part.mark);
  const provenanceLines = decorated && options.standalone ? text.wrapParts(provenanceItems, STYLE.foot, innerWidth) : [];
  const footLines = (count: number) => count * STYLE.foot.lineHeight;
  const headerHeight = decorated
    ? labelLines.length * STYLE.subtitle.lineHeight +
      spacing.underLabel +
      headingLines.length * headingStyle.lineHeight +
      spacing.underHeading
    : 0;
  const footerOf = (withKey: boolean) => {
    const key = withKey ? keyLayoutOf(keyed, text, innerWidth) : undefined;
    const saidText = key
      ? readingParts
          .filter((part) => !part.mark)
          .map((part) => part.text)
          .join(" ")
      : content.howToRead;
    const saidLines = text.wrap(saidText, STYLE.foot, innerWidth);
    const height =
      spacing.underRule +
      (key?.height ?? 0) +
      (key && saidLines.length > 0 ? spacing.inFooter : 0) +
      footLines(saidLines.length) +
      (provenanceLines.length > 0 ? spacing.inFooter + footLines(provenanceLines.length) : 0);

    return { key, saidLines, height };
  };
  const plotHeights = content.plot.heightsAt(innerWidth, text);
  const gapBeforeFooter = decorated ? spacing.beforeFooter : 0;
  const fixedHeightWith = (footerHeight: number) => 2 * padding + headerHeight + gapBeforeFooter + footerHeight;
  const keyedFooter = decorated && keyed.length > 0 ? footerOf(true) : undefined;
  // An image of a set shape gives up the key for the same words in one paragraph when the key would leave the plot too little room.
  const footer = decorated
    ? keyedFooter && (options.height === undefined || options.height - fixedHeightWith(keyedFooter.height) >= plotHeights.smallest)
      ? keyedFooter
      : footerOf(false)
    : undefined;
  const fixedHeight = fixedHeightWith(footer?.height ?? 0);
  const room = options.height === undefined ? plotHeights.usual : options.height - fixedHeight;

  if (room < plotHeights.smallest)
    throw new ChartError(
      "V41",
      `block "${block.id}" needs ${Math.ceil(fixedHeight + plotHeights.smallest)} px of height and the image has ${options.height}: shorten its title and reading, show less of it with a filter state, or choose another size`,
    );

  const plotHeight = Math.min(room, plotHeights.largest);
  const height = options.height ?? Math.ceil(fixedHeight + plotHeight);
  const drawLine = (line: string, x: number, top: number, style: LinedTextStyle, fill: string) => {
    textLines.push(line);
    marks.push(text.draw(line, x, top + style.size * CAP_HEIGHT_RATIO + (style.lineHeight - style.size) / 2, { ...style, fill }));
  };
  let y = padding;

  if (decorated) {
    marks.push(tickMark(padding, y + STYLE.subtitle.lineHeight / 2, colours));

    for (const line of labelLines) {
      drawLine(line, padding + TICK_MARK_WIDTH, y, STYLE.subtitle, colours.secondary);
      y += STYLE.subtitle.lineHeight;
    }

    y += spacing.underLabel;

    // The claim in ink and the reading after it in grey, as one paragraph, as the site's chapters write it.
    let offset = 0;

    for (const line of headingLines) {
      const inkLength = Math.max(0, Math.min(line.length, claimed.length - offset));
      const [ink, grey] = [line.slice(0, inkLength), line.slice(inkLength).trimStart()];
      const baseline = y + headingStyle.size * CAP_HEIGHT_RATIO + (headingStyle.lineHeight - headingStyle.size) / 2;

      textLines.push(line);

      if (ink) marks.push(text.draw(ink, padding, baseline, { ...headingStyle, fill: colours.ink }));

      if (grey)
        marks.push(
          text.draw(grey, padding + (ink ? text.measure(`${ink} `, headingStyle) : 0), baseline, {
            ...headingStyle,
            fill: colours.secondary,
          }),
        );

      offset += line.length + 1;
      y += headingStyle.lineHeight;
    }

    y += spacing.underHeading;
  }

  const plotTop = y + (room - plotHeight) / 2;
  const plot = content.plot.draw(text, colours, { x: padding, y: plotTop, width: innerWidth, height: plotHeight });

  marks.push(...plot.marks);
  textLines.push(...plot.textLines);

  if (footer) {
    const { key, saidLines } = footer;
    const keyPaint: KeyPaint = (role) =>
      ({
        fill: `fill="${colours.ink}"`,
        stroke: `fill="none" stroke="${colours.ink}" stroke-width="1.5"`,
        dashed: `fill="none" stroke="${colours.secondary}" stroke-width="1.5" stroke-dasharray="3 3"`,
        band: `fill="${colours.ruleStrong}"`,
      })[role];
    let footerY = options.height === undefined ? plotTop + plotHeight + gapBeforeFooter : height - padding - footer.height;

    marks.push(`<path d="M${padding} ${footerY + 0.5}H${padding + innerWidth}" stroke="${colours.ruleStrong}" stroke-dasharray="3 3"/>`);
    footerY += spacing.underRule;

    for (const entry of key?.entries ?? []) {
      const [x, top] = [padding + entry.x, footerY + entry.y];

      marks.push(
        `<g transform="translate(${x} ${top + (STYLE.foot.lineHeight - KEY_MARK_HEIGHT) / 2})">${keyMarkOf(entry.mark, keyPaint)}</g>`,
      );
      entry.lines.forEach((line, index) =>
        drawLine(line, x + KEY_MARK_WIDTH + KEY_MARK_GAP, top + index * STYLE.foot.lineHeight, STYLE.foot, colours.secondary),
      );
    }

    if (key) footerY += key.height + (saidLines.length > 0 ? spacing.inFooter : 0);

    for (const line of saidLines) {
      drawLine(line, padding, footerY, STYLE.foot, colours.secondary);
      footerY += STYLE.foot.lineHeight;
    }

    if (provenanceLines.length > 0) footerY += spacing.inFooter;

    for (const line of provenanceLines) {
      drawLine(line, padding, footerY, STYLE.foot, colours.quiet);
      footerY += STYLE.foot.lineHeight;
    }
  }

  const altText = `${sentence(title)} ${sentence(content.kind)}`;
  const valuesInWords = content.table.rows.map((row) => row.filter((cell) => cell !== "" && cell !== "—").join(", ")).join("; ");
  const description = [sentence(content.kind), sentence(valuesInWords), reading ? sentence(reading) : "", content.howToRead]
    .filter(Boolean)
    .join(" ");
  const enlargement = options.enlargement ?? 1;
  const frame =
    options.standalone && !plotOnly
      ? `<rect x="0.5" y="0.5" width="${options.width - 1}" height="${height - 1}" fill="${colours.background}" stroke="${colours.ruleStrong}"/>`
      : "";
  const opening = plotOnly
    ? [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${height}" viewBox="0 0 ${options.width} ${height}" role="img" aria-label="${escapeXml(altText)}"`,
        ` font-family="${fontStackOf(ASTROLABE.fonts.text)}">`,
      ]
    : [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(options.width * enlargement)}" height="${Math.round(height * enlargement)}" viewBox="0 0 ${options.width} ${height}" role="img" aria-labelledby="title description"`,
        ` data-results-sha256="${provenance.hash}" data-build-date="${provenance.date}" data-generator="astrolabe-bench ${context.generatorVersion}">`,
        `<title id="title">${escapeXml(altText)}</title>`,
        `<desc id="description">${escapeXml(description)}</desc>`,
      ];
  const svg = [...opening, text.definitions(), frame, ...marks, "</svg>\n"].join("");

  return {
    svg,
    width: options.width,
    height,
    title,
    subtitle: content.subtitle,
    reading,
    altText,
    description,
    howToRead: content.howToRead,
    howToReadParts: content.howToReadParts,
    table: content.table,
    textLines,
    charactersWithoutGlyph: text.charactersWithoutGlyph(),
  };
}
