import monoFont from "./fonts/geist-mono.json" with { type: "json" };
import interFont from "./fonts/inter.json" with { type: "json" };

export type FontWeight = 400 | 500 | 600 | 700;

interface Glyph {
  advance: number;
  path: string;
}

interface WeightData {
  glyphs: Record<string, Glyph>;
  tabular: Record<string, Glyph>;
  kerning: Record<string, number>;
}

interface FaceData {
  units_per_em: number;
  ascender: number;
  descender: number;
  cap_height: number;
  weights: Record<string, WeightData>;
}

const FONT = interFont as unknown as FaceData;
const MONO_FONT = monoFont as unknown as FaceData;

export const CAP_HEIGHT_RATIO = FONT.cap_height / FONT.units_per_em;

const MISSING_CHARACTER = "?";
const ELLIPSIS = "…";
/** The width in px of the background drawn around text that sits over lines, so that no line strikes it through. */
const HALO_WIDTH = 3;

export interface TextStyle {
  weight: FontWeight;
  size: number;
  /** Tabular figures: every digit has the same width, so numbers line up in columns. */
  tabular?: boolean;
  /** Letter spacing in em: negative tightens large figures, positive opens small capitals. */
  tracking?: number;
  /** Set in Geist Mono, the face of labels, ticks and figures beside the marks; it has weights 400 and 500. */
  mono?: boolean;
}

export const MONO_FONT_FAMILY = '"Geist Mono", ui-monospace, monospace';

const faceOf = (style: TextStyle) => (style.mono ? MONO_FONT : FONT);
const weightOf = (style: TextStyle) => (style.mono ? Math.min(style.weight, 500) : style.weight);

/**
 * Draws text as paths with the bundled Inter and Geist Mono, so a standalone SVG looks the
 * same on every device. Each glyph is defined once in <defs> and reused.
 */
export class SvgTextRenderer {
  private readonly glyphDefinitions = new Map<string, string>();
  private readonly missingCharacters = new Set<string>();
  /** Real text, for an SVG inside a page that loads the same font: lighter, selectable, read by search engines. */
  private readonly realText: boolean;

  constructor(options: { realText?: boolean } = {}) {
    this.realText = options.realText === true;
  }

  private glyphFor(character: string, style: TextStyle): { key: string; glyph: Glyph } {
    const weight = weightOf(style);
    const weightData = faceOf(style).weights[String(weight)];
    const face = style.mono ? "m" : "";
    const tabularGlyph = style.tabular ? weightData.tabular[character] : undefined;

    if (tabularGlyph) return { key: `${face}${weight}t${character.codePointAt(0)}`, glyph: tabularGlyph };

    const glyph = weightData.glyphs[character];

    if (glyph) return { key: `${face}${weight}-${character.codePointAt(0)}`, glyph };

    this.missingCharacters.add(character);

    return this.glyphFor(MISSING_CHARACTER, style);
  }

  private kerningBetween(left: string, right: string, style: TextStyle): number {
    return faceOf(style).weights[String(weightOf(style))].kerning[left + right] ?? 0;
  }

  measure(text: string, style: TextStyle): number {
    const characters = [...text];
    const face = faceOf(style);
    let widthInFontUnits = 0;

    const trackingInFontUnits = (style.tracking ?? 0) * face.units_per_em;

    characters.forEach((character, index) => {
      widthInFontUnits += this.glyphFor(character, style).glyph.advance;

      if (index > 0)
        widthInFontUnits += trackingInFontUnits + (style.tabular ? 0 : this.kerningBetween(characters[index - 1], character, style));
    });

    return (widthInFontUnits * style.size) / face.units_per_em;
  }

  /** Splits text into lines no wider than maxWidth, breaking between words. */
  wrap(text: string, style: TextStyle, maxWidth: number): string[] {
    const lines: string[] = [];
    let currentLine = "";

    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidateLine = currentLine ? `${currentLine} ${word}` : word;

      if (currentLine && this.measure(candidateLine, style) > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidateLine;
      }
    }

    if (currentLine) lines.push(currentLine);

