import type { Benchmark } from "../schema/benchmark.js";
import type { CardMode } from "./card.js";

export interface PlannedCard {
  id: string;
  modes: CardMode[];
  /** Headline blocks to show; absent for the default card, which shows the primary comparisons. */
  blockIds?: string[];
}

export interface ExportPlan {
  cards: PlannedCard[];
  skipped: { id: string; reason: string }[];
}

interface DeclaredExport {
  id: string;
  blocks?: string[];
  format?: string;
  size?: string;
  mode?: string;
}

const DEFAULT_CARD_ID = "readme-card";

function modesOf(mode: string | undefined): CardMode[] {
  if (mode === "light" || mode === "dark") return [mode];

  return ["light", "dark"];
}

/**
 * What build writes besides the Markdown: each SVG banner the file declares,
 * or a default README card in both modes when it declares no export at all.
 */
export function exportPlanOf(benchmark: Benchmark): ExportPlan {
  const declared = (benchmark.exports ?? []) as DeclaredExport[];

  if (declared.length === 0) return { cards: [{ id: DEFAULT_CARD_ID, modes: ["light", "dark"] }], skipped: [] };

  const plan: ExportPlan = { cards: [], skipped: [] };

  for (const entry of declared) {
    const isSvgBanner = (entry.format ?? "svg") === "svg" && (entry.size ?? "banner") === "banner";

    if (isSvgBanner) plan.cards.push({ id: entry.id, modes: modesOf(entry.mode), blockIds: entry.blocks });
    else plan.skipped.push({ id: entry.id, reason: `${entry.format ?? "svg"} ${entry.size ?? "banner"} exports are not available yet` });
  }

  return plan;
}

export const cardFileName = (cardId: string, mode: CardMode, extension: "svg" | "png" = "svg") => `${cardId}-${mode}.${extension}`;

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
