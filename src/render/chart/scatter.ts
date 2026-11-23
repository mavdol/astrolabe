import type { Metric, Value } from "../../schema/benchmark.js";
import type { Colours, SeriesStyle } from "../../themes/astrolabe.js";
import { finestDecimals, lowerFirstLetterOfWord, valueDecimals } from "../describe.js";
import { formatInterval, formatLevel, formatNumber, type Decimals } from "../number-format.js";
import { CAP_HEIGHT_RATIO, type SvgTextRenderer } from "../svg-text.js";
import {
  candidateNameOf,
  comparisonsOn,
  directionWords,
  caveatSentences,
  howToReadOf,
  intervalPart,
  sentence,
  seriesOf,
  statisticWord,
  type ChartContent,
  type ChartInputs,
  type ReadingPart,
} from "./chart-content.js";
import { ChartError, metricOf, nodesOf } from "./chart-data.js";
import {
  arrow,
  intervalAcross,
  intervalUpwards,
  poppingMarker,
  BETTER,
  PLOT_STYLE,
  round,
  taggedWith,
  widestOf,
  type DrawnPlot,
  type PlotArea,
} from "./plot.js";
import { extentAroundData, linearScale } from "./scale.js";

interface ScatterPoint {
  label: string;
  candidate: string;
  series: SeriesStyle;
  x: number;
  y: number;
  xInterval?: [number, number];
  yInterval?: [number, number];
}

interface ScatterPlot {
  points: ScatterPoint[];
  /** The candidates no other beats on both measures, by increasing x. */
  frontier: ScatterPoint[];
  xExtent: [number, number];
  yExtent: [number, number];
  xTitle: string;
  yTitle: string;
  betterOnTheLeft: boolean;
  betterUpwards: boolean;
}

const Y_TITLE_HEIGHT = 24;
const X_AXIS_HEIGHT = 24;
const X_TITLE_HEIGHT = 20;
const FIXED_HEIGHT = Y_TITLE_HEIGHT + X_AXIS_HEIGHT + X_TITLE_HEIGHT;
const LABEL_HEIGHT = 15;
const LABEL_OFFSET = 9;
const CORNER_INSET = 6;
const CORNER_ARROW_LENGTH = 16;
const FRONTIER_SAMPLE_SPACING = 4;
/** Shorter than this, two points a minimum meaningful difference apart would sit on each other. */
const SMALLEST_PLOT_SIDE = 100;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const overlaps = (first: Box, second: Box) =>
  first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

