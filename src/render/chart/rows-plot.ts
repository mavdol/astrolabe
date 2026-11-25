import type { Colours, SeriesStyle } from "../../themes/astrolabe.js";
import type { Decimals } from "../number-format.js";
import { CAP_HEIGHT_RATIO, type SvgTextRenderer } from "../svg-text.js";
import {
  growsFrom,
  INTERVAL_STROKE,
  intervalAcross,
  linkedName,
  marker,
  MARKER_RADIUS,
  PLOT_STYLE,
  poppingMarker,
  round,
  widestOf,
  type DrawnPlot,
  type Plot,
  type PlotArea,
  UNDERLINE_OFFSET,
} from "./plot.js";
import { linearScale, logScale } from "./scale.js";

/** The middle half of the observations as a box, and the range that holds most of them as a line. */
export interface Box {
  quartiles: [number, number];
  whiskers: [number, number];
}

export interface Segment {
  value: number;
  colour: string;
}

export interface PlotRow {
  label: string;
  /** Where the page describes the part the label names. */
  labelLink?: string;
  /** The same on every filter state, so a page can move the row rather than redraw it. */
  key?: string;
  candidate?: string;
  series: SeriesStyle;
  value: number;
  interval?: [number, number];
  /** Every observation, drawn as a point. */
  points?: number[];
  box?: Box;
  /** The parts of the value, drawn end to end from zero. */
  segments?: Segment[];
  /** The value as the reader sees it, right of the plot: digits line up down the column. */
  valueText: string;
  /** A word that qualifies the value: a verdict, "declared". */
  note?: string;
  /** The colour of the note when it is a verdict; secondary otherwise. */
  noteColour?: string;
  /** An outlined marker, for a comparison that is not a claim. */
  hollow?: boolean;
}

export interface PlotGroup {
  heading?: string;
  /** Where the page describes the part the heading names. */
  link?: string;
  rows: PlotRow[];
}

/** A chart of horizontal rows on one shared scale: a mark per row, its interval, its value in digits. */
export interface RowsPlot {
  groups: PlotGroup[];
  mark: "dot" | "bar" | "distribution" | "stack";
  /** The values the axis must enclose. Bars and stacks always enclose zero. */
  extent: [number, number];
  /** The lowest value the measure can take, where the axis stops even when a round tick lies below: −100% for a change in percent. */
  floor?: number;
  logScale?: boolean;
  tickText: (value: number, decimals: Decimals) => string;
  /** A zone drawn behind the marks, such as the differences too small to matter. */
  band?: [number, number];
  /** A reference line at zero, for effects. */
  zeroLine?: boolean;
  /** What each colour of a stack stands for. */
  legend?: { label: string; colour: string }[];
  /**
   * A scale per group, from zero to its own top, when the groups differ too much in size to share one: each group then
   * says its range beside its heading instead of an axis under the chart.
   */
  groupScales?: { top: number; label: string }[];
  /**
   * A heading row over the columns, as a table has: what the names are, what the marks compare (with the colour of
   * the candidate they show, when there is one), and what the figures are.
   */
  columnHeadings?: { names: string; marks: string; marksSeries?: SeriesStyle; figures: string };
}

export const ROW_HEIGHT = { smallest: 22, usual: 44, largest: 52 };

const HEADING_ROWS = 0.9;
const GAP_BETWEEN_GROUPS_ROWS = 0.5;
const AXIS_HEIGHT = 24;
const COLUMN_GAP = 12;
const LARGEST_LABEL_SHARE = 0.34;
const BAR_SHARE_OF_ROW = 0.56;
const BOX_SHARE_OF_ROW = 0.5;
const POINT_RADIUS = 3;
const POINT_OPACITY = 0.45;
const CENTRE_TICK_SHARE_OF_ROW = 0.7;
const LEGEND_LINE_HEIGHT = 20;
const LEGEND_SWATCH = 10;
const LEGEND_GAP = 16;
const COLUMN_HEADINGS_HEIGHT = 30;

