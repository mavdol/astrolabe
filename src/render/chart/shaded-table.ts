import type { Value } from "../../schema/benchmark.js";
import type { Colours, Mode } from "../../themes/theme.js";
import { finestDecimals, lowerFirstLetterOfWord, valueDecimals } from "../describe.js";
import { formatInterval, formatNumber } from "../number-format.js";
import { CAP_HEIGHT_RATIO, type SvgTextRenderer } from "../svg-text.js";
import {
  candidateNameOf,
  comparisonsOn,
  directionWords,
  caveatSentences,
  levelsOf,
  sentence,
  statisticWord,
  unionOf,
  withUnit,
  type ChartContent,
  type ChartInputs,
} from "./chart-content.js";
import { candidateOrder, ChartError, metricOf, valueGroupsOf } from "./chart-data.js";
import { linkedName, mixOf, PLOT_STYLE, round, taggedWith, UNDERLINE_OFFSET, widestOf, type DrawnPlot, type PlotArea } from "./plot.js";

interface ShadedCell {
  text: string;
  intervalText?: string;
  /** From 0 for the worst value shown to 1 for the best. */
  share: number;
}

interface ShadedTable {
  columns: string[];
  columnCandidates: string[];
  /** Each part by name, with where the page describes it, and its figure for each candidate. */
  rows: { label: string; link?: string; cells: (ShadedCell | undefined)[] }[];
  worstText: string;
  bestText: string;
  largestShade: number;
}

/**
 * How far the darkest cell goes from the background towards the ink. Past it the ink of the
 * figures would lose its contrast with the cell, and there is no colour to switch to in between.
 */
export const LARGEST_SHADE: Record<Mode, number> = { light: 0.5, dark: 0.4 };

const LEGEND_HEIGHT = 26;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = {
  withIntervals: { smallest: 36, usual: 40, largest: 52 },
  withoutIntervals: { smallest: 26, usual: 30, largest: 40 },
};
const LARGEST_LABEL_SHARE = 0.34;
const CELL_PADDING = 8;
const RAMP_STEPS = 5;
const RAMP_SWATCH = { width: 16, height: 10 };

export const cellFill = (colours: Colours, share: number, largestShade: number) =>
  mixOf(colours.background, colours.ink, share * largestShade);

