import type { Comparison, Value } from "../../schema/benchmark.js";
import { THEME, type Colours } from "../../themes/astrolabe.js";
import { effectAndInterval, effectAsFactor, finestDecimals, lowerFirstLetterOfWord, valueDecimals, verdictLabel } from "../describe.js";
import { formatInterval, formatNumber } from "../number-format.js";
import { CAP_HEIGHT_RATIO, type SvgTextRenderer } from "../svg-text.js";
import { candidateNameOf, directionWords, levelsOf, seriesOf, withUnit, type ChartContent, type ChartInputs } from "./chart-content.js";
import { ChartError } from "./chart-data.js";
import { INTERVAL_STROKE, intervalAcross, PLOT_STYLE, round, widestOf, type DrawnPlot, type Plot, type PlotArea } from "./plot.js";

/** Beyond this many rows a table reads better. */
const LARGEST_ROW_COUNT = 10;
const HEADER_HEIGHT = 22;
const GAP_BETWEEN_ROWS = 14;
const LINE_HEIGHT = { smallest: 20, usual: 24, largest: 30 };
const COLUMN_GAP = 12;
const LARGEST_LABEL_SHARE = 0.3;
const BAR_SHARE_OF_LINE = 0.6;

interface Side {
  label: string;
  value: number;
  interval?: [number, number];
  valueText: string;
  intervalText?: string;
  colour: string;
}

interface ComparisonRow {
  title: string;
  direction: string;
  sides: [Side, Side];
  effectText: string;
  detailText: string;
}

