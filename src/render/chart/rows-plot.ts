import type { Colours, MarkerShape, SeriesStyle } from "../../themes/astrolabe.js";
import type { Decimals } from "../number-format.js";
import { CAP_HEIGHT_RATIO, type SvgTextRenderer } from "../svg-text.js";
import { linearScale } from "./scale.js";

export interface PlotRow {
  label: string;
  series: SeriesStyle;
  value: number;
  interval?: [number, number];
  /** The value as the reader sees it, right of the plot: digits line up down the column. */
  valueText: string;
  /** A word that qualifies the value: a verdict, "declared". */
  note?: string;
}

export interface PlotGroup {
  heading?: string;
  rows: PlotRow[];
}

/** A chart of horizontal rows on one shared scale: a dot or a bar per row, its interval, its value in digits. */
export interface RowsPlot {
  groups: PlotGroup[];
  mark: "dot" | "bar";
  /** The values the axis must enclose. A bar plot always encloses zero. */
  extent: [number, number];
  tickText: (value: number, decimals: Decimals) => string;
  /** A zone drawn behind the marks, such as the differences too small to matter. */
  band?: [number, number];
  /** A reference line at zero, for effects. */
  zeroLine?: boolean;
  /** The side of the axis where results are better. */
  betterSide: "left" | "right";
}

export const PLOT_STYLE = {
  heading: { weight: 600, size: 13 },
  label: { weight: 500, size: 13 },
  value: { weight: 600, size: 13, tabular: true },
  note: { weight: 400, size: 12 },
  tick: { weight: 400, size: 12, tabular: true },
} as const;

export const ROW_HEIGHT = { smallest: 22, usual: 30, largest: 44 };

const HEADING_ROWS = 0.9;
const GAP_BETWEEN_GROUPS_ROWS = 0.5;
const DIRECTION_LINE_HEIGHT = 20;
const AXIS_HEIGHT = 24;
const COLUMN_GAP = 12;
const LARGEST_LABEL_SHARE = 0.34;
const MARKER_RADIUS = 5;
const INTERVAL_STROKE = 2;
const INTERVAL_CAP = 8;
const BAR_SHARE_OF_ROW = 0.56;
const ARROW_LENGTH = 10;
const ARROW_GAP = 5;

const round = (value: number) => String(Math.round(value * 10) / 10);

/** The height of a plot in rows, so a caller with a fixed canvas can choose the height of one row. */
export function rowUnitsOf(plot: RowsPlot): number {
  return plot.groups.reduce(
    (units, group, index) => units + group.rows.length + (group.heading ? HEADING_ROWS : 0) + (index > 0 ? GAP_BETWEEN_GROUPS_ROWS : 0),
    0,
  );
}

export const PLOT_FIXED_HEIGHT = DIRECTION_LINE_HEIGHT + AXIS_HEIGHT;

function marker(shape: MarkerShape, x: number, y: number, colour: string, halo: string): string {
  const r = MARKER_RADIUS;
  const outline = `fill="${colour}" stroke="${halo}" stroke-width="1.5"`;

  switch (shape) {
    case "circle":
      return `<circle cx="${round(x)}" cy="${round(y)}" r="${r}" ${outline}/>`;
    case "square":
      return `<rect x="${round(x - r + 0.5)}" y="${round(y - r + 0.5)}" width="${2 * r - 1}" height="${2 * r - 1}" ${outline}/>`;
    case "diamond":
      return `<path d="M${round(x)} ${round(y - r - 1)}L${round(x + r + 1)} ${round(y)}L${round(x)} ${round(y + r + 1)}L${round(x - r - 1)} ${round(y)}Z" ${outline}/>`;
    case "triangle":
      return `<path d="M${round(x)} ${round(y - r - 1)}L${round(x + r + 1)} ${round(y + r)}L${round(x - r - 1)} ${round(y + r)}Z" ${outline}/>`;
  }
}

function intervalLine(from: number, to: number, y: number, colour: string, width: number): string {
  const cap = INTERVAL_CAP / 2;
  const path = `M${round(from)} ${round(y)}H${round(to)}M${round(from)} ${round(y - cap)}V${round(y + cap)}M${round(to)} ${round(y - cap)}V${round(y + cap)}`;

  return `<path d="${path}" stroke="${colour}" stroke-width="${width}" fill="none"/>`;
}