    return lines;
  }

  /** Joins parts with a separator into lines no wider than maxWidth, breaking only between parts unless one alone is too wide. */
  wrapParts(parts: string[], style: TextStyle, maxWidth: number, separator = " · "): string[] {
    const lines: string[] = [];
    let currentLine = "";

    for (const part of parts) {
      const candidateLine = currentLine ? `${currentLine}${separator}${part}` : part;

      if (this.measure(candidateLine, style) <= maxWidth) currentLine = candidateLine;
      else {
        if (currentLine) lines.push(currentLine);

        const pieces = this.wrap(part, style, maxWidth);

        lines.push(...pieces.slice(0, -1));
        currentLine = pieces[pieces.length - 1] ?? "";
      }
    }

    if (currentLine) lines.push(currentLine);

    return lines;
  }

  /** Shortens text with an ellipsis until it fits; used only for names, never for numbers. */
  fit(text: string, style: TextStyle, maxWidth: number): string {
    if (this.measure(text, style) <= maxWidth) return text;

    let shortened = [...text];

    while (shortened.length > 1 && this.measure(`${shortened.join("").trimEnd()}${ELLIPSIS}`, style) > maxWidth)
      shortened = shortened.slice(0, -1);

    return `${shortened.join("").trimEnd()}${ELLIPSIS}`;
  }

  /**
   * One line of text whose baseline starts at (x, y), or ends there when
   * anchored at the end. Returns the SVG of its glyphs.
   */
  draw(text: string, x: number, y: number, style: TextStyle & { fill: string; anchor?: "start" | "end"; halo?: string }): string {
    if (this.realText) return this.textElement(text, x, y, style);

    const scale = style.size / faceOf(style).units_per_em;
    const characters = [...text];
    let penInFontUnits = 0;
    const placements: string[] = [];
    const startX = style.anchor === "end" ? x - this.measure(text, style) : x;

    const trackingInFontUnits = (style.tracking ?? 0) * faceOf(style).units_per_em;

    characters.forEach((character, index) => {
      if (index > 0)
        penInFontUnits += trackingInFontUnits + (style.tabular ? 0 : this.kerningBetween(characters[index - 1], character, style));

      const { key, glyph } = this.glyphFor(character, style);

      if (glyph.path) {
        this.glyphDefinitions.set(key, glyph.path);
        placements.push(`<use href="#g${key}" x="${round(penInFontUnits)}"/>`);
      }

      penInFontUnits += glyph.advance;
    });

    if (placements.length === 0) return "";

    const transform = `translate(${round(startX)} ${round(y)}) scale(${round(scale, 6)} ${round(-scale, 6)})`;

    const halo = style.halo
      ? ` stroke="${style.halo}" stroke-width="${round(HALO_WIDTH / scale)}" stroke-linejoin="round" paint-order="stroke"`
      : "";

    return `<g fill="${style.fill}"${halo} transform="${transform}">${placements.join("")}</g>`;
  }

  private textElement(
    text: string,
    x: number,
    y: number,
    style: TextStyle & { fill: string; anchor?: "start" | "end"; halo?: string },
  ): string {
    if (text === "") return "";

    const attributes = [
      `x="${round(x)}"`,
      `y="${round(y)}"`,
      style.mono ? `font-family='${MONO_FONT_FAMILY}'` : "",
      `font-size="${style.size}"`,
      `font-weight="${style.weight}"`,
      `fill="${style.fill}"`,
      style.anchor === "end" ? 'text-anchor="end"' : "",
      style.tracking ? `letter-spacing="${round(style.tracking * style.size, 2)}"` : "",
      style.tabular && !style.mono ? 'style="font-variant-numeric:tabular-nums"' : "",
      style.halo ? `stroke="${style.halo}" stroke-width="${HALO_WIDTH}" stroke-linejoin="round" paint-order="stroke"` : "",
    ].filter(Boolean);
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return `<text ${attributes.join(" ")}>${escaped}</text>`;
  }

  /** The <defs> holding every glyph drawn so far, in font units with the y axis pointing up. */
  definitions(): string {
    const paths = [...this.glyphDefinitions.entries()]
      .sort(([first], [second]) => (first < second ? -1 : 1))
      .map(([key, path]) => `<path id="g${key}" d="${path}"/>`);

    return paths.length > 0 ? `<defs>${paths.join("")}</defs>` : "";
  }

  charactersWithoutGlyph(): string[] {
    return [...this.missingCharacters];
  }
}

function round(value: number, decimals = 1): string {
  const factor = 10 ** decimals;

  return String(Math.round(value * factor) / factor);
}
