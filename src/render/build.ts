import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Benchmark } from "../schema/benchmark.js";
import { cardContentOf, renderCard, type CardMode } from "./card.js";
import type { BuildContext } from "./describe.js";
import { renderChart } from "./chart/render-chart.js";
import { exportFileName, exportPlanOf, IMAGE_SIZES, pictureHtml, type CardFiles } from "./exports.js";
import { renderMarkdown } from "./markdown.js";
import { pngOf } from "./png.js";

export const AVAILABLE_FORMATS = ["md", "svg"] as const;

export type OutputFormat = (typeof AVAILABLE_FORMATS)[number];

const EXPORTS_FOLDER = "exports";

export interface BuildResult {
  /** Files written, relative to the output folder, with their size in bytes. */
  files: { path: string; bytes: number }[];
  warnings: string[];
  /** The first README card: its text alternative and its files, relative to the output folder. */
  readmeCard?: { altText: string; files: CardFiles };
}

/**
 * Writes the outputs of a computed benchmark into the output folder: the
 * README cards (an SVG per mode and a PNG of the first), then the Markdown
 * that shows the first card.
 */
export function buildOutputs(benchmark: Benchmark, formats: OutputFormat[], outputFolder: string, context: BuildContext): BuildResult {
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
      const { width, height, layoutWidth } = IMAGE_SIZES[image.size];
      const enlargement = width / layoutWidth;

      for (const mode of image.modes) {
        const chart = renderChart(
          benchmark,
          image.block,
          {
            width: layoutWidth,
            height: Math.round(height / enlargement),
            mode,
            filterState: image.filterState,
            standalone: true,
            enlargement,
          },
          context,
        );
        const content = image.format === "png" ? pngOf(chart.svg, 1) : chart.svg;

        write(`${EXPORTS_FOLDER}/${exportFileName(image.id, mode, image.format)}`, content);
      }
    }
  }

  if (formats.includes("md")) {
    const cardPicture = result.readmeCard ? pictureHtml(result.readmeCard.altText, result.readmeCard.files) : undefined;

    write("benchmark.md", renderMarkdown(benchmark, { ...context, cardPicture }));
  }

  return result;
}