function drawComparisonRows(rows: ComparisonRow[], text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot {
  const { x, width } = area;
  const lineHeight = (area.height - rows.length * HEADER_HEIGHT - (rows.length - 1) * GAP_BETWEEN_ROWS) / (2 * rows.length);
  const sides = rows.flatMap((row) => row.sides);
  const labelWidth = Math.min(
    widestOf(
      text,
      sides.map((side) => side.label),
      PLOT_STYLE.label,
    ),
    width * LARGEST_LABEL_SHARE,
  );
  const valueWidth = widestOf(
    text,
    sides.map((side) => side.valueText),
    PLOT_STYLE.value,
  );
  const effectWidth = Math.max(
    widestOf(
      text,
      rows.map((row) => row.effectText),
      PLOT_STYLE.value,
    ),
    widestOf(
      text,
      rows.map((row) => row.detailText),
      PLOT_STYLE.note,
    ),
  );
  const barLeft = x + labelWidth + COLUMN_GAP;
  const valueRight = x + width - effectWidth - 2 * COLUMN_GAP;
  const barRight = valueRight - valueWidth - COLUMN_GAP;
  const marks: string[] = [];
  const textLines: string[] = [];
  const baselineIn = (top: number, height: number, size: number) => top + height / 2 + (size * CAP_HEIGHT_RATIO) / 2;
  let top = area.y;

  if (barRight - barLeft < 40) throw new ChartError("V1", "the names and figures of these comparisons leave no room for their bars");

  for (const row of rows) {
    const titleWidth = text.measure(row.title, PLOT_STYLE.heading);

    marks.push(
      text.draw(row.title, x, baselineIn(top, HEADER_HEIGHT, PLOT_STYLE.heading.size), { ...PLOT_STYLE.heading, fill: colours.ink }),
    );
    marks.push(
      text.draw(row.direction, x + titleWidth + 8, baselineIn(top, HEADER_HEIGHT, PLOT_STYLE.note.size), {
        ...PLOT_STYLE.note,
        fill: colours.secondary,
      }),
    );
    textLines.push(`${row.title}  ${row.direction}`);

    const largest = Math.max(...row.sides.flatMap((side) => [side.value, ...(side.interval ?? [])]));
    const position = (value: number) => barLeft + (largest > 0 ? value / largest : 0) * (barRight - barLeft);
    const linesTop = top + HEADER_HEIGHT;

    row.sides.forEach((side, index) => {
      const lineTop = linesTop + index * lineHeight;
      const centreY = lineTop + lineHeight / 2;
      const barHeight = lineHeight * BAR_SHARE_OF_LINE;

      marks.push(
        text.draw(text.fit(side.label, PLOT_STYLE.label, labelWidth), x, baselineIn(lineTop, lineHeight, PLOT_STYLE.label.size), {
          ...PLOT_STYLE.label,
          fill: colours.ink,
        }),
      );
      marks.push(
        `<rect x="${round(barLeft)}" y="${round(centreY - barHeight / 2)}" width="${round(position(side.value) - barLeft)}" height="${round(barHeight)}" fill="${side.colour}"/>`,
      );

      if (side.interval) {
        const [from, to] = side.interval.map(position);

        marks.push(intervalAcross(from, to, centreY, colours.background, INTERVAL_STROKE + 2.5));
        marks.push(intervalAcross(from, to, centreY, colours.ink, INTERVAL_STROKE));
      }

      marks.push(
        text.draw(side.valueText, valueRight, baselineIn(lineTop, lineHeight, PLOT_STYLE.value.size), {
          ...PLOT_STYLE.value,
          fill: colours.ink,
          anchor: "end",
        }),
      );
      textLines.push(`${side.label}  ${side.valueText}`);
    });

    marks.push(
      text.draw(row.effectText, x + width, baselineIn(linesTop, lineHeight, PLOT_STYLE.value.size), {
        ...PLOT_STYLE.value,
        fill: colours.ink,
        anchor: "end",
      }),
    );
    marks.push(
      text.draw(row.detailText, x + width, baselineIn(linesTop + lineHeight, lineHeight, PLOT_STYLE.note.size), {
        ...PLOT_STYLE.note,
        fill: colours.secondary,
        anchor: "end",
      }),
    );
    textLines.push(row.effectText, row.detailText);
    top = linesTop + 2 * lineHeight + GAP_BETWEEN_ROWS;
  }

  return { marks, textLines };
}

function measuresInWords(labels: string[]): string {
  const distinct = [...new Set(labels)].map((label, index) => (index === 0 ? label : lowerFirstLetterOfWord(label)));

  return distinct.length === 1 ? distinct[0] : `${distinct.slice(0, -1).join(", ")} and ${distinct[distinct.length - 1]}`;
}

const SHOWS_THE_WORD_INSTEAD_OF_A_FIGURE = new Set(["equivalent", "inconclusive"]);

/** Several metrics, each compared once with the baseline: one row per comparison, on its own scale. */
export function comparisonRowsContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const ids = block.comparisons;

  if (!ids) throw new ChartError("V54", `block "${block.id}": a comparison-rows chart lists its comparisons in "comparisons"`);

  if (ids.length > LARGEST_ROW_COUNT)
    throw new ChartError("V54", `block "${block.id}": beyond ${LARGEST_ROW_COUNT} comparisons, show them in a table`);

  const comparisonById = new Map((lookup.results.comparisons ?? []).map((comparison) => [comparison.id, comparison]));
  const series = seriesOf(inputs);
  const { ink, series: greys } = THEME[inputs.mode];
  const baselineColour = greys[greys.length - 1];
  const colourOf = (candidate: string) => {
    const colour = series.get(candidate)!.colour;

    return colour === baselineColour ? ink : colour;
  };
  const valueAt = (comparison: Comparison, candidate: string): Value => {
    const value = (lookup.results.values ?? []).find(
      (entry) => entry.metric === comparison.metric && entry.node === comparison.node && entry.candidate === candidate,
    );

    if (!value) throw new ChartError("V54", `block "${block.id}": "${comparison.id}" has no value of "${candidate}" to draw`);

    if (value.value < 0)
      throw new ChartError(
        "V54",
        `block "${block.id}": the bars of "${comparison.id}" start at zero, so they cannot show a negative value`,
      );

    return value;
  };
  const comparisons = ids.map((id) => {
    const comparison = comparisonById.get(id);

    if (!comparison) throw new ChartError("V54", `block "${block.id}": "${id}" is not the id of a comparison`);

    if (block.effect_format === "times" && lookup.metricById.get(comparison.metric)!.compare_as !== "relative")
      throw new ChartError(
        "V55",
        `block "${block.id}": "${id}" is compared as a difference, and a factor only exists for comparisons in relative terms`,
      );

    return comparison;
  });
  const rows: ComparisonRow[] = comparisons.map((comparison) => {
    const metric = lookup.metricById.get(comparison.metric)!;
    const [baselineValue, candidateValue] = [valueAt(comparison, comparison.vs), valueAt(comparison, comparison.candidate)];
    const decimals = finestDecimals([valueDecimals(metric, baselineValue), valueDecimals(metric, candidateValue)]);
    const percent = effectAndInterval(metric, comparison);
    const asFactor = block.effect_format === "times" ? effectAsFactor(metric, comparison) : undefined;
    const verdict = verdictLabel(comparison);
    const showsWord = SHOWS_THE_WORD_INSTEAD_OF_A_FIGURE.has(comparison.verdict);
    const percentInterval = percent.interval ? `${percent.interval} (${percent.level})` : "no interval";
    const side = (value: Value, candidate: string, colour: string): Side => ({
      label: candidateNameOf(lookup, candidate),
      value: value.value,
      interval: value.ci,
      valueText: withUnit(formatNumber(value.value, decimals), metric.unit),
      intervalText: value.ci ? formatInterval(value.ci, decimals) : undefined,
      colour,
    });

    return {
      title: metric.label,
      direction: directionWords(metric),
      sides: [
        side(baselineValue, comparison.vs, baselineColour),
        side(candidateValue, comparison.candidate, colourOf(comparison.candidate)),
      ],
      effectText: showsWord ? verdict : (asFactor?.factor ?? percent.effect),
      detailText: showsWord ? `${percent.effect}, ${percentInterval}` : `${asFactor?.interval ?? percentInterval}, ${verdict}`,
    };
  });
  const levels = levelsOf(comparisons);
  const pairs = [...new Set(comparisons.map((comparison) => `${comparison.candidate} ${comparison.vs}`))];
  const [onlyCandidate, onlyBaseline] = pairs.length === 1 ? pairs[0].split(" ") : [undefined, undefined];
  const primaryComparisons = lookup.results.computed!.primary_comparisons;
  const everyComparisonAdjusted = comparisons.every((comparison) => comparison.adjusted);
  const howToRead = [
    `Each row: one comparison on its own scale, both bars from zero${onlyBaseline ? `, ${candidateNameOf(lookup, onlyBaseline)} above and ${candidateNameOf(lookup, onlyCandidate!)} below` : ", the baseline above"}.`,
    levels
      ? `Lines: ${levels} confidence intervals of the values; the interval of each change is printed under it${everyComparisonAdjusted && primaryComparisons > 1 ? `, adjusted for ${primaryComparisons} primary comparisons` : ""}.`
      : "",
    block.effect_format === "times" ? "Factors: the larger value over the smaller." : "",
    "A change too small to matter, or too uncertain, is shown by its verdict instead of a figure.",
    comparisons.some((comparison) => comparison.role === "exploratory")
      ? "Exploratory comparisons were not declared before measuring: none is a claim of the benchmark."
      : "",
    comparisons.some((comparison) => comparison.failure_warning) ? "Warning: the candidates did not fail equally often." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: {
      heightsAt: (_width, _text) => ({
        smallest: rows.length * (HEADER_HEIGHT + 2 * LINE_HEIGHT.smallest) + (rows.length - 1) * GAP_BETWEEN_ROWS,
        usual: rows.length * (HEADER_HEIGHT + 2 * LINE_HEIGHT.usual) + (rows.length - 1) * GAP_BETWEEN_ROWS,
        largest: rows.length * (HEADER_HEIGHT + 2 * LINE_HEIGHT.largest) + (rows.length - 1) * GAP_BETWEEN_ROWS,
      }),
      draw: (text, palette, area) => drawComparisonRows(rows, text, palette, area),
    },
    subtitle: `${measuresInWords(comparisons.map((comparison) => lookup.metricById.get(comparison.metric)!.label))}, each on its own scale${
      onlyCandidate ? "" : ", each candidate against the baseline"
    }`,
    howToRead,
    kind: "Comparison rows, one per measure, each on its own scale",
    table: {
      header: ["Measure", "Baseline", "Candidate", "Change", "Interval of the change", "Verdict"],
      rows: comparisons.map((comparison, index) => {
        const metric = lookup.metricById.get(comparison.metric)!;
        const [baseline, candidate] = rows[index].sides;
        const percent = effectAndInterval(metric, comparison);
        const asFactor = block.effect_format === "times" ? effectAsFactor(metric, comparison) : undefined;
        const interval = asFactor?.interval ?? (percent.interval ? `${percent.interval} (${percent.level})` : "—");
        const withIntervalOf = (entry: Side) => `${entry.label}: ${entry.valueText}${entry.intervalText ? ` (${entry.intervalText})` : ""}`;

        return [
          metric.label,
          withIntervalOf(baseline),
          withIntervalOf(candidate),
          asFactor?.factor ?? percent.effect,
          interval,
          verdictLabel(comparison),
        ];
      }),
    },
  };
}
