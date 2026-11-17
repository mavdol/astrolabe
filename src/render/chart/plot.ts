import type { Colours, MarkerShape } from "../../themes/astrolabe.js";
import type { SvgTextRenderer } from "../svg-text.js";

export interface PlotHeights {
  smallest: number;
  usual: number;
  largest: number;
}

export interface PlotArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawnPlot {
  marks: string[];
  textLines: string[];
}

/** The drawn part of a chart, between its header and its how-to-read line. */
export interface Plot {
  /** The heights the plot can take at this width: below the smallest its text or its rows would not be readable. */
  heightsAt(width: number, text: SvgTextRenderer): PlotHeights;
  draw(text: SvgTextRenderer, colours: Colours, area: PlotArea): DrawnPlot;
}

export const PLOT_STYLE = {
  heading: { weight: 600, size: 13 },
  label: { weight: 500, size: 13 },
  value: { weight: 600, size: 13, tabular: true },
  note: { weight: 400, size: 12 },
  tick: { weight: 400, size: 12, tabular: true },
} as const;

export const MARKER_RADIUS = 5;
export const INTERVAL_STROKE = 2;

const INTERVAL_CAP = 8;

export const round = (value: number) => String(Math.round(value * 10) / 10);

export function widestOf(text: SvgTextRenderer, texts: string[], style: Parameters<SvgTextRenderer["measure"]>[1]): number {
  return Math.max(0, ...texts.map((entry) => text.measure(entry, style)));
}

export function marker(shape: MarkerShape, x: number, y: number, colour: string, halo: string): string {
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

/** An interval drawn across, with a cap at each end. */
export function intervalAcross(from: number, to: number, y: number, colour: string, width = INTERVAL_STROKE): string {
  const cap = INTERVAL_CAP / 2;
  const path = `M${round(from)} ${round(y)}H${round(to)}M${round(from)} ${round(y - cap)}V${round(y + cap)}M${round(to)} ${round(y - cap)}V${round(y + cap)}`;

  return `<path d="${path}" stroke="${colour}" stroke-width="${width}" fill="none"/>`;
}

/** An interval drawn upwards, with a cap at each end. */
export function intervalUpwards(from: number, to: number, x: number, colour: string, width = INTERVAL_STROKE): string {
  const cap = INTERVAL_CAP / 2;
  const path = `M${round(x)} ${round(from)}V${round(to)}M${round(x - cap)} ${round(from)}H${round(x + cap)}M${round(x - cap)} ${round(to)}H${round(x + cap)}`;

  return `<path d="${path}" stroke="${colour}" stroke-width="${width}" fill="none"/>`;
}

const ARROW_HEAD = 3.5;

/** An arrow from one point to another, for the direction in which results are better. */
export function arrow(from: [number, number], to: [number, number], colour: string): string {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const [alongX, alongY] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
  const [backX, backY] = [to[0] - alongX * ARROW_HEAD, to[1] - alongY * ARROW_HEAD];
  const firstBarb = `${round(backX - alongY * ARROW_HEAD)} ${round(backY + alongX * ARROW_HEAD)}`;
  const secondBarb = `${round(backX + alongY * ARROW_HEAD)} ${round(backY - alongX * ARROW_HEAD)}`;

  return `<path d="M${round(from[0])} ${round(from[1])}L${round(to[0])} ${round(to[1])}M${firstBarb}L${round(to[0])} ${round(to[1])}L${secondBarb}" stroke="${colour}" stroke-width="1.25" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

type Rgb = [number, number, number];

const rgbOf = (hex: string): Rgb => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as Rgb;

/** A colour between two others: share 0 is the first, share 1 the second. */
export function mixOf(first: string, second: string, share: number): string {
  const [from, towards] = [rgbOf(first), rgbOf(second)];

  return `#${from
    .map((channel, index) =>
      Math.round(channel + (towards[index] - channel) * share)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
