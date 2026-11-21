import type { Value } from "../../schema/benchmark.js";
import type { Colours, SeriesStyle } from "../../themes/astrolabe.js";
import { finestDecimals, lowerFirstLetterOfWord, STATISTIC_WORD, valueDecimals } from "../describe.js";
import { formatInterval, formatLevel, formatNumber, type Decimals } from "../number-format.js";
import { CAP_HEIGHT_RATIO, type SvgTextRenderer } from "../svg-text.js";
import {
  candidateNameOf,
  comparisonsOn,
  directionWords,
  caveatSentences,
  intervalSentence,
  sentence,
  seriesOf,
  statisticWord,
  valueAxisOf,
  type ChartContent,
  type ChartInputs,
} from "./chart-content.js";
import { ChartError, metricOf, nodesOf } from "./chart-data.js";
import {
  arrow,
  BETTER,
  intervalUpwards,
  PLOT_STYLE,
  poppingMarker,
  round,
  taggedWith,
  widestOf,
  type DrawnPlot,
  type PlotArea,
} from "./plot.js";
import { linearScale, logScale } from "./scale.js";

interface LinePoint {
  value: number;
  interval?: [number, number];
}

interface LineSeries {
  label: string;
  candidate: string;
  series: SeriesStyle;
  points: (LinePoint | undefined)[];
}

interface LinePlot {
  xLabels: string[];
  lines: LineSeries[];
  extent: [number, number];
  logScale: boolean;
  tickText: (value: number, decimals: Decimals) => string;
  valueText: (value: number) => string;
  betterUpwards: boolean;
}

const DIRECTION_HEIGHT = 22;
const X_LABELS_HEIGHT = 24;
const FIXED_HEIGHT = DIRECTION_HEIGHT + X_LABELS_HEIGHT;
const END_LABEL_GAP = 8;
const END_LABEL_SPACING = 16;
const LARGEST_END_LABEL_SHARE = 0.3;
const SMALLEST_X_LABEL_SPACE = 36;
const DODGE = 4;

