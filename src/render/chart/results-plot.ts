import type { Colours } from "../../themes/astrolabe.js";
import type { Decimals } from "../number-format.js";
import { CAP_HEIGHT_RATIO, escapeXml, type SvgTextRenderer } from "../svg-text.js";
import {
  growsFrom,
  INTERVAL_STROKE,
  intervalAcross,
  linkedName,
  PLOT_STYLE,
  round,
  UNDERLINE_OFFSET,
  widestOf,
  type DrawnPlot,
  type Plot,
  type PlotArea,
} from "./plot.js";
import { linearScale, type AxisScale } from "./scale.js";

/** One candidate's result on one part. */
export interface ResultBar {
  candidate: string;
  /** The candidate's name, for the text alternative: the chart itself names it in its key. */
  name: string;
  /** The same on every filter state, so a page can move the bar rather than redraw it. */
  key: string;
  colour: string;
  value: number;
  interval?: [number, number];
  valueText: string;
  /** Its place among the candidates ("best", "tied"), or "declared". */
  note?: string;
  noteColour?: string;
  /** What the page shows when the reader points at the bar, one line per entry. */
  tip?: string[];
}

export interface ResultGroup {
  /** The part's name; none when the chart shows one part. */
  name?: string;
  /** Where the page describes the part. */
  link?: string;
  /** The part's own scale, when the parts are too far apart in size to share one. */
  scale?: { top: number; label: string };
  bars: ResultBar[];
}

/**
 * Every candidate's result on every part, each part a block of bars glued together, one per candidate in the same order
 * and colour on every part, named once in a key drawn in that order; the part's name beside its block, or above it when the chart is too
 * narrow for a column of names.
 */
export interface ResultsPlot {
  groups: ResultGroup[];
  /** The top of the scale the parts share, from zero, when they share one. */
  top: number;
  tickText: (value: number, decimals: Decimals) => string;
  /** Every candidate in the order of its bar on every part, with its colour. */
  key: { candidate: string; name: string; colour: string }[];
}

const BAR_PITCH = { smallest: 15, usual: 19, largest: 32 };
/** The bar's share of its pitch: the rest is the hairline of background that keeps two glued bars apart. */
const BAR_SHARE = 0.86;
const GROUP_GAP = 18;
const NAME_ABOVE_HEIGHT = 24;
const NAME_LINE_HEIGHT = 17;
/** The width of a candidate's swatch in the key, a stub of its bar. */
const KEY_SWATCH = 22;
const AXIS_HEIGHT = 24;
const COLUMN_GAP = 12;
const NOTE_GAP = 8;
/** The column of names beside the blocks takes at most this share of the width; a name wraps on two lines in it. */
const LARGEST_NAME_SHARE = 0.32;
/** A name that needs more lines than this goes above its block, with every other name. */
const NAME_LINES_BESIDE = 2;

const barCountOf = (plot: ResultsPlot) => plot.groups.reduce((count, group) => count + group.bars.length, 0);
/** Every row the plot draws at the pitch of a bar: the key's, one per candidate, then the bars. */
const rowCountOf = (plot: ResultsPlot) => plot.key.length + barCountOf(plot);

function layoutOf(plot: ResultsPlot, text: SvgTextRenderer, width: number) {
  const named = plot.groups.some((group) => group.name);
  const nameWidth = Math.min(
    width * LARGEST_NAME_SHARE,
    Math.max(
      widestOf(
        text,
        plot.groups.map((group) => group.name ?? ""),
        PLOT_STYLE.heading,
      ),
      widestOf(
        text,
        plot.groups.map((group) => group.scale?.label ?? ""),
        PLOT_STYLE.tick,
      ),
    ),
  );
  const nameLines = plot.groups.map((group) => (group.name ? text.wrap(group.name, PLOT_STYLE.heading, nameWidth) : []));
  const namesBeside =
    named &&
    nameLines.every((lines) => lines.length <= NAME_LINES_BESIDE) &&
    plot.groups.every((group) => !group.scale || text.measure(group.scale.label, PLOT_STYLE.tick) <= nameWidth);
  const bars = plot.groups.flatMap((group) => group.bars);
  const valueWidth = widestOf(
    text,
    bars.map((bar) => bar.valueText),
    PLOT_STYLE.value,
  );
  const noteWidth = widestOf(
    text,
    bars.map((bar) => bar.note ?? ""),
    PLOT_STYLE.note,
  );
  const sharesScale = plot.groups.every((group) => !group.scale);
  const fixedHeight =
    GROUP_GAP +
    (sharesScale ? AXIS_HEIGHT : 0) +
    (plot.groups.length - 1) * GROUP_GAP +
    (named && !namesBeside ? plot.groups.length * NAME_ABOVE_HEIGHT : 0);

  return { namesBeside, nameWidth: namesBeside ? nameWidth : 0, nameLines, valueWidth, noteWidth, sharesScale, fixedHeight };
}

