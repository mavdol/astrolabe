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

  it("breaks a line of parts between parts, and inside a part only when it is too wide alone", () => {
    const text = new SvgTextRenderer();
    const parts = ["github.com/example/support", "results 0123456789ab", "2026-11-21", "Built with Astrolabe"];
    const lines = text.wrapParts(parts, body, 420);

    expect(lines.join(" · ")).toBe(parts.join(" · "));
    expect(lines.every((line) => parts.some((part) => line.startsWith(part)))).toBe(true);
    expect(text.wrapParts(["a rather long part that cannot fit on one line"], body, 120).length).toBeGreaterThan(1);
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

describe("text drawn as paths with the bundled Geist Mono", () => {
  const mono = { weight: 400, size: 10, mono: true } as const;

  it("gives every character the same width, in a standalone file as in a page", () => {
    const paths = new SvgTextRenderer();
    const page = new SvgTextRenderer({ realText: true });

    expect(paths.measure("0000", mono)).toBeCloseTo(24, 6);
    expect(paths.measure("iiii", mono)).toBeCloseTo(paths.measure("MMMM", mono), 6);
    expect(page.measure("iiii", mono)).toBeCloseTo(paths.measure("iiii", mono), 6);
  });

  it("draws its own glyphs, apart from Inter's, and names the face in a page", () => {
    const paths = new SvgTextRenderer();

    paths.draw("0", 0, 0, { ...mono, fill: "#000" });
    paths.draw("0", 0, 0, { weight: 400, size: 10, fill: "#000" });

    expect(paths.definitions().match(/<path /g)).toHaveLength(2);
    expect(paths.charactersWithoutGlyph()).toEqual([]);
    expect(new SvgTextRenderer({ realText: true }).draw("0", 0, 0, { ...mono, fill: "#000" })).toContain('font-family=\'"Geist Mono"');
  });
});
