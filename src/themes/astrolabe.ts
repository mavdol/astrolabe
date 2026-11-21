import type { Style } from "../schema/presentation.js";

export type Mode = "light" | "dark";

export interface Colours {
  background: string;
  ink: string;
  /** Secondary text: at least 4.5:1 against the background. */
  secondary: string;
  /** Text that steps back, only at large sizes: at least 3:1 against the background. */
  quiet: string;
  rule: string;
  /** Rules that carry meaning: the zero line, the frame of a control. */
  ruleStrong: string;
  /** The zone of effects too small to matter, and other quiet fills. */
  band: string;
  /** Quiet fills on the page: the track of a control, the head of a table, a row under the pointer. */
  surface: string;
  inkOnFill: string;
  /** The verdicts that say better and worse, always beside their word: at least 4.5:1 against the background. */
  good: string;
  bad: string;
  /** Candidates without a colour of their own, in the order of candidates: ink, then greys that keep 3:1 against the background. */
  series: string[];
}

/**
 * Ink on white and on a cool near-black, hierarchy by weight and size. Colour has three jobs only:
 * the first candidate's cyan, and the verdicts better and worse.
 */
export const THEME: Record<Mode, Colours> = {
  light: {
    background: "#ffffff",
    ink: "#111214",
    secondary: "#5d6169",
    quiet: "#8a8d93",
    rule: "#ebebed",
    ruleStrong: "#d5d6d9",
    band: "#eff0f1",
    surface: "#f5f5f6",
    inkOnFill: "#ffffff",
    good: "#17804f",
    bad: "#c0502a",
    series: ["#16798b", "#53565c", "#7a7d82", "#929599"],
  },
  dark: {
    background: "#0e0f11",
    ink: "#f1f2f4",
    secondary: "#9a9ea6",
    quiet: "#676b73",
    rule: "#1d1f22",
    ruleStrong: "#2e3135",
    band: "#1a1b1e",
    surface: "#16171a",
    inkOnFill: "#0e0f11",
    good: "#8fe3b4",
    bad: "#f4a37d",
    series: ["#9fe3ee", "#b3b6bb", "#8c9096", "#6e7278"],
  },
};

export const MARK_CONTRAST = 3;
export const TEXT_CONTRAST = 4.5;

/** Candidates are never told apart by colour alone: each also has its own marker shape. */
export const MARKER_SHAPES = ["circle", "square", "diamond", "triangle"] as const;

export type MarkerShape = (typeof MARKER_SHAPES)[number];

export interface SeriesStyle {
  colour: string;
  shape: MarkerShape;
}

type Rgb = [number, number, number];

const rgbOf = (hex: string): Rgb => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as Rgb;
const hexOf = (rgb: Rgb) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

function relativeLuminance(hex: string): number {
  const [red, green, blue] = rgbOf(hex).map((channel) => {
    const share = channel / 255;

    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The WCAG contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}

const MIXING_STEPS = 20;

/**
 * A colour the reader can see on this background: the colour itself when its contrast is enough,
 * otherwise the same hue moved towards the ink, as little as needed.
 */
export function visibleOn(background: string, colour: string, ink: string, minimumContrast = MARK_CONTRAST): string {
  const from = rgbOf(colour);
  const towards = rgbOf(ink);

  for (let step = 0; step <= MIXING_STEPS; step++) {
    const share = step / MIXING_STEPS;
    const mixed = hexOf(from.map((channel, index) => channel + (towards[index] - channel) * share) as Rgb);

    if (contrastRatio(mixed, background) >= minimumContrast) return mixed;
  }

  return ink;
}

/**
 * The colour and the marker of each candidate, the same on every chart. A colour given in
 * style.series is kept, adjusted to stay visible in this mode. With a highlight, that candidate
 * takes the accent, or the ink, and the others take greys. Otherwise ink and greys in the order of candidates.
 */
export function seriesStylesOf(candidateIds: string[], style: Style | undefined, mode: Mode): Map<string, SeriesStyle> {
  const colours = THEME[mode];
  const visible = (colour: string) => visibleOn(colours.background, colour, colours.ink);
  const greys = style?.highlight ? colours.series.slice(1) : colours.series;
  const styles = new Map<string, SeriesStyle>();
  let nextGrey = 0;

  candidateIds.forEach((candidate, index) => {
    const shape = MARKER_SHAPES[index % MARKER_SHAPES.length];
    const declared = style?.series?.[candidate];
    const isHighlighted = style?.highlight === candidate;

    if (declared) styles.set(candidate, { colour: visible(declared), shape });
    else if (isHighlighted) styles.set(candidate, { colour: style?.accent ? visible(style.accent) : colours.ink, shape });
    else styles.set(candidate, { colour: greys[nextGrey++ % greys.length], shape });
  });

  return styles;
}

/** How many candidates one chart can hold before two of them share a grey. */
export function distinctSeriesWithoutColours(style: Style | undefined): number {
  return style?.highlight ? THEME.light.series.length - 1 : THEME.light.series.length;
}