function drawResults(plot: ResultsPlot, text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot {
  const { x, width } = area;
  const layout = layoutOf(plot, text, width);
  const room = area.height - layout.fixedHeight;
  // An image with room to spare thickens the bars, not the key, whose stubs only name the colours.
  const keyPitch = Math.min(room / rowCountOf(plot), BAR_PITCH.usual);
  const pitch = (room - plot.key.length * keyPitch) / barCountOf(plot);
  const barHeight = pitch * BAR_SHARE;
  const plotLeft = x + (layout.namesBeside ? layout.nameWidth + COLUMN_GAP : 0);
  const valueRight = x + width - (layout.noteWidth > 0 ? layout.noteWidth + NOTE_GAP : 0);
  const plotRight = valueRight - layout.valueWidth - COLUMN_GAP;
  const targetTicks = plotRight - plotLeft < 260 ? 3 : 5;
  const sharedScale = linearScale([0, plot.top], [plotLeft, plotRight], targetTicks);
  const marks: string[] = [];
  const textLines: string[] = [];
  const middleOf = (top: number, height: number, size: number) => top + height / 2 + (size * CAP_HEIGHT_RATIO) / 2;
  const spans: [number, number][] = [];

  // The key is a block like the parts': each candidate's stub of bar in the place its bar has on every part, so the
  // order names the bars as well as the colour does.
  plot.key.forEach((entry, index) => {
    const top = area.y + index * keyPitch;
    const swatchHeight = keyPitch * BAR_SHARE;

    marks.push(
      `<g data-candidate="${escapeXml(entry.candidate)}"><rect x="${round(plotLeft)}" y="${round(top + (keyPitch - swatchHeight) / 2)}" width="${KEY_SWATCH}" height="${round(swatchHeight)}" fill="${entry.colour}"/>${text.draw(
        entry.name,
        plotLeft + KEY_SWATCH + 8,
        middleOf(top, keyPitch, PLOT_STYLE.label.size),
        { ...PLOT_STYLE.label, fill: colours.ink },
      )}</g>`,
    );
    textLines.push(entry.name);
  });

  let cursorY = area.y + plot.key.length * keyPitch + GROUP_GAP;

  plot.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      if (layout.namesBeside)
        marks.push(
          `<path d="M${round(x)} ${round(cursorY + GROUP_GAP / 2)}H${round(x + width)}" stroke="${colours.rule}" stroke-width="1"/>`,
        );

      cursorY += GROUP_GAP;
    }

    const scale: AxisScale = group.scale ? linearScale([0, group.scale.top], [plotLeft, plotRight], targetTicks) : sharedScale;

    if (group.name) {
      // Beside its block, the name starts on the line of the first bar, on two lines at most; above it, on a line of its own.
      const lines = layout.namesBeside
        ? layout.nameLines[groupIndex]
        : [
            text.fit(
              group.name,
              PLOT_STYLE.heading,
              width - (group.scale ? text.measure(group.scale.label, PLOT_STYLE.tick) + COLUMN_GAP : 0),
            ),
          ];
      const baseline = middleOf(cursorY, layout.namesBeside ? pitch : NAME_ABOVE_HEIGHT, PLOT_STYLE.heading.size);
      const baselineOf = (index: number) => baseline + index * NAME_LINE_HEIGHT;

      marks.push(
        linkedName(
          lines.map((line, index) => text.draw(line, x, baselineOf(index), { ...PLOT_STYLE.heading, fill: colours.ink })).join(""),
          group.link,
          lines.map((line, index) => ({ x, y: baselineOf(index) + UNDERLINE_OFFSET, width: text.measure(line, PLOT_STYLE.heading) })),
          colours,
        ),
      );

      if (group.scale)
        marks.push(
          layout.namesBeside
            ? text.draw(group.scale.label, x, baselineOf(lines.length), { ...PLOT_STYLE.tick, fill: colours.secondary })
            : text.draw(group.scale.label, plotRight, baseline, { ...PLOT_STYLE.tick, fill: colours.secondary, anchor: "end" }),
        );

      textLines.push(group.scale ? `${group.name}  ${group.scale.label}` : group.name);

      if (!layout.namesBeside) cursorY += NAME_ABOVE_HEIGHT;
    }

    const groupTop = cursorY;
    const groupBottom = groupTop + group.bars.length * pitch;

    spans.push([groupTop, groupBottom]);

    if (group.scale)
      marks.push(`<path d="M${round(plotRight)} ${round(groupTop)}V${round(groupBottom)}" stroke="${colours.rule}" stroke-width="1"/>`);

    for (const bar of group.bars) {
      const middle = cursorY + pitch / 2;
      const end = scale.position(bar.value);
      const interval = bar.interval?.map(scale.position);
      const tip = bar.tip ? ` data-tip="${bar.tip.map(escapeXml).join("&#10;")}"` : "";

      marks.push(
        `<g data-key="${escapeXml(bar.key)}" data-candidate="${escapeXml(bar.candidate)}" data-y="${round(middle)}"${tip}>`,
        `<g class="mark" data-x="${round(end)}">`,
        // The interval grows with its bar, so it never waits at the end of a bar not drawn yet.
        growsFrom(
          scale.position(0),
          [
            `<rect x="${round(plotLeft)}" y="${round(middle - barHeight / 2)}" width="${round(Math.max(0, end - plotLeft))}" height="${round(barHeight)}" fill="${bar.colour}"/>`,
            ...(interval
              ? [
                  intervalAcross(interval[0], interval[1], middle, colours.background, INTERVAL_STROKE + 2.5),
                  intervalAcross(interval[0], interval[1], middle, colours.ink, INTERVAL_STROKE),
                ]
              : []),
          ].join(""),
        ),
      );

      marks.push("</g>");
      marks.push(
        text.draw(bar.valueText, valueRight, middleOf(cursorY, pitch, PLOT_STYLE.value.size), {
          ...PLOT_STYLE.value,
          fill: colours.ink,
          anchor: "end",
        }),
      );

      if (bar.note)
        marks.push(
          text.draw(bar.note, x + width - layout.noteWidth, middleOf(cursorY, pitch, PLOT_STYLE.note.size), {
            ...PLOT_STYLE.note,
            fill: bar.noteColour ?? colours.secondary,
          }),
        );

      marks.push("</g>");
      textLines.push([bar.name, bar.valueText, bar.note].filter(Boolean).join("  "));
      cursorY += pitch;
    }

    marks.push(`<path d="M${round(plotLeft)} ${round(groupTop)}V${round(groupBottom)}" stroke="${colours.ruleStrong}" stroke-width="1"/>`);
  });

  if (layout.sharesScale) {
    const rowsBottom = cursorY;

    for (const tick of sharedScale.ticks.filter((tick) => tick > 0)) {
      const tickX = sharedScale.position(tick);

      marks.unshift(
        `<path d="${spans.map(([top, bottom]) => `M${round(tickX)} ${round(top)}V${round(bottom)}`).join("")}" stroke="${colours.rule}" stroke-width="1"/>`,
      );
    }

    for (const tick of sharedScale.ticks) {
      const label = plot.tickText(tick, sharedScale.tickDecimals);
      const labelWidth = text.measure(label, PLOT_STYLE.tick);
      const labelX = Math.min(Math.max(sharedScale.position(tick) - labelWidth / 2, plotLeft), x + width - labelWidth);

      marks.push(
        text.draw(label, labelX, rowsBottom + 8 + PLOT_STYLE.tick.size * CAP_HEIGHT_RATIO, { ...PLOT_STYLE.tick, fill: colours.secondary }),
      );
    }

    textLines.push(sharedScale.ticks.map((tick) => plot.tickText(tick, sharedScale.tickDecimals)).join("  "));
  }

  return { marks, textLines };
}

export function resultsPlot(plot: ResultsPlot): Plot {
  return {
    heightsAt(width, text) {
      const { fixedHeight } = layoutOf(plot, text, width);
      const rows = rowCountOf(plot);

      return {
        smallest: fixedHeight + rows * BAR_PITCH.smallest,
        usual: fixedHeight + rows * BAR_PITCH.usual,
        largest: fixedHeight + plot.key.length * BAR_PITCH.usual + barCountOf(plot) * BAR_PITCH.largest,
      };
    },
    draw: (text, colours, area) => drawResults(plot, text, colours, area),
  };
}
