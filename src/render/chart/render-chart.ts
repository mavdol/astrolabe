import type { Benchmark, Comparison, Metric, Value } from "../../schema/benchmark.js";
import type { ChartBlock, ChartType } from "../../schema/presentation.js";
import { seriesStylesOf, THEME, type Mode, type SeriesStyle } from "../../themes/astrolabe.js";
import {
  effectAndInterval,
  effectUnit,
  finestDecimals,
  lookupOf,
  lowerFirstLetterOfWord,
  provenanceParts,
  resolveTemplates,
  STATISTIC_WORD,
  valueDecimals,
  verdictLabel,
  type BuildContext,
  type Lookup,
} from "../describe.js";
import { formatInterval, formatLevel, formatNumber, type Decimals } from "../number-format.js";
import { CAP_HEIGHT_RATIO, SvgTextRenderer, type TextStyle } from "../svg-text.js";
import { ChartError, comparisonGroupsOf, metricOf, valueGroupsOf, type FilterState } from "./chart-data.js";
import { drawRowsPlot, PLOT_FIXED_HEIGHT, ROW_HEIGHT, rowUnitsOf, type PlotGroup, type RowsPlot } from "./rows-plot.js";
import { extentAroundData } from "./scale.js";

/** The chart types the generator draws so far. */
export const DRAWN_CHART_TYPES: ChartType[] = ["bar", "dot-interval", "effect"];

export interface ChartOptions {
  /** Width in px at the size the chart is shown; text sizes are in the same px. */
  width: number;
  /** A fixed height, for an image of a set shape; without it the chart is as tall as its rows need. */
  height?: number;
  mode: Mode;
  filterState: FilterState;
  /** A file that travels alone carries its own background and its provenance line. */
  standalone: boolean;
  /** How much larger than its layout the file is shown: an image of a set shape is laid out small and enlarged. */
  enlargement?: number;
}

