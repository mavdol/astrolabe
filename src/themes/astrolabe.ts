import monoGlyphs from "../render/fonts/geist-mono.json" with { type: "json" };
import textGlyphs from "../render/fonts/inter.json" with { type: "json" };
import type { GlyphData, Theme } from "./theme.js";

/**
 * Ink on white and on a cool near-black, hierarchy by weight and size. Colour has three jobs only:
 * the first candidate's cyan, and the verdicts better and worse. The question and the figures are in
 * Inter; labels, verdicts and the small print in Geist Mono.
 */
export const ASTROLABE: Theme = {
  name: "astrolabe",
  colours: {
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
  },
  fonts: {
    text: {
      family: "Inter",
      fallback: "system-ui, sans-serif",
      files: ([400, 500, 600, 700] as const).map((weight) => ({ weight, file: `inter-latin-${weight}-normal.woff`, format: "woff" })),
      licence: "OFL.txt",
      features: '"cv11", "ss01", "ss03"',
      glyphs: textGlyphs as unknown as GlyphData,
    },
    mono: {
      family: "Geist Mono",
      fallback: "ui-monospace, monospace",
      files: ([400, 500] as const).map((weight) => ({ weight, file: `geist-mono-latin-${weight}-normal.woff2`, format: "woff2" })),
      licence: "OFL-Geist.txt",
      glyphs: monoGlyphs as unknown as GlyphData,
    },
  },
  text: {
    plot: {
      heading: { weight: 600, size: 13 },
      label: { weight: 500, size: 13 },
      value: { weight: 500, size: 13, tabular: true, mono: true },
      note: { weight: 400, size: 11, mono: true },
      tick: { weight: 400, size: 11, tabular: true, mono: true },
      /**
       * Axis titles, in capitals as the page's labels; smaller than the ticks because capitals read larger.
       * Every chart is shown at least 1.15 times its layout size, so these are still 12 px as read.
       */
      caption: { weight: 400, size: 10.5, mono: true, tracking: 0.04 },
    },
    chartImage: {
      title: { weight: 500, size: 22, lineHeight: 28, tracking: -0.02 },
      tightTitle: { weight: 500, size: 20, lineHeight: 25, tracking: -0.02 },
      subtitle: { weight: 400, size: 12, lineHeight: 16, tracking: 0.04, mono: true },
      foot: { weight: 400, size: 12, lineHeight: 18, mono: true },
    },
    /** Every size is at least 12 px at the card's own width, the smallest text readable once shown in a README. */
    card: {
      eyebrow: { weight: 400, size: 12, lineHeight: 16, tracking: 0.04, mono: true },
      title: { weight: 500, size: 24, lineHeight: 30, tracking: -0.02 },
      label: { weight: 400, size: 12, lineHeight: 17, tracking: 0.04, mono: true },
      effect: { weight: 500, size: 56, lineHeight: 56, tabular: true, tracking: -0.05 },
      effectUnit: { weight: 400, size: 18 },
      heading: { weight: 500, size: 14, lineHeight: 20 },
      chip: { weight: 400, size: 12, tracking: 0.06, mono: true },
      name: { weight: 500, size: 13, lineHeight: 18 },
      detail: { weight: 400, size: 12, lineHeight: 18, mono: true },
      warning: { weight: 500, size: 12, lineHeight: 18, mono: true },
      scale: { weight: 400, size: 12, mono: true },
      counts: { weight: 400, size: 14, lineHeight: 21, mono: true },
    },
  },
  page: {
    width: 1180,
    chapterHeadWidth: 360,
    gutter: 40,
    railWidth: 240,
    railFrom: 1400,
    singleColumnBelow: 980,
    narrowBelow: 560,
  },
  motion: {
    easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
};
