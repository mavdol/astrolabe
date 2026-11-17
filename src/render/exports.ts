import type { Benchmark } from "../schema/benchmark.js";
import type { ChartBlock } from "../schema/presentation.js";
import type { CardMode } from "./card.js";
import { defaultFilterState, type FilterState } from "./chart/chart-data.js";
import { DRAWN_CHART_TYPES } from "./chart/render-chart.js";

export interface PlannedCard {
  id: string;
  modes: CardMode[];
  /** Headline blocks to show; absent for the default card, which shows the primary comparisons. */
  blockIds?: string[];
}

/** A chart drawn alone at a set shape, for a social post or a link preview. */
export interface PlannedImage {
  id: string;
  block: ChartBlock;
  size: ImageSize;
  format: "svg" | "png";
  modes: CardMode[];
  filterState: FilterState;
}

export interface ExportPlan {
  cards: PlannedCard[];
  images: PlannedImage[];
  skipped: { id: string; reason: string }[];
}

/**
 * The shapes of an image that travels alone, in px of the file. The chart is laid out at a smaller
 * size and enlarged, so that its smallest text stays readable once the image is shown in a feed.
 */
export const IMAGE_SIZES = {
  wide: { width: 1200, height: 630, layoutWidth: 800 },
  square: { width: 1080, height: 1080, layoutWidth: 720 },
} as const;

export type ImageSize = keyof typeof IMAGE_SIZES;

const DEFAULT_CARD_ID = "readme-card";

function modesOf(mode: string | undefined, whenUnset: CardMode[]): CardMode[] {
  if (mode === "light" || mode === "dark") return [mode];

  return mode === "both" ? ["light", "dark"] : whenUnset;
}

/**
 * What build writes besides the Markdown: each export the file declares,
 * or a default README card in both modes when it declares no export at all.
 */
export function exportPlanOf(benchmark: Benchmark): ExportPlan {
  const declared = benchmark.exports ?? [];

  if (declared.length === 0) return { cards: [{ id: DEFAULT_CARD_ID, modes: ["light", "dark"] }], images: [], skipped: [] };

  const plan: ExportPlan = { cards: [], images: [], skipped: [] };
  const blockById = new Map((benchmark.blocks ?? []).map((block) => [block.id, block]));

  for (const entry of declared) {
    const skip = (reason: string) => plan.skipped.push({ id: entry.id, reason });

    if (entry.size === "banner") {
      if (entry.format === "svg") plan.cards.push({ id: entry.id, modes: modesOf(entry.mode, ["light", "dark"]), blockIds: entry.blocks });
      else skip("a banner is written as SVG, with its PNG beside it: set its format to svg");

      continue;
    }

    const block = blockById.get(entry.blocks[0]);

    if (entry.blocks.length !== 1 || !block) skip(`a ${entry.size} image shows one existing block`);
    else if (block.type !== "chart") skip(`${block.type} blocks cannot be drawn as a ${entry.size} image yet`);
    else if (!DRAWN_CHART_TYPES.includes(block.chart)) skip(`${block.chart} charts are not available yet`);
    else
      plan.images.push({
        id: entry.id,
        block,
        size: entry.size,
        format: entry.format,
        modes: modesOf(entry.mode, ["light"]),
        filterState: { ...defaultFilterState(benchmark), ...entry.filter_state },
      });
  }

  return plan;
}

export const exportFileName = (exportId: string, mode: CardMode, extension: "svg" | "png" = "svg") => `${exportId}-${mode}.${extension}`;

export interface CardFiles {
  svg: Partial<Record<CardMode, string>>;
  /** The PNG of the first mode, for readers that cannot show an SVG from a repository. */
  png: string;
}

/**
 * The <picture> that shows the card. Browsers take the SVG that matches the
 * reader's light or dark setting; the GitHub mobile app, which shows neither
 * an SVG from a repository nor the setting, takes the PNG of the <img>.
 */
export function pictureHtml(altText: string, files: CardFiles, linkTo?: string): string {
  const alt = altText.replace(/"/g, "&quot;");
  const sources = Object.entries(files.svg).map(([mode, path]) =>
    files.svg.light && files.svg.dark
      ? `  <source media="(prefers-color-scheme: ${mode})" srcset="${path}">`
      : `  <source srcset="${path}">`,
  );
  const image = ["<picture>", ...sources, `  <img alt="${alt}" src="${files.png}">`, "</picture>"].join("\n");

  return linkTo ? `<a href="${linkTo}">\n${image}\n</a>` : image;
}
