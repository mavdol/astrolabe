import type { RawFile } from "../../compute/raw-data.js";
import type { Benchmark } from "../../schema/benchmark.js";
import type { ChartBlock } from "../../schema/presentation.js";
import { THEME, type Mode } from "../../themes/astrolabe.js";
import { lookupOf, provenanceParts, resolveTemplates, type BuildContext, type Lookup } from "../describe.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer, type TextStyle } from "../svg-text.js";
import { sentence, unionOf, type ChartContent, type ChartInputs, type DataTable } from "./chart-content.js";
import { ChartError, filterStatesOf, type FilterState } from "./chart-data.js";
import { comparisonRowsContent } from "./comparison-rows.js";
import { lineContent } from "./line.js";
import { distributionContent, effectsContent, stackedContent, valuesContent } from "./rows-charts.js";
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
}

export interface RenderedChart {
  svg: string;
  width: number;
  height: number;
  /** The short text alternative: what the chart is and what its title claims. */
  altText: string;
  /** The long text alternative: what is plotted, every value, and the author's reading. */
  description: string;
  /** How to read the chart: what is measured, its direction, the observations and the intervals. */
  howToRead: string;
  /** The same data as a table, for readers who cannot use the shapes. */
  table: DataTable;
  textLines: string[];
  charactersWithoutGlyph: string[];
}

const STYLE = {
  title: { weight: 600, size: 20, lineHeight: 26, tracking: -0.01 },
  subtitle: { weight: 500, size: 13, lineHeight: 18 },
  description: { weight: 400, size: 13, lineHeight: 19 },
  foot: { weight: 400, size: 12, lineHeight: 17 },
} as const;

const PADDING = 32;
const CORNER_RADIUS = 12;

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

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  const colours = THEME[options.mode];
  const common = { benchmark, lookup, mode: options.mode, compact: options.height !== undefined, rawFiles: options.rawFiles ?? {} };
  const sharedExtent = sharedExtentOf(block, benchmark, lookup, common);
  const content = contentOf({ ...common, block, filterState: options.filterState, sharedExtent });
  const text = new SvgTextRenderer();
  const marks: string[] = [];
  const textLines: string[] = [];
  const padding = options.standalone ? PADDING : 0;
  const innerWidth = options.width - 2 * padding;
  const title = resolveTemplates(block.title, lookup, block.effect_format);
  const reading = block.description ? resolveTemplates(block.description, lookup, block.effect_format) : "";
  const provenance = provenanceParts(benchmark, context);
  const provenanceText = [
    provenance.source.replace(/^https?:\/\//, ""),
    `results ${provenance.hash}`,
    provenance.date,
    ...(provenance.continuousIntegration ? [`commit ${provenance.continuousIntegration.commit}`] : []),
    ...(provenance.attribution ? ["Built with Astrolabe"] : []),
  ].join(" · ");

  interface TextPart {
    lines: string[];
    style: TextStyle & { lineHeight: number };
    fill: string;
    gapAfter: number;
  }

  const wrapped = (words: string, style: TextStyle) => text.wrap(words, style, innerWidth);
  const header: TextPart[] = [
    { lines: wrapped(title, STYLE.title), style: STYLE.title, fill: colours.ink, gapAfter: 4 },
    { lines: wrapped(content.subtitle, STYLE.subtitle), style: STYLE.subtitle, fill: colours.secondary, gapAfter: reading ? 8 : 16 },
    ...(reading ? [{ lines: wrapped(reading, STYLE.description), style: STYLE.description, fill: colours.ink, gapAfter: 16 }] : []),
  ];
  const footer: TextPart[] = [
    { lines: wrapped(content.howToRead, STYLE.foot), style: STYLE.foot, fill: colours.secondary, gapAfter: 6 },
    ...(options.standalone
      ? [{ lines: wrapped(provenanceText, STYLE.foot), style: STYLE.foot, fill: colours.secondary, gapAfter: 0 }]
      : []),
  ];
  const heightOf = (parts: TextPart[]) =>
    parts.reduce((height, part) => height + part.lines.length * part.style.lineHeight + part.gapAfter, 0);
  const gapBeforeFooter = 16;
  const fixedHeight = 2 * padding + heightOf(header) + gapBeforeFooter + heightOf(footer);
  const plotHeights = content.plot.heightsAt(innerWidth, text);
  const room = options.height === undefined ? plotHeights.usual : options.height - fixedHeight;

  if (room < plotHeights.smallest)
    throw new ChartError(
      "V41",
      `block "${block.id}" needs ${Math.ceil(fixedHeight + plotHeights.smallest)} px of height and the image has ${options.height}: shorten its title and reading, show less of it with a filter state, or choose another size`,
    );

  const plotHeight = Math.min(room, plotHeights.largest);
  const height = options.height ?? Math.ceil(fixedHeight + plotHeight);

  const drawParts = (parts: TextPart[], startY: number): number => {
    let y = startY;

    for (const part of parts) {
      for (const line of part.lines) {
        textLines.push(line);
        marks.push(
          text.draw(line, padding, y + part.style.size * CAP_HEIGHT_RATIO + (part.style.lineHeight - part.style.size) / 2, {
            ...part.style,
            fill: part.fill,
          }),
        );
        y += part.style.lineHeight;
      }

      y += part.gapAfter;
    }

    return y;
  };

  const plotTop = drawParts(header, padding) + (room - plotHeight) / 2;
  const plot = content.plot.draw(text, colours, { x: padding, y: plotTop, width: innerWidth, height: plotHeight });

  marks.push(...plot.marks);
  textLines.push(...plot.textLines);

  const footerTop = options.height === undefined ? plotTop + plotHeight + gapBeforeFooter : height - padding - heightOf(footer);

  drawParts(footer, footerTop);

  const altText = `${sentence(title)} ${sentence(content.kind)}`;
  const valuesInWords = content.table.rows.map((row) => row.filter((cell) => cell !== "" && cell !== "—").join(", ")).join("; ");
  const description = [sentence(content.kind), sentence(valuesInWords), reading ? sentence(reading) : "", content.howToRead]
    .filter(Boolean)
    .join(" ");
  const enlargement = options.enlargement ?? 1;
  const frame = options.standalone
    ? `<rect x="0.5" y="0.5" width="${options.width - 1}" height="${height - 1}" rx="${CORNER_RADIUS}" fill="${colours.background}" stroke="${colours.rule}"/>`
    : "";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(options.width * enlargement)}" height="${Math.round(height * enlargement)}" viewBox="0 0 ${options.width} ${height}" role="img" aria-labelledby="title description"`,
    ` data-results-sha256="${provenance.hash}" data-build-date="${provenance.date}" data-generator="astrolabe-bench ${context.generatorVersion}">`,
    `<title id="title">${escapeXml(altText)}</title>`,
    `<desc id="description">${escapeXml(description)}</desc>`,
    text.definitions(),
    frame,
    ...marks,
    "</svg>\n",
  ].join("");

  return {
    svg,
    width: options.width,
    height,
    altText,
    description,
    howToRead: content.howToRead,
    table: content.table,
    textLines,
    charactersWithoutGlyph: text.charactersWithoutGlyph(),
  };
}
