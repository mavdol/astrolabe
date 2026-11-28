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
  /** The colours of candidates without one of their own, in the order of candidates; each keeps 3:1 against the background. */
  series: string[];
}

export type FontWeight = 400 | 500 | 600 | 700;

export interface TextStyle {
  weight: FontWeight;
  size: number;
  /** Tabular figures: every digit has the same width, so numbers line up in columns. */
  tabular?: boolean;
  /** Letter spacing in em: negative tightens large figures, positive opens small capitals. */
  tracking?: number;
  /** Set in the theme's monospace face, the face of labels, ticks and figures beside the marks. */
  mono?: boolean;
}

/** A style for text set on several lines, or in a box of its own height. */
export interface LinedTextStyle extends TextStyle {
  lineHeight: number;
}

export interface Glyph {
  advance: number;
  path: string;
}

interface WeightGlyphs {
  glyphs: Record<string, Glyph>;
  tabular: Record<string, Glyph>;
  kerning: Record<string, number>;
}

/** What the SVG renderer needs of a face to draw text as paths, extracted from its font files. */
export interface GlyphData {
  units_per_em: number;
  ascender: number;
  descender: number;
  cap_height: number;
  weights: Record<string, WeightGlyphs>;
}

export interface FontFile {
  weight: FontWeight;
  file: string;
  format: "woff" | "woff2";
}

export interface ThemeFont {
  /** The family name the page's stylesheet declares for the files. */
  family: string;
  /** The faces the reader's system draws while the files load. */
  fallback: string;
  /** One file a weight; text in a weight the face lacks is drawn in its heaviest. */
  files: FontFile[];
  /** The licence shipped beside the files. */
  licence: string;
  /** OpenType features the text is set with, as the CSS property takes them. */
  features?: string;
  glyphs: GlyphData;
}

/**
 * Everything a design fixes: colours of each mode, faces, type and measures. The file decides what is
 * shown and in which arrangement; the theme decides how it looks.
 */
export interface Theme {
  name: string;
  colours: Record<Mode, Colours>;
  fonts: { text: ThemeFont; mono: ThemeFont };
  text: {
    /** Inside the plots: the names of groups and candidates, values, notes beside the marks, ticks, axis titles. */
    plot: Record<"heading" | "label" | "value" | "note" | "tick" | "caption", TextStyle>;
    /** Around a chart exported as an image: its title, the line above it, the small print. */
    chartImage: Record<"title" | "tightTitle" | "subtitle" | "foot", LinedTextStyle>;
    /** The README card. */
    card: Record<"eyebrow" | "title" | "label" | "effect" | "heading" | "name" | "detail" | "warning" | "counts", LinedTextStyle> &
      Record<"effectUnit" | "chip" | "scale", TextStyle>;
  };
  page: {
    /** The width of the page's frame; charts are drawn to fit inside it. */
    width: number;
    /** The column of a chapter's heading, beside its body. */
    chapterHeadWidth: number;
    /** The space between the frame's hairlines and the text inside them. */
    gutter: number;
    /** The column of the ruler, left of the frame, on screens wide enough to hold both. */
    railWidth: number;
    railFrom: number;
    /** Below this width the page is a single column. */
    singleColumnBelow: number;
    /** Below this width charts switch to their narrow version. */
    narrowBelow: number;
  };
  motion: {
    /** The easing of everything that arrives or moves. */
    easeOut: string;
  };
}

/** The family as a stylesheet names it, quoted when it holds a space. */
export const cssFamilyOf = (font: ThemeFont) => (/\s/.test(font.family) ? `"${font.family}"` : font.family);

/** The family and its fallbacks, as the CSS property and the SVG attribute take them. */
export const fontStackOf = (font: ThemeFont) => `${cssFamilyOf(font)}, ${font.fallback}`;

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
 * takes the accent, or the ink, and the others take greys. Otherwise the theme's series in the order of candidates.
 */
export function seriesStylesOf(candidateIds: string[], style: Style | undefined, colours: Colours): Map<string, SeriesStyle> {
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
