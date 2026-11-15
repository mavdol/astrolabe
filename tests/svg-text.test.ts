import { describe, expect, it } from "vitest";
import { SvgTextRenderer } from "../src/render/svg-text.js";

const body = { weight: 400, size: 20 } as const;

describe("text drawn as paths with the bundled Inter", () => {
  it("applies kerning: T and o sit closer than their widths alone", () => {
    const text = new SvgTextRenderer();

    expect(text.measure("To", body)).toBeLessThan(text.measure("T", body) + text.measure("o", body));
  });

  it("gives every digit the same width with tabular figures, and keeps proportional ones otherwise", () => {
    const text = new SvgTextRenderer();
    const tabular = { ...body, tabular: true };

    expect(text.measure("111", tabular)).toBeCloseTo(text.measure("000", tabular), 6);
    expect(text.measure("111", body)).toBeLessThan(text.measure("000", body));
  });

  it("wraps between words without exceeding the width", () => {
    const text = new SvgTextRenderer();
    const lines = text.wrap("Which JavaScript runtime runs our short command-line scripts faster and with less memory?", body, 300);

    expect(lines.length).toBeGreaterThan(1);

    for (const line of lines) expect(text.measure(line, body)).toBeLessThanOrEqual(300);
  });

  it("defines each glyph once and reuses it", () => {
    const text = new SvgTextRenderer();
    const drawn = text.draw("aaa", 0, 0, { ...body, fill: "#000" });

    expect(drawn.match(/<use /g)).toHaveLength(3);
    expect(text.definitions().match(/<path /g)).toHaveLength(1);
  });

  it("reports characters the font lacks and draws a question mark instead", () => {
    const text = new SvgTextRenderer();

    text.draw("中", 0, 0, { ...body, fill: "#000" });

    expect(text.charactersWithoutGlyph()).toEqual(["中"]);
  });

  it("draws the minus sign and the multiplication sign of the results", () => {
    const text = new SvgTextRenderer();

    text.draw("−10% 2.0×", 0, 0, { ...body, fill: "#000" });

    expect(text.charactersWithoutGlyph()).toEqual([]);
  });
});
