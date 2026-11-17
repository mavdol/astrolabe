import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RawFile } from "../compute/raw-data.js";
import type { Benchmark } from "../schema/benchmark.js";
import { cardContentOf, renderCard, type CardMode } from "./card.js";
import type { BuildContext } from "./describe.js";
import { exportFileName, exportPlanOf, pictureHtml, renderImage, type CardFiles } from "./exports.js";
import { renderMarkdown } from "./markdown.js";
import { pngOf } from "./png.js";
import { writeSite, type WrittenSite } from "./site/write-site.js";

export const AVAILABLE_FORMATS = ["site", "md", "svg"] as const;

export type OutputFormat = (typeof AVAILABLE_FORMATS)[number];

const EXPORTS_FOLDER = "exports";

export const SITE_FOLDER = "site";

export interface BuildResult {
  /** Files written, relative to the output folder, with their size in bytes. */
  files: { path: string; bytes: number }[];
  warnings: string[];
  /** The first README card: its text alternative and its files, relative to the output folder. */
  readmeCard?: { altText: string; files: CardFiles };
  site?: WrittenSite;
}

export interface BuildInputs {
  rawFiles?: Record<string, RawFile>;
  /** The benchmark file, so the site carries a copy of it and of its raw files. */
  sourcePath?: string;
  /** The public address of the site, for its link preview. */
  url?: string;
}

/**
 * Writes the outputs of a computed benchmark into the output folder: the README cards
 * (an SVG per mode and a PNG of the first) and the declared images, the Markdown
 * that shows the first card, and the site.
 */
export function buildOutputs(
  benchmark: Benchmark,
  formats: OutputFormat[],
  outputFolder: string,
  context: BuildContext,
  inputs: BuildInputs = {},
): BuildResult {
  const result: BuildResult = { files: [], warnings: [] };
  const write = (relativePath: string, content: string | Buffer) => {
    const path = join(outputFolder, relativePath);

    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
    result.files.push({ path: relativePath, bytes: Buffer.byteLength(content) });
  };

  if (formats.includes("svg")) {
    const plan = exportPlanOf(benchmark);

    for (const skipped of plan.skipped) result.warnings.push(`export "${skipped.id}" skipped: ${skipped.reason}`);

    for (const card of plan.cards) {
      const content = cardContentOf(benchmark, card.blockIds);
      const svgPaths: Partial<Record<CardMode, string>> = {};
      let pngPath = "";
      let altText = "";

      for (const mode of card.modes) {
        const rendered = renderCard(benchmark, content, mode, context);
        const relativePath = `${EXPORTS_FOLDER}/${exportFileName(card.id, mode)}`;

        write(relativePath, rendered.svg);
        svgPaths[mode] = relativePath;
        altText = rendered.altText;

        if (!pngPath) {
          pngPath = `${EXPORTS_FOLDER}/${exportFileName(card.id, mode, "png")}`;
          write(pngPath, pngOf(rendered.svg));
        }

        if (rendered.charactersWithoutGlyph.length > 0) {
          result.warnings.push(
            `card "${card.id}": no glyph in the bundled font for ${rendered.charactersWithoutGlyph.map((character) => `"${character}"`).join(", ")}, drawn as "?"`,
          );
        }
      }

      result.readmeCard ??= { altText, files: { svg: svgPaths, png: pngPath } };
    }

    for (const image of plan.images) {
      for (const mode of image.modes) {
        const chart = renderImage(benchmark, image, mode, context, inputs.rawFiles ?? {});
        const content = image.format === "png" ? pngOf(chart.svg, 1) : chart.svg;

        write(`${EXPORTS_FOLDER}/${exportFileName(image.id, mode, image.format)}`, content);
      }
    }
  }

  if (formats.includes("md")) {
    const cardPicture = result.readmeCard ? pictureHtml(result.readmeCard.altText, result.readmeCard.files) : undefined;

    write("benchmark.md", renderMarkdown(benchmark, { ...context, cardPicture }));
  }

  if (formats.includes("site")) {
    const site = writeSite(benchmark, context, inputs, (relativePath, content) => write(`${SITE_FOLDER}/${relativePath}`, content));

    result.warnings.push(...site.warnings);
    result.site = site;
  }

  return result;
}