function drawTable(table: ShadedTable, text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot {
  const marks: string[] = [];
  const textLines: string[] = [];
  const { x, width } = area;
  const capHeight = (size: number) => size * CAP_HEIGHT_RATIO;
  const cells = table.rows.flatMap((row) => row.cells.filter((cell): cell is ShadedCell => !!cell));
  const labelWidth = Math.min(
    widestOf(
      text,
      table.rows.map((row) => row.label),
      PLOT_STYLE.label,
    ),
    width * LARGEST_LABEL_SHARE,
  );
  const columnWidth = (width - labelWidth - CELL_PADDING) / table.columns.length;
  const widestFigure = Math.max(
    widestOf(
      text,
      cells.map((cell) => cell.text),
      PLOT_STYLE.value,
    ),
    widestOf(
      text,
      cells.map((cell) => cell.intervalText ?? ""),
      PLOT_STYLE.note,
    ),
  );

  if (columnWidth < widestFigure + 2 * CELL_PADDING)
    throw new ChartError(
      "V1",
      `${table.columns.length} candidates leave each column too narrow for its figures; show fewer, or use another chart`,
    );

  const rowsTop = area.y + LEGEND_HEIGHT + HEADER_HEIGHT;
  const rowHeight = (area.y + area.height - rowsTop) / table.rows.length;
  const columnLeft = (index: number) => x + labelWidth + CELL_PADDING + index * columnWidth;
  const legendBaseline = area.y + LEGEND_HEIGHT / 2 + capHeight(12) / 2;
  const noteStyle = { ...PLOT_STYLE.note, fill: colours.secondary };
  let legendX = x;

  marks.push(text.draw(table.worstText, legendX, legendBaseline, noteStyle));
  legendX += text.measure(table.worstText, PLOT_STYLE.note) + 6;

  for (let step = 0; step < RAMP_STEPS; step++) {
    marks.push(
      `<rect x="${round(legendX)}" y="${round(area.y + (LEGEND_HEIGHT - RAMP_SWATCH.height) / 2)}" width="${RAMP_SWATCH.width}" height="${RAMP_SWATCH.height}" fill="${cellFill(colours, step / (RAMP_STEPS - 1), table.largestShade)}" stroke="${colours.rule}" stroke-width="0.5"/>`,
    );
    legendX += RAMP_SWATCH.width + 1;
  }

  marks.push(text.draw(`${table.bestText} · darker is better`, legendX + 5, legendBaseline, noteStyle));
  textLines.push(`${table.worstText} … ${table.bestText} · darker is better`);

  table.columns.forEach((column, index) => {
    const fitted = text.fit(column, PLOT_STYLE.heading, columnWidth - 2 * CELL_PADDING);

    marks.push(
      text.draw(fitted, columnLeft(index + 1) - CELL_PADDING, area.y + LEGEND_HEIGHT + HEADER_HEIGHT / 2 + capHeight(13) / 2, {
        ...PLOT_STYLE.heading,
        fill: colours.ink,
        anchor: "end",
      }),
    );
  });

  textLines.push(table.columns.join("  "));
  marks.push(`<path d="M${round(x)} ${round(rowsTop)}H${round(x + width)}" stroke="${colours.ink}" stroke-width="1"/>`);

  table.rows.forEach((row, rowIndex) => {
    const top = rowsTop + rowIndex * rowHeight;

    const label = text.fit(row.label, PLOT_STYLE.label, labelWidth);
    const labelBaseline = top + rowHeight / 2 + capHeight(13) / 2;

    marks.push(
      linkedName(
        text.draw(label, x, labelBaseline, { ...PLOT_STYLE.label, fill: colours.ink }),
        row.link,
        { x, y: labelBaseline + UNDERLINE_OFFSET, width: text.measure(label, PLOT_STYLE.label) },
        colours,
      ),
    );

    row.cells.forEach((cell, index) => {
      const right = columnLeft(index + 1) - CELL_PADDING;

      if (!cell) {
        marks.push(
          text.draw("—", right, top + rowHeight / 2 + capHeight(13) / 2, { ...PLOT_STYLE.value, fill: colours.secondary, anchor: "end" }),
        );

        return;
      }

      const tag = (element: string) => taggedWith(element, table.columnCandidates[index]);

      marks.push(
        tag(
          `<rect x="${round(columnLeft(index) + 1)}" y="${round(top + 1)}" width="${round(columnWidth - 2)}" height="${round(rowHeight - 2)}" fill="${cellFill(colours, cell.share, table.largestShade)}"/>`,
        ),
      );

      const valueBaseline = cell.intervalText ? top + rowHeight * 0.44 + capHeight(13) / 2 : top + rowHeight / 2 + capHeight(13) / 2;

      marks.push(tag(text.draw(cell.text, right, valueBaseline, { ...PLOT_STYLE.value, fill: colours.ink, anchor: "end" })));

      if (cell.intervalText)
        marks.push(
          tag(
            text.draw(cell.intervalText, right, top + rowHeight * 0.76 + capHeight(12) / 2, {
              ...PLOT_STYLE.note,
              tabular: true,
              fill: colours.ink,
              anchor: "end",
            }),
          ),
        );
    });

    textLines.push([row.label, ...row.cells.map((cell) => (cell ? cell.text : "—"))].join("  "));
  });

  return { marks, textLines };
}

/** Candidates across the nodes of a level, the value printed in each cell and shaded from worst to best. */
export function shadedTableContent(inputs: ChartInputs): ChartContent {
  const { block, lookup } = inputs;
  const metric = metricOf(block, lookup);

  if (!block.breakdown)
    throw new ChartError("V1", `block "${block.id}": a shaded table shows candidates across the nodes of a level; set breakdown`);

  const groups = valueGroupsOf(block, inputs.benchmark, lookup, inputs.filterState);
  const values = groups.flatMap((group) => group.values);
  const wholeNode = block.node ?? lookup.results.structure?.nodes.find((node) => node.parent === undefined)?.id;
  const valuesOfTheWhole = (lookup.results.values ?? []).filter((value) => value.metric === metric.id && value.node === wholeNode);
  const columns = candidateOrder(block, metric, lookup, valuesOfTheWhole.length > 0 ? valuesOfTheWhole : groups[0].values).filter(
    (candidate) => values.some((value) => value.candidate === candidate),
  );
  const decimals = finestDecimals(values.map((value) => valueDecimals(metric, value)));
  const extent = unionOf(
    [Math.min(...values.map((value) => value.value)), Math.max(...values.map((value) => value.value))],
    inputs.sharedExtent,
  );
  const shareOf = (value: number) => {
    const share = extent[1] === extent[0] ? 0.5 : (value - extent[0]) / (extent[1] - extent[0]);

    return metric.direction === "higher" ? share : 1 - share;
  };
  const hasIntervals = values.some((value) => value.ci);
  const nodeLabel = (node: string | undefined) => lookup.nodeLabel.get(node!) ?? node!;
  const cellOf = (value: Value | undefined): ShadedCell | undefined =>
    value && {
      text: formatNumber(value.value, decimals),
      intervalText: value.ci ? formatInterval(value.ci, decimals) : undefined,
      share: shareOf(value.value),
    };
  const [worst, best] = metric.direction === "higher" ? extent : [extent[1], extent[0]];
  const table: ShadedTable = {
    columns: columns.map((candidate) => candidateNameOf(lookup, candidate)),
    columnCandidates: columns,
    rows: groups.map((group) => ({
      label: nodeLabel(group.node),
      link: group.node === undefined ? undefined : inputs.partLink?.(group.node),
      cells: columns.map((candidate) => cellOf(group.values.find((value) => value.candidate === candidate))),
    })),
    worstText: withUnit(formatNumber(worst, decimals), metric.unit),
    bestText: withUnit(formatNumber(best, decimals), metric.unit),
    largestShade: LARGEST_SHADE[inputs.mode],
  };
  const heights = hasIntervals ? ROW_HEIGHT.withIntervals : ROW_HEIGHT.withoutIntervals;
  const fixedHeight = LEGEND_HEIGHT + HEADER_HEIGHT;
  const levels = levelsOf(values);
  const level = lowerFirstLetterOfWord(block.breakdown);
  const howToRead = [
    inputs.compact ? "" : sentence(metric.definition),
    `Each cell: the ${statisticWord(metric)} of a candidate on one ${level}, in ${metric.unit}${levels ? `, with its ${levels} confidence interval below` : ""}; ${directionWords(metric)}, and the better the value, the darker the cell.`,
    caveatSentences(lookup, metric, comparisonsOn(metric, lookup)),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plot: {
      heightsAt: () => ({
        smallest: fixedHeight + groups.length * heights.smallest,
        usual: fixedHeight + groups.length * heights.usual,
        largest: fixedHeight + groups.length * heights.largest,
      }),
      draw: (text, colours, area) => drawTable(table, text, colours, area),
    },
    subtitle: `${metric.label}, ${statisticWord(metric)} in ${metric.unit} by ${level} · ${directionWords(metric)}`,
    howToRead,
    kind: `Table of ${lowerFirstLetterOfWord(metric.label)} by ${level} and candidate, shaded from worst to best`,
    table: {
      header: [block.breakdown, ...table.columns],
      rows: table.rows.map((row) => [
        row.label,
        ...row.cells.map((cell) => (cell ? `${cell.text}${cell.intervalText ? ` (${cell.intervalText})` : ""}` : "—")),
      ]),
    },
    axisExtent: extent,
  };
}