function rowUnitsOf(plot: RowsPlot): number {
  return plot.groups.reduce(
    (units, group, index) => units + group.rows.length + (group.heading ? HEADING_ROWS : 0) + (index > 0 ? GAP_BETWEEN_GROUPS_ROWS : 0),
    0,
  );
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

interface LegendEntry {
  label: string;
  colour: string;
  x: number;
  line: number;
}

function legendLayout(plot: RowsPlot, text: SvgTextRenderer, width: number): { entries: LegendEntry[]; height: number } {
  const entries: LegendEntry[] = [];
  let [x, line] = [0, 0];

  for (const entry of plot.legend ?? []) {
    const entryWidth = LEGEND_SWATCH + 6 + text.measure(entry.label, PLOT_STYLE.note);

    if (x > 0 && x + entryWidth > width) [x, line] = [0, line + 1];

    entries.push({ ...entry, x, line });
    x += entryWidth + LEGEND_GAP;
  }

  return { entries, height: entries.length > 0 ? (line + 1) * LEGEND_LINE_HEIGHT + 4 : 0 };
}

/** Below this share of the width, the plot is too narrow to read: the notes move under the values. */
const SMALLEST_PLOT_SHARE = 0.45;
const NOTE_BELOW_HEIGHT = 14;

function columnsOf(plot: RowsPlot, text: SvgTextRenderer, width: number) {
  const rows = plot.groups.flatMap((group) => group.rows);
  const labelWidth = Math.min(
    widestOf(
      text,
      rows.map((row) => row.label),
      PLOT_STYLE.label,
    ),
    width * LARGEST_LABEL_SHARE,
  );
  const valueWidth = widestOf(
    text,
    rows.map((row) => row.valueText),
    PLOT_STYLE.value,
  );
  const noteWidth = widestOf(
    text,
    rows.map((row) => row.note ?? ""),
    PLOT_STYLE.note,
  );
  const plotWidthBeside = width - labelWidth - valueWidth - 2 * COLUMN_GAP - (noteWidth > 0 ? noteWidth + 8 : 0);
  const notesBelow = noteWidth > 0 && plotWidthBeside < width * SMALLEST_PLOT_SHARE;
  const plotWidthAbove = width - labelWidth - Math.max(valueWidth, noteWidth) - 2 * COLUMN_GAP;
  const breaksNotes = notesBelow && plotWidthAbove < width * SMALLEST_PLOT_SHARE;
  const noteLinesOf = (row: PlotRow) =>
    row.note
      ? breaksNotes
        ? row.note.split(", ").map((part, index, parts) => (index < parts.length - 1 ? `${part},` : part))
        : [row.note]
      : [];
  const brokenNoteWidth = widestOf(text, rows.flatMap(noteLinesOf), PLOT_STYLE.note);

  return {
    labelWidth,
    valueWidth,
    noteWidth: breaksNotes ? brokenNoteWidth : noteWidth,
    notesBelow,
    noteLinesOf,
    noteLineCount: Math.max(0, ...rows.map((row) => noteLinesOf(row).length)),
  };
}

function drawRows(plot: RowsPlot, text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot {
  const { x, width } = area;
  const legend = legendLayout(plot, text, width);
  const headingsHeight = plot.columnHeadings ? COLUMN_HEADINGS_HEIGHT : 0;
  const fixedHeight = legend.height + headingsHeight + AXIS_HEIGHT;
  const rowHeight = (area.height - fixedHeight) / rowUnitsOf(plot);
  const rows = plot.groups.flatMap((group) => group.rows);
  const { labelWidth, valueWidth, noteWidth, notesBelow, noteLinesOf } = columnsOf(plot, text, width);
  const plotLeft = x + labelWidth + COLUMN_GAP;
  const plotRight = notesBelow
    ? x + width - Math.max(valueWidth, noteWidth) - COLUMN_GAP
    : x + width - valueWidth - COLUMN_GAP - (noteWidth > 0 ? noteWidth + 8 : 0);
  const startsAtZero = plot.mark === "bar" || plot.mark === "stack";
  const scaleExtent: [number, number] = startsAtZero ? [Math.min(0, plot.extent[0]), Math.max(0, plot.extent[1])] : plot.extent;
  const targetTicks = plotRight - plotLeft < 260 ? 3 : 5;
  const scale = plot.logScale
    ? logScale(scaleExtent, [plotLeft, plotRight])
    : linearScale(scaleExtent, [plotLeft, plotRight], targetTicks, plot.floor);
  const marks: string[] = [];
  const textLines: string[] = [];
  const rowsTop = area.y + legend.height + headingsHeight;
  const rowsBottom = rowsTop + rowUnitsOf(plot) * rowHeight;
  const baselineIn = (top: number, height: number, size: number) => top + height / 2 + (size * CAP_HEIGHT_RATIO) / 2;
  const rowSpans = rowSpansOf(plot, rowsTop, rowHeight);
  const verticalLines = (lineX: number) => rowSpans.map(([top, bottom]) => `M${round(lineX)} ${round(top)}V${round(bottom)}`).join("");

  for (const entry of legend.entries) {
    const top = area.y + entry.line * LEGEND_LINE_HEIGHT;

    marks.push(
      `<rect x="${round(x + entry.x)}" y="${round(top + (LEGEND_LINE_HEIGHT - LEGEND_SWATCH) / 2)}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" fill="${entry.colour}"/>`,
    );
    marks.push(
      text.draw(entry.label, x + entry.x + LEGEND_SWATCH + 6, baselineIn(top, LEGEND_LINE_HEIGHT, PLOT_STYLE.note.size), {
        ...PLOT_STYLE.note,
        fill: colours.ink,
      }),
    );
  }

  if (legend.entries.length > 0) textLines.push(legend.entries.map((entry) => entry.label).join("  "));

  if (plot.columnHeadings) {
    const headings = plot.columnHeadings;
    const style = { ...PLOT_STYLE.caption, fill: colours.secondary };
    const baseline = rowsTop - headingsHeight / 2 + (PLOT_STYLE.caption.size * CAP_HEIGHT_RATIO) / 2 - 2;
    const figures = headings.figures.toUpperCase();
    const figuresRight = notesBelow ? x + width : x + width - (noteWidth > 0 ? noteWidth + 8 : 0);
    const markerSpace = headings.marksSeries ? 2 * MARKER_RADIUS + 6 : 0;
    const marksRoom = figuresRight - text.measure(figures, PLOT_STYLE.caption) - COLUMN_GAP - plotLeft - markerSpace;
    const marksHeading = text.fit(headings.marks.toUpperCase(), PLOT_STYLE.caption, marksRoom);

    if (headings.names) marks.push(text.draw(text.fit(headings.names.toUpperCase(), PLOT_STYLE.caption, labelWidth), x, baseline, style));

    if (headings.marksSeries) {
      const { shape, colour } = headings.marksSeries;

      marks.push(
        marker(shape, plotLeft + MARKER_RADIUS, baseline - (PLOT_STYLE.caption.size * CAP_HEIGHT_RATIO) / 2, colour, colours.background),
      );
    }

    marks.push(text.draw(marksHeading, plotLeft + markerSpace, baseline, style));
    marks.push(text.draw(figures, figuresRight, baseline, { ...style, anchor: "end" }));
    marks.push(`<path d="M${round(x)} ${round(rowsTop - 0.5)}H${round(x + width)}" stroke="${colours.rule}" stroke-width="1"/>`);
    textLines.push([headings.names, headings.marks, headings.figures].filter(Boolean).join("  "));
  }

  if (plot.band) {
    const [from, to] = plot.band.map((value) => Math.min(Math.max(scale.position(value), plotLeft), plotRight));

    for (const [top, bottom] of rowSpans)
      marks.push(
        `<rect x="${round(from)}" y="${round(top)}" width="${round(to - from)}" height="${round(bottom - top)}" fill="${colours.band}"/>`,
      );
  }

  for (const tick of plot.groupScales ? [] : scale.ticks) {
    const tickX = scale.position(tick);
    const isZeroReference = plot.zeroLine === true && tick === 0;
    const isAxisOrigin = startsAtZero && tick === 0;
    const label = plot.tickText(tick, scale.tickDecimals);
    const labelWidthHere = text.measure(label, PLOT_STYLE.tick);
    const labelX = Math.min(Math.max(tickX - labelWidthHere / 2, x), x + width - labelWidthHere);

    marks.push(
      `<path d="${verticalLines(tickX)}" stroke="${isZeroReference || isAxisOrigin ? colours.ruleStrong : colours.rule}" stroke-width="1"/>`,
    );
    marks.push(
      text.draw(label, labelX, rowsBottom + 8 + PLOT_STYLE.tick.size * CAP_HEIGHT_RATIO, { ...PLOT_STYLE.tick, fill: colours.secondary }),
    );
  }

  if (!plot.groupScales) textLines.push(scale.ticks.map((tick) => plot.tickText(tick, scale.tickDecimals)).join("  "));

  let cursorY = rowsTop;

  plot.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) cursorY += GAP_BETWEEN_GROUPS_ROWS * rowHeight;

    const ownScale = plot.groupScales?.[groupIndex];
    const groupScale = ownScale ? linearScale([0, ownScale.top], [plotLeft, plotRight], targetTicks) : scale;

    if (group.heading) {
      const headingHeight = HEADING_ROWS * rowHeight;
      const rangeWidth = ownScale ? text.measure(ownScale.label, PLOT_STYLE.tick) : 0;

      const heading = text.fit(group.heading, PLOT_STYLE.heading, width - (rangeWidth > 0 ? rangeWidth + COLUMN_GAP : 0));
      const headingBaseline = baselineIn(cursorY, headingHeight, PLOT_STYLE.heading.size);

      marks.push(
        linkedName(
          text.draw(heading, x, headingBaseline, { ...PLOT_STYLE.heading, fill: colours.ink }),
          group.link,
          { x, y: headingBaseline + UNDERLINE_OFFSET, width: text.measure(heading, PLOT_STYLE.heading) },
          colours,
        ),
      );

      if (ownScale)
        marks.push(
          text.draw(ownScale.label, plotRight, baselineIn(cursorY, headingHeight, PLOT_STYLE.tick.size), {
            ...PLOT_STYLE.tick,
            fill: colours.secondary,
            anchor: "end",
          }),
        );

      textLines.push(ownScale ? `${group.heading}  ${ownScale.label}` : group.heading);
      cursorY += headingHeight;
    }

    if (ownScale) {
      const groupBottom = cursorY + group.rows.length * rowHeight;

      marks.push(
        `<path d="M${round(plotLeft)} ${round(cursorY)}V${round(groupBottom)}" stroke="${colours.ruleStrong}" stroke-width="1"/>`,
        `<path d="M${round(plotRight)} ${round(cursorY)}V${round(groupBottom)}" stroke="${colours.rule}" stroke-width="1"/>`,
      );
    }

    for (const row of group.rows) {
      const centreY = cursorY + rowHeight / 2;
      const scale = groupScale;
      const valueX = scale.position(row.value);
      const label = text.fit(row.label, PLOT_STYLE.label, labelWidth);
      const interval = row.interval?.map(scale.position);

      if (row.key)
        marks.push(`<g data-key="${row.key}"${row.candidate ? ` data-candidate="${row.candidate}"` : ""} data-y="${round(centreY)}">`);

      const labelBaseline = baselineIn(cursorY, rowHeight, PLOT_STYLE.label.size);

      marks.push(
        linkedName(
          text.draw(label, x, labelBaseline, { ...PLOT_STYLE.label, fill: colours.ink }),
          row.labelLink,
          { x, y: labelBaseline + UNDERLINE_OFFSET, width: text.measure(label, PLOT_STYLE.label) },
          colours,
        ),
      );

      if (row.key) marks.push(`<g class="mark" data-x="${round(valueX)}">`);

      if (plot.mark === "bar" || plot.mark === "stack") {
        const barHeight = rowHeight * BAR_SHARE_OF_ROW;
        const segments = row.segments ?? [{ value: row.value, colour: row.series.colour }];
        let from = 0;

        for (const segment of segments) {
          const [start, end] = [scale.position(from), scale.position(from + segment.value)];
          const gap = row.segments && from > 0 ? 1.5 : 0;

          marks.push(
            growsFrom(
              scale.position(0),
              `<rect x="${round(Math.min(start, end) + gap)}" y="${round(centreY - barHeight / 2)}" width="${round(Math.max(0, Math.abs(end - start) - gap))}" height="${round(barHeight)}" rx="1.5" fill="${segment.colour}"/>`,
            ),
          );
          from += segment.value;
        }

        if (interval) {
          marks.push(intervalAcross(interval[0], interval[1], centreY, colours.background, INTERVAL_STROKE + 2.5));
          marks.push(intervalAcross(interval[0], interval[1], centreY, colours.ink, INTERVAL_STROKE));
        }
      } else if (plot.mark === "distribution") {
        if (row.box) {
          const [lowWhisker, highWhisker] = row.box.whiskers.map(scale.position);
          const [firstQuartile, thirdQuartile] = row.box.quartiles.map(scale.position);
          const boxHeight = rowHeight * BOX_SHARE_OF_ROW;

          marks.push(
            `<path d="M${round(lowWhisker)} ${round(centreY)}H${round(highWhisker)}" stroke="${row.series.colour}" stroke-width="1.5"/>`,
          );
          marks.push(
            `<rect x="${round(firstQuartile)}" y="${round(centreY - boxHeight / 2)}" width="${round(thirdQuartile - firstQuartile)}" height="${round(boxHeight)}" fill="${colours.band}" stroke="${row.series.colour}" stroke-width="1.5"/>`,
          );
        }

        if (interval) {
          marks.push(intervalAcross(interval[0], interval[1], centreY, colours.background, INTERVAL_STROKE + 2.5));
          marks.push(intervalAcross(interval[0], interval[1], centreY, colours.ink, INTERVAL_STROKE));
        }

        const pointPositions = new Set((row.points ?? []).map((point) => Math.round(scale.position(point))));

        for (const pointX of pointPositions)
          marks.push(
            `<circle cx="${pointX}" cy="${round(centreY)}" r="${POINT_RADIUS}" fill="${row.series.colour}" fill-opacity="${POINT_OPACITY}"/>`,
          );

        const tickHalf = (rowHeight * CENTRE_TICK_SHARE_OF_ROW) / 2;

        marks.push(
          `<path d="M${round(valueX)} ${round(centreY - tickHalf)}V${round(centreY + tickHalf)}" stroke="${colours.ink}" stroke-width="2.5"/>`,
        );
      } else {
        const zeroX = plot.zeroLine ? scale.position(0) : undefined;
        const stem =
          zeroX !== undefined
            ? `<path d="M${round(zeroX)} ${round(centreY)}H${round(valueX)}" stroke="${row.series.colour}" stroke-opacity="0.4" stroke-width="1"/>`
            : "";

        marks.push(
          growsFrom(
            zeroX ?? valueX,
            `${stem}${interval ? intervalAcross(interval[0], interval[1], centreY, row.series.colour, INTERVAL_STROKE + 0.5) : ""}`,
          ),
        );
        marks.push(poppingMarker(row.series.shape, valueX, centreY, row.series.colour, colours.background, row.hollow));
      }

      if (row.key) marks.push("</g>");

      const valueRight = notesBelow ? x + width : x + width - (noteWidth > 0 ? noteWidth + 8 : 0);
      const noteLines = noteLinesOf(row);
      const valueBaseline =
        baselineIn(cursorY, rowHeight, PLOT_STYLE.value.size) - (notesBelow ? (noteLines.length * NOTE_BELOW_HEIGHT) / 2 : 0);

      marks.push(
        text.draw(row.valueText, valueRight, valueBaseline, {
          ...PLOT_STYLE.value,
          fill: colours.ink,
          anchor: "end",
        }),
      );

      if (row.note && notesBelow)
        noteLines.forEach((line, index) =>
          marks.push(
            text.draw(line, x + width, valueBaseline + (index + 1) * NOTE_BELOW_HEIGHT, {
              ...PLOT_STYLE.note,
              fill: row.noteColour ?? colours.secondary,
              anchor: "end",
            }),
          ),
        );
      else if (row.note)
        marks.push(
          text.draw(row.note, x + width - noteWidth, baselineIn(cursorY, rowHeight, PLOT_STYLE.note.size), {
            ...PLOT_STYLE.note,
            fill: row.noteColour ?? colours.secondary,
          }),
        );

      if (row.key) marks.push("</g>");

      textLines.push([row.label, row.valueText, row.note].filter(Boolean).join("  "));
      cursorY += rowHeight;
    }
  });

  return { marks, textLines };
}

export function rowsPlot(plot: RowsPlot): Plot {
  return {
    heightsAt(width, text) {
      const fixedHeight = legendLayout(plot, text, width).height + (plot.columnHeadings ? COLUMN_HEADINGS_HEIGHT : 0) + AXIS_HEIGHT;
      const units = rowUnitsOf(plot);
      const columns = columnsOf(plot, text, width);
      const extra = columns.notesBelow ? columns.noteLineCount * NOTE_BELOW_HEIGHT : 0;

      return {
        smallest: fixedHeight + units * (ROW_HEIGHT.smallest + extra),
        usual: fixedHeight + units * (ROW_HEIGHT.usual + extra),
        largest: fixedHeight + units * (ROW_HEIGHT.largest + extra),
      };
    },
    draw: (text, colours, area) => drawRows(plot, text, colours, area),
  };
}