function drawScatter(plot: ScatterPlot, text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot {
  const marks: string[] = [];
  const textLines: string[] = [];
  const tickStyle = { ...PLOT_STYLE.tick, fill: colours.secondary };
  const capHeight = (size: number) => size * CAP_HEIGHT_RATIO;
  const plotTop = area.y + Y_TITLE_HEIGHT;
  const plotBottom = area.y + area.height - X_AXIS_HEIGHT - X_TITLE_HEIGHT;
  const yTargetTicks = plotBottom - plotTop < 200 ? 3 : 5;
  const provisionalY = linearScale(plot.yExtent, [0, 1], yTargetTicks);
  const yTickText = (value: number) => formatNumber(value, provisionalY.tickDecimals);
  const plotLeft = area.x + widestOf(text, provisionalY.ticks.map(yTickText), PLOT_STYLE.tick) + 8;
  const plotRight = area.x + area.width - 4;
  const xScale = linearScale(plot.xExtent, [plotLeft, plotRight], plotRight - plotLeft < 260 ? 3 : 5);
  const yScale = linearScale(plot.yExtent, [plotBottom, plotTop], yTargetTicks);

  const captionStyle = { ...PLOT_STYLE.caption, fill: colours.secondary };
  const yTitle = text.fit(`${plot.betterUpwards ? "↑" : "↓"} ${plot.yTitle}`.toUpperCase(), PLOT_STYLE.caption, area.width);
  const xTitle = text.fit(`${plot.xTitle} ${plot.betterOnTheLeft ? "←" : "→"}`.toUpperCase(), PLOT_STYLE.caption, area.width);

  marks.push(text.draw(yTitle, area.x, area.y + capHeight(12) + 4, captionStyle));
  textLines.push(yTitle);

  for (const tick of yScale.ticks) {
    const tickY = yScale.position(tick);

    marks.push(
      `<path d="M${round(plotLeft)} ${round(tickY)}H${round(plotRight)}" stroke="${tick === yScale.ticks[0] ? colours.ruleStrong : colours.rule}" stroke-width="1"/>`,
    );
    marks.push(text.draw(yTickText(tick), plotLeft - 8, tickY + capHeight(12) / 2, { ...tickStyle, anchor: "end" }));
  }

  for (const tick of xScale.ticks) {
    const tickX = xScale.position(tick);
    const label = formatNumber(tick, xScale.tickDecimals);
    const labelWidth = text.measure(label, PLOT_STYLE.tick);

    marks.push(
      text.draw(
        label,
        Math.min(Math.max(tickX - labelWidth / 2, area.x), area.x + area.width - labelWidth),
        plotBottom + 8 + capHeight(12),
        tickStyle,
      ),
    );
  }

  textLines.push(yScale.ticks.map(yTickText).join("  "));
  textLines.push(xScale.ticks.map((tick) => formatNumber(tick, xScale.tickDecimals)).join("  "));
  marks.push(
    text.draw(
      xTitle,
      Math.max(plotRight, area.x + text.measure(xTitle, PLOT_STYLE.caption)),
      area.y + area.height - X_TITLE_HEIGHT + capHeight(12) + 4,
      {
        ...captionStyle,
        anchor: "end",
      },
    ),
  );
  textLines.push(xTitle);

  const corner: [number, number] = [plot.betterOnTheLeft ? plotLeft : plotRight, plot.betterUpwards ? plotTop : plotBottom];
  const inwards: [number, number] = [plot.betterOnTheLeft ? 1 : -1, plot.betterUpwards ? 1 : -1];
  const tip: [number, number] = [corner[0] + inwards[0] * CORNER_INSET, corner[1] + inwards[1] * CORNER_INSET];
  const tail: [number, number] = [tip[0] + inwards[0] * CORNER_ARROW_LENGTH, tip[1] + inwards[1] * CORNER_ARROW_LENGTH];
  const wordBaseline = tail[1] + (inwards[1] > 0 ? capHeight(12) : 0);

  marks.push(arrow(tail, tip, colours.secondary));
  marks.push(
    text.draw(BETTER, tail[0] + inwards[0] * 4, wordBaseline, {
      ...captionStyle,
      anchor: plot.betterOnTheLeft ? "start" : "end",
      halo: colours.background,
    }),
  );
  textLines.push(BETTER);

  if (plot.frontier.length >= 2) {
    const path = plot.frontier.map(
      (point, index) => `${index === 0 ? "M" : "L"}${round(xScale.position(point.x))} ${round(yScale.position(point.y))}`,
    );

    marks.push(
      `<path d="${path.join("")}" stroke="${colours.secondary}" stroke-width="1.25" stroke-dasharray="4 3" fill="none" data-draw=""/>`,
    );
  }

  const positioned = plot.points.map((point) => ({ point, px: xScale.position(point.x), py: yScale.position(point.y) }));

  for (const { point, px, py } of positioned) {
    if (point.xInterval)
      marks.push(
        taggedWith(
          intervalAcross(xScale.position(point.xInterval[0]), xScale.position(point.xInterval[1]), py, point.series.colour, 1.5),
          point.candidate,
        ),
      );

    if (point.yInterval)
      marks.push(
        taggedWith(
          intervalUpwards(yScale.position(point.yInterval[0]), yScale.position(point.yInterval[1]), px, point.series.colour, 1.5),
          point.candidate,
        ),
      );
  }

  for (const { point, px, py } of positioned)
    marks.push(taggedWith(poppingMarker(point.series.shape, px, py, point.series.colour, colours.background), point.candidate));

  const taken: Box[] = positioned.map(({ px, py }) => ({ left: px - 6, right: px + 6, top: py - 6, bottom: py + 6 }));

  plot.frontier.slice(1).forEach((point, index) => {
    const [fromX, fromY] = [xScale.position(plot.frontier[index].x), yScale.position(plot.frontier[index].y)];
    const [toX, toY] = [xScale.position(point.x), yScale.position(point.y)];
    const steps = Math.ceil(Math.hypot(toX - fromX, toY - fromY) / FRONTIER_SAMPLE_SPACING);

    for (let step = 1; step < steps; step++) {
      const [sampleX, sampleY] = [fromX + ((toX - fromX) * step) / steps, fromY + ((toY - fromY) * step) / steps];

      taken.push({ left: sampleX - 1, right: sampleX + 1, top: sampleY - 1, bottom: sampleY + 1 });
    }
  });

  for (const { point, px, py } of [...positioned].sort((first, second) => first.py - second.py)) {
    const labelWidth = text.measure(point.label, PLOT_STYLE.label);
    const placements = [
      [px + LABEL_OFFSET, py],
      [px - LABEL_OFFSET - labelWidth, py],
      [px + LABEL_OFFSET, py + LABEL_HEIGHT],
      [px + LABEL_OFFSET, py - LABEL_HEIGHT],
      [px - LABEL_OFFSET - labelWidth, py + LABEL_HEIGHT],
      [px - LABEL_OFFSET - labelWidth, py - LABEL_HEIGHT],
    ].map(([left, centreY]) => ({ left, right: left + labelWidth, top: centreY - LABEL_HEIGHT / 2, bottom: centreY + LABEL_HEIGHT / 2 }));
    const fits = (box: Box) => box.left >= area.x && box.right <= area.x + area.width && box.top >= plotTop && box.bottom <= plotBottom;
    const chosen =
      placements.find((box) => fits(box) && !taken.some((other) => overlaps(box, other))) ?? placements.find(fits) ?? placements[0];

    taken.push(chosen);
    marks.push(
      taggedWith(
        text.draw(point.label, chosen.left, (chosen.top + chosen.bottom) / 2 + capHeight(PLOT_STYLE.label.size) / 2, {
          ...PLOT_STYLE.label,
          fill: colours.ink,
          halo: colours.background,
        }),
        point.candidate,
      ),
    );
    textLines.push(point.label);
  }

  return { marks, textLines };
}

const isBetter = (metric: Metric, first: number, second: number) => (metric.direction === "lower" ? first < second : first > second);

/** Two measures in tension, one mark per candidate, the candidates no other beats on both joined by a line. */
export function scatterContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const [xMetric, yMetric] = [metricOf(block, lookup, "x"), metricOf(block, lookup, "y")];

  if (block.breakdown) throw new ChartError("V1", `block "${block.id}": a scatter chart shows one node; remove breakdown`);

  if (block.scale?.type === "log")
    throw new ChartError("V9", `block "${block.id}": a scatter chart has two axes and scale names neither, so it cannot be on a log scale`);

  const node = nodesOf(block, inputs.benchmark, lookup, inputs.filterState)[0];
  const series = seriesOf(inputs);
  const valueOf = (metric: Metric, candidate: string): Value => {
    const value = (lookup.results.values ?? []).find(
      (entry) => entry.metric === metric.id && entry.node === node && entry.candidate === candidate,
    );

    if (!value) throw new ChartError("V1", `block "${block.id}": "${candidate}" has no value of "${metric.id}", so it cannot be placed`);

    return value;
  };
  const candidates = lookup.results.candidates.map((candidate) => candidate.id);
  const pairs = candidates.map((candidate) => ({ candidate, x: valueOf(xMetric, candidate), y: valueOf(yMetric, candidate) }));
  const points: ScatterPoint[] = pairs.map(({ candidate, x, y }) => ({
    label: candidateNameOf(lookup, candidate),
    candidate,
    series: series.get(candidate)!,
    x: x.value,
    y: y.value,
    xInterval: x.ci,
    yInterval: y.ci,
  }));
  const atLeastAsGood = (metric: Metric, first: number, second: number) => first === second || isBetter(metric, first, second);
  const isBeaten = (point: ScatterPoint) =>
    points.some(
      (other) =>
        other !== point &&
        atLeastAsGood(xMetric, other.x, point.x) &&
        atLeastAsGood(yMetric, other.y, point.y) &&
        (isBetter(xMetric, other.x, point.x) || isBetter(yMetric, other.y, point.y)),
    );
  const frontier = points.filter((point) => !isBeaten(point)).sort((first, second) => first.x - second.x);
  // Dots, not bars: the axes fit the values unless the author asks for zero, so that close candidates can be told apart.
  const startsAtZero = block.scale?.zero === true;
  const extentOf = (metric: Metric, values: Value[]): [number, number] => {
    const plotted = values.flatMap((value) => [value.value, ...(value.ci ?? [])]);
    const [low, high] = [Math.min(...plotted), Math.max(...plotted)];
    const largest = Math.max(...plotted.map(Math.abs));
    const meaningful = metric.compare_as === "relative" ? (metric.minimum_meaningful / 100) * largest : metric.minimum_meaningful;

    return startsAtZero ? [Math.min(0, low), Math.max(0, high)] : extentAroundData([low, high], meaningful);
  };
  const xValues = pairs.map((pair) => pair.x);
  const yValues = pairs.map((pair) => pair.y);
  const xDecimals = finestDecimals(xValues.map((value) => valueDecimals(xMetric, value)));
  const yDecimals = finestDecimals(yValues.map((value) => valueDecimals(yMetric, value)));
  const titleOf = (metric: Metric) => `${metric.label}, ${statisticWord(metric)} in ${metric.unit} · ${directionWords(metric)}`;
  const towards = (metric: Metric) => `${metric.direction === "lower" ? "lower" : "higher"} ${lowerFirstLetterOfWord(metric.label)}`;
  const howToReadParts: ReadingPart[] = [
    { text: inputs.compact ? "" : `${sentence(xMetric.definition)} ${sentence(yMetric.definition)}` },
    {
      mark: "dot",
      markName: "Each mark",
      text: `a candidate, placed by its ${lowerFirstLetterOfWord(xMetric.label)} across and its ${lowerFirstLetterOfWord(yMetric.label)} up.`,
    },
    intervalPart([...xValues, ...yValues]),
    frontier.length >= 2
      ? { mark: "frontier", markName: "Dashed line", text: "the candidates that no other candidate beats on both measures." }
      : { text: "" },
    { text: `The marked corner is better: ${towards(xMetric)} and ${towards(yMetric)}.` },
    {
      text: startsAtZero
        ? ""
        : `The axes do not start at zero: ${block.scale?.reason ? sentence(block.scale.reason) : "they are fitted to the values, so that the candidates can be told apart."}`,
    },
    { text: caveatSentences(lookup, xMetric, comparisonsOn(xMetric, lookup)) },
    // Both axes often carry the same caveat (failures left out on each): it is said once.
    {
      text:
        caveatSentences(lookup, yMetric, comparisonsOn(yMetric, lookup)) ===
        caveatSentences(lookup, xMetric, comparisonsOn(xMetric, lookup))
          ? ""
          : caveatSentences(lookup, yMetric, comparisonsOn(yMetric, lookup)),
    },
  ];
  const howToRead = howToReadOf(howToReadParts);
  const fixedHeight = FIXED_HEIGHT;
  const plot: ScatterPlot = {
    points,
    frontier,
    xExtent: extentOf(xMetric, xValues),
    yExtent: extentOf(yMetric, yValues),
    xTitle: titleOf(xMetric),
    yTitle: titleOf(yMetric),
    betterOnTheLeft: xMetric.direction === "lower",
    betterUpwards: yMetric.direction === "higher",
  };
  const cell = (value: Value, decimals: Decimals | null) => [
    `${formatNumber(value.value, decimals)}${value.source === "declared" ? " (declared)" : ""}`,
    value.ci && value.source !== "declared" ? `${formatInterval(value.ci, decimals)} (${formatLevel(value.ci_level!)}%)` : "—",
  ];

  return {
    plot: {
      heightsAt: (width) => ({
        smallest: fixedHeight + SMALLEST_PLOT_SIDE,
        usual: fixedHeight + Math.min(Math.max(width * 0.55, 220), 420),
        largest: fixedHeight + Math.max(width * 0.9, 420),
      }),
      draw: (text, colours, area) => drawScatter(plot, text, colours, area),
    },
    subtitle: `${yMetric.label} against ${lowerFirstLetterOfWord(xMetric.label)}, one mark per candidate`,
    howToRead,
    howToReadParts,
    kind: `Scatter chart of ${lowerFirstLetterOfWord(yMetric.label)} against ${lowerFirstLetterOfWord(xMetric.label)}`,
    table: {
      header: [
        "Candidate",
        `${xMetric.label} (${xMetric.unit})`,
        "Interval",
        `${yMetric.label} (${yMetric.unit})`,
        "Interval",
        "Beaten on both",
      ],
      rows: pairs.map((pair, index) => [
        candidateNameOf(lookup, pair.candidate),
        ...cell(pair.x, xDecimals),
        ...cell(pair.y, yDecimals),
        isBeaten(points[index]) ? "yes" : "no",
      ]),
    },
  };
}