/** An arrow starting at x and pointing right, or left. */
function arrow(x: number, centreY: number, pointsRight: boolean, colour: string): string {
  const sign = pointsRight ? 1 : -1;
  const tip = x + sign * ARROW_LENGTH;
  const head = tip - sign * 3.5;

  return `<path d="M${round(x)} ${round(centreY)}H${round(tip)}M${round(head)} ${round(centreY - 3.5)}L${round(tip)} ${round(centreY)}L${round(head)} ${round(centreY + 3.5)}" stroke="${colour}" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Where the rows of each group start and end: a heading has the full width, so no line crosses it. */
function rowSpansOf(plot: RowsPlot, rowsTop: number, rowHeight: number): [number, number][] {
  let cursorY = rowsTop;

  return plot.groups.map((group, index) => {
    const top = cursorY + ((index > 0 ? GAP_BETWEEN_GROUPS_ROWS : 0) + (group.heading ? HEADING_ROWS : 0)) * rowHeight;

    cursorY = top + group.rows.length * rowHeight;

    return [top, cursorY];
  });
}

export interface DrawnPlot {
  marks: string[];
  textLines: string[];
  height: number;
}

/** Draws the plot with its top-left corner at (x, y). Every row is rowHeight tall. */
export function drawRowsPlot(
  plot: RowsPlot,
  text: SvgTextRenderer,
  colours: Colours,
  x: number,
  y: number,
  width: number,
  rowHeight: number,
): DrawnPlot {
  const rows = plot.groups.flatMap((group) => group.rows);
  const widest = (texts: string[], style: Parameters<SvgTextRenderer["measure"]>[1]) =>
    Math.max(0, ...texts.map((entry) => text.measure(entry, style)));
  const labelWidth = Math.min(
    widest(
      rows.map((row) => row.label),
      PLOT_STYLE.label,
    ),
    width * LARGEST_LABEL_SHARE,
  );
  const valueWidth = widest(
    rows.map((row) => row.valueText),
    PLOT_STYLE.value,
  );
  const noteWidth = widest(
    rows.map((row) => row.note ?? ""),
    PLOT_STYLE.note,
  );
  const plotLeft = x + labelWidth + COLUMN_GAP;
  const plotRight = x + width - valueWidth - COLUMN_GAP - (noteWidth > 0 ? noteWidth + 8 : 0);
  const scaleExtent: [number, number] = plot.mark === "bar" ? [Math.min(0, plot.extent[0]), Math.max(0, plot.extent[1])] : plot.extent;
  const targetTicks = plotRight - plotLeft < 260 ? 3 : 5;
  const scale = linearScale(scaleExtent, [plotLeft, plotRight], targetTicks);
  const marks: string[] = [];
  const textLines: string[] = [];
  const rowsTop = y + DIRECTION_LINE_HEIGHT;
  const rowsBottom = rowsTop + rowUnitsOf(plot) * rowHeight;
  const baselineIn = (top: number, height: number, size: number) => top + height / 2 + (size * CAP_HEIGHT_RATIO) / 2;
  const rowSpans = rowSpansOf(plot, rowsTop, rowHeight);
  const verticalLines = (lineX: number) => rowSpans.map(([top, bottom]) => `M${round(lineX)} ${round(top)}V${round(bottom)}`).join("");

  const directionBaseline = y + PLOT_STYLE.tick.size * CAP_HEIGHT_RATIO + 2;
  const arrowCentreY = directionBaseline - (PLOT_STYLE.tick.size * CAP_HEIGHT_RATIO) / 2;
  const wordWidth = text.measure("better", PLOT_STYLE.tick);
  const pointsRight = plot.betterSide === "right";
  const wordX = pointsRight ? plotRight - ARROW_LENGTH - ARROW_GAP - wordWidth : plotLeft + ARROW_LENGTH + ARROW_GAP;

  marks.push(text.draw("better", wordX, directionBaseline, { ...PLOT_STYLE.tick, fill: colours.secondary }));
  marks.push(arrow(pointsRight ? plotRight - ARROW_LENGTH : plotLeft + ARROW_LENGTH, arrowCentreY, pointsRight, colours.secondary));
  textLines.push(pointsRight ? "better →" : "← better");

  if (plot.band) {
    const [from, to] = plot.band.map((value) => Math.min(Math.max(scale.position(value), plotLeft), plotRight));

    for (const [top, bottom] of rowSpans)
      marks.push(
        `<rect x="${round(from)}" y="${round(top)}" width="${round(to - from)}" height="${round(bottom - top)}" fill="${colours.band}"/>`,
      );
  }

  for (const tick of scale.ticks) {
    const tickX = scale.position(tick);
    const isZeroReference = plot.zeroLine === true && tick === 0;
    const isAxisOrigin = plot.mark === "bar" && tick === 0;
    const label = plot.tickText(tick, scale.tickDecimals);
    const labelWidthHere = text.measure(label, PLOT_STYLE.tick);
    const labelX = Math.min(Math.max(tickX - labelWidthHere / 2, x), x + width - labelWidthHere);

    marks.push(
      `<path d="${verticalLines(tickX)}" stroke="${isZeroReference || isAxisOrigin ? colours.ink : colours.rule}" stroke-width="1"/>`,
    );
    marks.push(
      text.draw(label, labelX, rowsBottom + 8 + PLOT_STYLE.tick.size * CAP_HEIGHT_RATIO, { ...PLOT_STYLE.tick, fill: colours.secondary }),
    );
  }

  textLines.push(scale.ticks.map((tick) => plot.tickText(tick, scale.tickDecimals)).join("  "));

  let cursorY = rowsTop;

  plot.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) cursorY += GAP_BETWEEN_GROUPS_ROWS * rowHeight;

    if (group.heading) {
      const headingHeight = HEADING_ROWS * rowHeight;

      marks.push(
        text.draw(text.fit(group.heading, PLOT_STYLE.heading, width), x, baselineIn(cursorY, headingHeight, PLOT_STYLE.heading.size), {
          ...PLOT_STYLE.heading,
          fill: colours.ink,
        }),
      );
      textLines.push(group.heading);
      cursorY += headingHeight;
    }

    for (const row of group.rows) {
      const centreY = cursorY + rowHeight / 2;
      const valueX = scale.position(row.value);
      const label = text.fit(row.label, PLOT_STYLE.label, labelWidth);

      marks.push(text.draw(label, x, baselineIn(cursorY, rowHeight, PLOT_STYLE.label.size), { ...PLOT_STYLE.label, fill: colours.ink }));

      if (plot.mark === "bar") {
        const zeroX = scale.position(0);
        const barHeight = rowHeight * BAR_SHARE_OF_ROW;

        marks.push(
          `<rect x="${round(Math.min(zeroX, valueX))}" y="${round(centreY - barHeight / 2)}" width="${round(Math.abs(valueX - zeroX))}" height="${round(barHeight)}" fill="${row.series.colour}"/>`,
        );

        if (row.interval) {
          const [from, to] = row.interval.map(scale.position);

          marks.push(intervalLine(from, to, centreY, colours.background, INTERVAL_STROKE + 2.5));
          marks.push(intervalLine(from, to, centreY, colours.ink, INTERVAL_STROKE));
        }
      } else {
        if (row.interval) {
          const [from, to] = row.interval.map(scale.position);

          marks.push(intervalLine(from, to, centreY, row.series.colour, INTERVAL_STROKE));
        }

        marks.push(marker(row.series.shape, valueX, centreY, row.series.colour, colours.background));
      }

      const valueRight = x + width - (noteWidth > 0 ? noteWidth + 8 : 0);

      marks.push(
        text.draw(row.valueText, valueRight, baselineIn(cursorY, rowHeight, PLOT_STYLE.value.size), {
          ...PLOT_STYLE.value,
          fill: colours.ink,
          anchor: "end",
        }),
      );

      if (row.note)
        marks.push(
          text.draw(row.note, x + width - noteWidth, baselineIn(cursorY, rowHeight, PLOT_STYLE.note.size), {
            ...PLOT_STYLE.note,
            fill: colours.secondary,
          }),
        );

      textLines.push([row.label, row.valueText, row.note].filter(Boolean).join("  "));
      cursorY += rowHeight;
    }
  });

  return { marks, textLines, height: PLOT_FIXED_HEIGHT + rowUnitsOf(plot) * rowHeight };
}
