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

const FONT = interFont as unknown as {
  units_per_em: number;
  ascender: number;
  descender: number;
  cap_height: number;
  weights: Record<string, WeightData>;
};

export const CAP_HEIGHT_RATIO = FONT.cap_height / FONT.units_per_em;

const MISSING_CHARACTER = "?";
const ELLIPSIS = "…";

export interface TextStyle {
  weight: FontWeight;
  size: number;
  /** Tabular figures: every digit has the same width, so numbers line up in columns. */
  tabular?: boolean;
  /** Letter spacing in em: negative tightens large figures, positive opens small capitals. */
  tracking?: number;
}

/**
 * Draws text as paths with the bundled Inter, so a standalone SVG looks the
 * same on every device. Each glyph is defined once in <defs> and reused.
 */
export class SvgTextRenderer {
  private readonly glyphDefinitions = new Map<string, string>();
  private readonly missingCharacters = new Set<string>();

  private glyphFor(character: string, style: TextStyle): { key: string; glyph: Glyph } {
    const weightData = FONT.weights[String(style.weight)];
    const tabularGlyph = style.tabular ? weightData.tabular[character] : undefined;

    if (tabularGlyph) return { key: `${style.weight}t${character.codePointAt(0)}`, glyph: tabularGlyph };

    const glyph = weightData.glyphs[character];

    if (glyph) return { key: `${style.weight}-${character.codePointAt(0)}`, glyph };

    this.missingCharacters.add(character);

    return this.glyphFor(MISSING_CHARACTER, style);
  }

  private kerningBetween(left: string, right: string, style: TextStyle): number {
    return FONT.weights[String(style.weight)].kerning[left + right] ?? 0;
  }

  measure(text: string, style: TextStyle): number {
    const characters = [...text];
    let widthInFontUnits = 0;

    const trackingInFontUnits = (style.tracking ?? 0) * FONT.units_per_em;

    characters.forEach((character, index) => {
      widthInFontUnits += this.glyphFor(character, style).glyph.advance;

      if (index > 0)
        widthInFontUnits += trackingInFontUnits + (style.tabular ? 0 : this.kerningBetween(characters[index - 1], character, style));
    });

    return (widthInFontUnits * style.size) / FONT.units_per_em;
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
  draw(text: string, x: number, y: number, style: TextStyle & { fill: string; anchor?: "start" | "end" }): string {
    const scale = style.size / FONT.units_per_em;
    const characters = [...text];
    let penInFontUnits = 0;
    const placements: string[] = [];
    const startX = style.anchor === "end" ? x - this.measure(text, style) : x;

    const trackingInFontUnits = (style.tracking ?? 0) * FONT.units_per_em;

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

    return `<g fill="${style.fill}" transform="${transform}">${placements.join("")}</g>`;
  }

  /** The <defs> holding every glyph drawn so far, in font units with the y axis pointing up. */
  definitions(): string {
    const paths = [...this.glyphDefinitions.entries()]
      .sort(([first], [second]) => (first < second ? -1 : 1))
      .map(([key, path]) => `<path id="g${key}" d="${path}"/>`);

    return `<defs>${paths.join("")}</defs>`;
  }

  charactersWithoutGlyph(): string[] {
    return [...this.missingCharacters];
  }
}

function round(value: number, decimals = 1): string {
  const factor = 10 ** decimals;

  return String(Math.round(value * factor) / factor);
}