function drawLines(plot: LinePlot, text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot {
  const marks: string[] = [];
  const textLines: string[] = [];
  const tickStyle = { ...PLOT_STYLE.tick, fill: colours.secondary };
  const capHeight = (size: number) => size * CAP_HEIGHT_RATIO;
  const plotTop = area.y + DIRECTION_HEIGHT;
  const plotBottom = area.y + area.height - X_LABELS_HEIGHT;
  const targetTicks = plotBottom - plotTop < 200 ? 3 : 5;
  const scaleBetween = (pixels: [number, number]) =>
    plot.logScale ? logScale(plot.extent, pixels) : linearScale(plot.extent, pixels, targetTicks);
  const provisional = scaleBetween([0, 1]);
  const plotLeft =
    area.x +
    widestOf(
      text,
      provisional.ticks.map((tick) => plot.tickText(tick, provisional.tickDecimals)),
      PLOT_STYLE.tick,
    ) +
    8;
  const endLabelWidth = Math.min(
    widestOf(
      text,
      plot.lines.map((line) => line.label),
      PLOT_STYLE.label,
    ) + END_LABEL_GAP,
    area.width * LARGEST_END_LABEL_SHARE,
  );
  const plotRight = area.x + area.width - endLabelWidth;
  const yScale = scaleBetween([plotBottom, plotTop]);
  const step = (plotRight - plotLeft) / plot.xLabels.length;
  const dodgeOf = (lineIndex: number) => (plot.lines.length > 1 && step > 30 ? (lineIndex - (plot.lines.length - 1) / 2) * DODGE : 0);
  const xOf = (index: number, lineIndex: number) => plotLeft + step * (index + 0.5) + dodgeOf(lineIndex);

  for (const tick of yScale.ticks) {
    const tickY = yScale.position(tick);

    marks.push(
      `<path d="M${round(plotLeft)} ${round(tickY)}H${round(plotRight)}" stroke="${tick === 0 ? colours.ruleStrong : colours.rule}" stroke-width="1"/>`,
    );
    marks.push(
      text.draw(plot.tickText(tick, yScale.tickDecimals), plotLeft - 8, tickY + capHeight(12) / 2, { ...tickStyle, anchor: "end" }),
    );
  }

  textLines.push(yScale.ticks.map((tick) => plot.tickText(tick, yScale.tickDecimals)).join("  "));

  const arrowX = plotLeft + 4;
  const [arrowFrom, arrowTo] = plot.betterUpwards ? [area.y + 16, area.y + 4] : [area.y + 4, area.y + 16];

  marks.push(arrow([arrowX, arrowFrom], [arrowX, arrowTo], colours.secondary));
  marks.push(text.draw(BETTER, arrowX + 8, area.y + 10 + capHeight(12) / 2, { ...PLOT_STYLE.caption, fill: colours.secondary }));
  textLines.push(plot.betterUpwards ? `${BETTER} ↑` : `${BETTER} ↓`);

  const labelEvery = Math.max(1, Math.ceil(SMALLEST_X_LABEL_SPACE / step));

  plot.xLabels.forEach((label, index) => {
    if (index % labelEvery !== 0) return;

    const fitted = text.fit(label, PLOT_STYLE.tick, step * labelEvery - 4);
    const width = text.measure(fitted, PLOT_STYLE.tick);

    marks.push(text.draw(fitted, xOf(index, (plot.lines.length - 1) / 2) - width / 2, plotBottom + 8 + capHeight(12), tickStyle));
  });

  textLines.push(plot.xLabels.join("  "));

  const ends: { label: string; candidate: string; y: number }[] = [];

  plot.lines.forEach((line, lineIndex) => {
    const segments: string[] = [];
    let isDrawing = false;

    line.points.forEach((point, index) => {
      if (!point) return (isDrawing = false);

      segments.push(`${isDrawing ? "L" : "M"}${round(xOf(index, lineIndex))} ${round(yScale.position(point.value))}`);
      isDrawing = true;
    });

    const tag = (element: string) => taggedWith(element, line.candidate);

    marks.push(
      tag(
        `<path d="${segments.join("")}" stroke="${line.series.colour}" stroke-width="2" fill="none" stroke-linejoin="round" data-draw=""/>`,
      ),
    );

    line.points.forEach((point, index) => {
      if (point?.interval)
        marks.push(
          tag(
            intervalUpwards(
              yScale.position(point.interval[0]),
              yScale.position(point.interval[1]),
              xOf(index, lineIndex),
              line.series.colour,
              1.5,
            ),
          ),
        );
    });

    line.points.forEach((point, index) => {
      if (point)
        marks.push(
          tag(
            poppingMarker(line.series.shape, xOf(index, lineIndex), yScale.position(point.value), line.series.colour, colours.background),
          ),
        );
    });

    const last = [...line.points].reverse().find(Boolean);

    if (last) ends.push({ label: line.label, candidate: line.candidate, y: yScale.position(last.value) });

    textLines.push(`${line.label}  ${line.points.map((point) => (point ? plot.valueText(point.value) : "—")).join("  ")}`);
  });

  ends.sort((first, second) => first.y - second.y);
  ends.forEach((end, index) => {
    if (index > 0) end.y = Math.max(end.y, ends[index - 1].y + END_LABEL_SPACING);
  });

  const overflow = ends.length > 0 ? ends[ends.length - 1].y - (plotBottom - 4) : 0;

  for (const end of ends) {
    end.y = Math.max(end.y - Math.max(0, overflow), plotTop + 4);
    marks.push(
      taggedWith(
        text.draw(
          text.fit(end.label, PLOT_STYLE.label, endLabelWidth - END_LABEL_GAP),
          plotRight + END_LABEL_GAP,
          end.y + capHeight(13) / 2,
          {
            ...PLOT_STYLE.label,
            fill: colours.ink,
          },
        ),
        end.candidate,
      ),
    );
  }

  return { marks, textLines };
}

/** A metric along the ordered nodes of a level, one labelled line per candidate. */
export function lineContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const metric = metricOf(block, lookup);

  if (!block.breakdown)
    throw new ChartError("V1", `block "${block.id}": a line chart follows a metric along an ordered level; set breakdown to that level`);

  const nodes = nodesOf(block, inputs.benchmark, lookup, inputs.filterState);

  if (nodes.length < 2) throw new ChartError("V1", `block "${block.id}": a line needs at least two nodes along "${block.breakdown}"`);

  const series = seriesOf(inputs);
  const valueAt = (candidate: string, node: string | undefined) =>
    (lookup.results.values ?? []).find((value) => value.metric === metric.id && value.node === node && value.candidate === candidate);
  const candidates = lookup.results.candidates
    .map((candidate) => candidate.id)
    .filter((candidate) => nodes.some((node) => valueAt(candidate, node)));

  if (candidates.length === 0) throw new ChartError("V1", `block "${block.id}" has no value of "${metric.id}" to show`);

  const values = candidates.flatMap((candidate) =>
    nodes.map((node) => valueAt(candidate, node)).filter((value): value is Value => !!value),
  );
  const decimals = finestDecimals(values.map((value) => valueDecimals(metric, value)));
  const axis = valueAxisOf(
    inputs,
    metric,
    values.flatMap((value) => [value.value, ...(value.ci ?? [])]),
    false,
  );
  const nodeLabel = (node: string | undefined) => lookup.nodeLabel.get(node!) ?? node!;
  const level = lowerFirstLetterOfWord(block.breakdown);
  const plot: LinePlot = {
    xLabels: nodes.map(nodeLabel),
    lines: candidates.map((candidate) => ({
      label: candidateNameOf(lookup, candidate),
      candidate,
      series: series.get(candidate)!,
      points: nodes.map((node) => {
        const value = valueAt(candidate, node);

        return value ? { value: value.value, interval: value.ci } : undefined;
      }),
    })),
    extent: axis.extent,
    logScale: axis.logScale,
    tickText: (value, tickDecimals) => formatNumber(value, tickDecimals),
    valueText: (value) => formatNumber(value, decimals),
    betterUpwards: metric.direction === "higher",
  };
  const howToRead = [
    inputs.compact ? "" : sentence(metric.definition),
    `Each line: the ${statisticWord(metric)} of a candidate at each ${level}, in ${metric.unit}, in the order of the structure and evenly spaced; ${directionWords(metric)}.`,
    intervalSentence(values, "Vertical lines"),
    axis.note,
    caveatSentences(lookup, metric, comparisonsOn(metric, lookup)),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: {
      heightsAt: (width) => ({
        smallest: FIXED_HEIGHT + 160,
        usual: FIXED_HEIGHT + Math.min(Math.max(width * 0.45, 200), 340),
        largest: FIXED_HEIGHT + Math.max(width * 0.75, 340),
      }),
      draw: (text, colours, area) => drawLines(plot, text, colours, area),
    },
    subtitle: `${metric.label}, ${statisticWord(metric)} in ${metric.unit} by ${level} · ${directionWords(metric)}${axis.logScale ? " · log scale" : ""}`,
    howToRead,
    kind: `Line chart of ${lowerFirstLetterOfWord(metric.label)} by ${level}`,
    table: {
      header: [block.breakdown, "Candidate", `${STATISTIC_WORD[metric.statistic]} (${metric.unit})`, "Interval", "n"],
      rows: nodes.flatMap((node) =>
        candidates.flatMap((candidate) => {
          const value = valueAt(candidate, node);

          return value
            ? [
                [
                  nodeLabel(node),
                  candidateNameOf(lookup, candidate),
                  formatNumber(value.value, decimals),
                  value.ci ? `${formatInterval(value.ci, decimals)} (${formatLevel(value.ci_level!)}%)` : "—",
                  String(value.n ?? "—"),
                ],
              ]
            : [];
        }),
      ),
    },
    axisExtent: axis.extent,
  };
}