export interface DataTable {
  header: string[];
  rows: string[][];
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

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const directionWords = (metric: Metric) => (metric.direction === "lower" ? "lower is better" : "higher is better");
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

function range(numbers: number[]): string {
  const [lowest, highest] = [Math.min(...numbers), Math.max(...numbers)];

  return lowest === highest ? String(lowest) : `${lowest} to ${highest}`;
}

function levelsOf(entries: { ci?: [number, number]; ci_level?: number }[]): string | null {
  const levels = [...new Set(entries.filter((entry) => entry.ci && entry.ci_level).map((entry) => formatLevel(entry.ci_level!)))];

  return levels.length > 0 ? `${levels.join("% and ")}%` : null;
}

interface ChartContent {
  plot: RowsPlot;
  subtitle: string;
  howToRead: string;
  table: DataTable;
  /** What is plotted, in words, for the text alternative. */
  kind: string;
}

function failureSentences(metric: Metric, comparisons: Comparison[]): string {
  const leftOut = metric.failures_count_as === "excluded" ? " Failed attempts are left out: successful attempts only." : "";
  const warning = comparisons.some((comparison) => comparison.failure_warning)
    ? " Warning: the candidates did not fail equally often."
    : "";

  return `${leftOut}${warning}`;
}

function valuesContent(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, options: ChartOptions): ChartContent {
  const metric = metricOf(block, lookup);
  const groups = valueGroupsOf(block, benchmark, lookup, options.filterState);
  const values = groups.flatMap((group) => group.values);
  const series = seriesStylesOf(
    lookup.results.candidates.map((candidate) => candidate.id),
    benchmark.style,
    options.mode,
  );
  const decimals = finestDecimals(values.map((value) => valueDecimals(metric, value)));
  const isBar = block.chart === "bar";

  if (isBar && values.some((value) => value.value < 0))
    throw new ChartError(`block "${block.id}": a bar starts at zero, so it cannot show a negative value; use dot-interval`);

  if (block.scale?.type === "log") throw new ChartError(`block "${block.id}": log scales are not available yet`);

  const plotted = values.flatMap((value) => [value.value, ...(value.ci ?? [])]);
  const dataExtent: [number, number] = [Math.min(...plotted), Math.max(...plotted)];
  const largest = Math.max(...values.map((value) => Math.abs(value.value)));
  const meaningfulInUnits = metric.compare_as === "relative" ? (metric.minimum_meaningful / 100) * largest : metric.minimum_meaningful;
  const startsAtZero = isBar || block.scale?.zero !== false;
  const extent: [number, number] = startsAtZero
    ? [Math.min(0, dataExtent[0]), Math.max(0, dataExtent[1])]
    : extentAroundData(dataExtent, meaningfulInUnits);
  const plotGroups: PlotGroup[] = groups.map((group) => ({
    heading: group.heading,
    rows: group.values.map((value) => ({
      label: lookup.candidateName.get(value.candidate) ?? value.candidate,
      series: series.get(value.candidate)!,
      value: value.value,
      interval: value.ci,
      valueText: formatNumber(value.value, decimals),
      note: value.source === "declared" ? "declared" : undefined,
    })),
  }));
  const statistic = STATISTIC_WORD[metric.statistic].toLowerCase();
  const observations = values.filter((value) => value.n !== undefined).map((value) => value.n!);
  const levels = levelsOf(values);
  const methods = [...new Set(values.filter((value) => value.ci && value.method).map((value) => value.method!))];
  const comparisons = (lookup.results.comparisons ?? []).filter((comparison) => comparison.metric === metric.id);
  const howToRead = [
    options.height === undefined ? sentence(metric.definition) : "",
    `Each ${isBar ? "bar" : "dot"}: the ${statistic}${observations.length > 0 ? ` of ${range(observations)} observations` : ""}, in ${metric.unit}; ${directionWords(metric)}.`,
    levels ? `Lines: ${levels} confidence intervals (${methods.join(", ")}).` : "No interval: too few observations, or declared values.",
    startsAtZero ? "" : `The axis does not start at zero: ${sentence(block.scale!.reason!)}`,
    failureSentences(metric, comparisons).trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: {
      groups: plotGroups,
      mark: isBar ? "bar" : "dot",
      extent,
      tickText: (value, tickDecimals) => formatNumber(value, tickDecimals),
      betterSide: metric.direction === "lower" ? "left" : "right",
    },
    subtitle: `${metric.label}, ${statistic} in ${metric.unit} · ${directionWords(metric)}`,
    howToRead,
    kind: `${isBar ? "Bar chart" : "Dot chart with intervals"} of ${lowerFirstLetterOfWord(metric.label)}`,
    table: {
      header: [
        ...(groups.some((group) => group.heading) ? ["Group"] : []),
        "Candidate",
        `${STATISTIC_WORD[metric.statistic]} (${metric.unit})`,
        "Interval",
        "n",
      ],
      rows: groups.flatMap((group) =>
        group.values.map((value: Value) => [
          ...(groups.some((entry) => entry.heading) ? [group.heading ?? ""] : []),
          lookup.candidateName.get(value.candidate) ?? value.candidate,
          `${formatNumber(value.value, decimals)}${value.source === "declared" ? " (declared)" : ""}`,
          value.ci ? `${formatInterval(value.ci, decimals)} (${formatLevel(value.ci_level!)}%)` : "—",
          String(value.n ?? "—"),
        ]),
      ),
    },
  };
}

function effectsContent(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, options: ChartOptions): ChartContent {
  const metric = metricOf(block, lookup);
  const groups = comparisonGroupsOf(block, benchmark, lookup, options.filterState);
  const comparisons = groups.flatMap((group) => group.comparisons);
  const series = seriesStylesOf(
    lookup.results.candidates.map((candidate) => candidate.id),
    benchmark.style,
    options.mode,
  );
  const unit = effectUnit(metric);
  const minimum = metric.minimum_meaningful;
  const comparedCandidates = [...new Set(comparisons.map((comparison) => comparison.candidate))];
  const onlyCandidate = comparedCandidates.length === 1 && groups.length > 1 ? lookup.candidateName.get(comparedCandidates[0]) : undefined;
  const plotted = comparisons.flatMap((comparison) => [comparison.effect, ...(comparison.ci ?? [])]);
  const baselineName = lookup.candidateName.get(lookup.results.baseline);
  const noteOf = (comparison: Comparison) =>
    [verdictLabel(comparison), comparison.role === "exploratory" ? "exploratory" : "", comparison.source === "declared" ? "declared" : ""]
      .filter(Boolean)
      .join(", ");
  const rowOf = (comparison: Comparison, label: string) => ({
    label,
    series: series.get(comparison.candidate)!,
    value: comparison.effect,
    interval: comparison.ci,
    valueText: effectAndInterval(metric, comparison).effect,
    note: noteOf(comparison),
  });
  const plotGroups: PlotGroup[] = onlyCandidate
    ? [{ rows: groups.map((group) => rowOf(group.comparisons[0], group.heading!)) }]
    : groups.map((group) => ({
        heading: group.heading,
        rows: group.comparisons.map((comparison) =>
          rowOf(comparison, lookup.candidateName.get(comparison.candidate) ?? comparison.candidate),
        ),
      }));
  const levels = levelsOf(comparisons);
  const everyComparisonAdjusted = comparisons.every((comparison) => comparison.adjusted);
  const adjustment =
    everyComparisonAdjusted && lookup.results.computed!.primary_comparisons > 1
      ? `, adjusted for ${lookup.results.computed!.primary_comparisons} primary comparisons`
      : "";
  const hasExploratory = comparisons.some((comparison) => comparison.role === "exploratory");
  const howToRead = [
    options.height === undefined ? sentence(metric.definition) : "",
    `Each dot: the change ${onlyCandidate ? `of ${onlyCandidate} ` : ""}against ${baselineName}, ${metric.compare_as === "relative" ? "in percent of its value" : `in ${unit.trim()}`}; ${directionWords(metric)}.`,
    levels ? `Lines: ${levels} confidence intervals${adjustment}.` : "No interval: too few observations, or declared values.",
    `Shaded band: changes under ${formatNumber(minimum, null)}${unit}, too small to matter.`,
    hasExploratory ? "Exploratory comparisons were not declared before measuring: none is a claim of the benchmark." : "",
    failureSentences(metric, comparisons).trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: {
      groups: plotGroups,
      mark: "dot",
      extent: [Math.min(-minimum, ...plotted), Math.max(minimum, ...plotted)],
      tickText: (value, tickDecimals: Decimals) => `${formatNumber(value, tickDecimals, { signed: true })}${unit === "%" ? "%" : ""}`,
      band: [-minimum, minimum],
      zeroLine: true,
      betterSide: metric.direction === "lower" ? "left" : "right",
    },
    subtitle: `${metric.label}: change ${onlyCandidate ? `of ${onlyCandidate} ` : ""}against ${baselineName}${unit === "%" ? ", in %" : `, in${unit}`} · ${directionWords(metric)}`,
    howToRead,
    kind: `Effects on ${lowerFirstLetterOfWord(metric.label)} against ${baselineName}, with their intervals`,
    table: {
      header: [...(groups.some((group) => group.heading) ? ["Group"] : []), "Candidate", "Effect", "Interval", "Verdict"],
      rows: groups.flatMap((group) =>
        group.comparisons.map((comparison) => {
          const { effect, interval, level } = effectAndInterval(metric, comparison);

          return [
            ...(groups.some((entry) => entry.heading) ? [group.heading ?? ""] : []),
            lookup.candidateName.get(comparison.candidate) ?? comparison.candidate,
            effect,
            interval ? `${interval} (${level})` : "—",
            noteOf(comparison),
          ];
        }),
      ),
    },
  };
}

function contentOf(block: ChartBlock, benchmark: Benchmark, lookup: Lookup, options: ChartOptions): ChartContent {
  switch (block.chart) {
    case "bar":
    case "dot-interval":
      return valuesContent(block, benchmark, lookup, options);
    case "effect":
      return effectsContent(block, benchmark, lookup, options);
    default:
      throw new ChartError(`block "${block.id}": ${block.chart} charts are not available yet`);
  }
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
  const content = contentOf(block, benchmark, lookup, options);
  const text = new SvgTextRenderer();
  const marks: string[] = [];
  const textLines: string[] = [];
  const padding = options.standalone ? PADDING : 0;
  const innerWidth = options.width - 2 * padding;
  const title = resolveTemplates(block.title, lookup);
  const reading = block.description ? resolveTemplates(block.description, lookup) : "";
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
  const fixedHeight = 2 * padding + heightOf(header) + PLOT_FIXED_HEIGHT + gapBeforeFooter + heightOf(footer);
  const rowUnits = rowUnitsOf(content.plot);
  const rowHeight =
    options.height === undefined
      ? ROW_HEIGHT.usual
      : Math.min(ROW_HEIGHT.largest, Math.floor(((options.height - fixedHeight) / rowUnits) * 10) / 10);

  if (rowHeight < ROW_HEIGHT.smallest)
    throw new ChartError(
      `block "${block.id}" has too many rows for an image ${options.width} by ${options.height}: show fewer with a filter state, or choose another size`,
    );

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

  const naturalHeight = fixedHeight + rowUnits * rowHeight;
  const height = options.height ?? Math.ceil(naturalHeight);
  const spareHeight = height - naturalHeight;
  const plotTop = drawParts(header, padding) + spareHeight / 2;
  const plot = drawRowsPlot(content.plot, text, colours, padding, plotTop, innerWidth, rowHeight);

  marks.push(...plot.marks);
  textLines.push(...plot.textLines);

  const footerTop = options.height === undefined ? plotTop + plot.height + gapBeforeFooter : height - padding - heightOf(footer);

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
