import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, normalize, resolve } from "node:path";
import type { RawFile } from "../../compute/raw-data.js";
import type { Benchmark } from "../../schema/benchmark.js";
import { THEME } from "../../themes/astrolabe.js";
import type { Comparison } from "../../schema/benchmark.js";
import { cardAltText, cardContentOf, MAX_HEADLINES, measuredOf, pairOf, renderCard } from "../card.js";
import { effectAndInterval, lookupOf, lowerFirstLetterOfWord, verdictLabel, type BuildContext } from "../describe.js";
import { exportPlanOf, IMAGE_SIZES, renderImage } from "../exports.js";
import { pngOf } from "../png.js";
import { toneOf } from "./headline-figure.js";
import { renderPage, type PageHead } from "./page.js";
import { FONT_FILES, pageStyle } from "./page-style.js";

const ASSETS = new URL("../../../assets/", import.meta.url);
const PREVIEW_IMAGE = "preview.png";
/** Above this much raw data, a copy in the site is heavy for a host and for a reader's download. */
const LARGEST_EVIDENCE_COPY_BYTES = 25 * 1024 * 1024;
const CARD_MARGIN = 0.08;

export interface WrittenSite {
  /** Files copied from outside the generator, so the user sees what becomes public. */
  copied: string[];
  warnings: string[];
}

/** Where a raw file goes in the site: its own path when it stays inside the benchmark folder, else under data/. */
function evidencePathOf(rawPath: string, rawId: string): string {
  const relative = normalize(rawPath).replace(/\\/g, "/");

  return isAbsolute(rawPath) || relative.startsWith("..") ? `data/${rawId}-${basename(rawPath)}` : relative;
}

/** The README card of the first headline, centred on an image of the link preview's shape. */
function cardPreviewSvg(benchmark: Benchmark, context: BuildContext): { svg: string; alt: string } {
  const firstHeadline = (benchmark.blocks ?? []).find((block) => block.type === "headline");
  const content = firstHeadline ? cardContentOf(benchmark, [firstHeadline.id]) : cardContentOf(benchmark);
  const card = renderCard(benchmark, content, "light", context);
  const [cardWidth, cardHeight] = [/width="(\d+)"/, /height="(\d+)"/].map((pattern) => Number(pattern.exec(card.svg)![1]));
  const { width, height } = IMAGE_SIZES.wide;
  const scale = Math.min((width * (1 - 2 * CARD_MARGIN)) / cardWidth, (height * (1 - 2 * CARD_MARGIN)) / cardHeight);
  const [placedWidth, placedHeight] = [cardWidth * scale, cardHeight * scale];
  const placed = card.svg.replace(
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/,
    `<svg x="${(width - placedWidth) / 2}" y="${(height - placedHeight) / 2}" width="${placedWidth}" height="${placedHeight}"`,
  );

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${THEME.light.background}"/>${placed}</svg>`,
    alt: cardAltText(benchmark, content),
  };
}

/** The image a shared link shows: the first wide PNG the file declares, or else its first headline. */
function previewImageOf(benchmark: Benchmark, context: BuildContext, rawFiles: Record<string, RawFile>): { png: Buffer; alt: string } {
  const wideImage = exportPlanOf(benchmark).images.find((image) => image.size === "wide" && image.format === "png");

  if (wideImage) {
    const chart = renderImage(benchmark, wideImage, "light", context, rawFiles);

    return { png: pngOf(chart.svg, 1), alt: chart.altText };
  }

  const card = cardPreviewSvg(benchmark, context);

  return { png: pngOf(card.svg, 1), alt: card.alt };
}

/**
 * The answer in one sentence, from every primary comparison: the claims a reader came for, each with
 * the group it is measured on, its effect and its verdict.
 */
const VERDICTS_IN_READING_ORDER = ["better", "likely better", "equivalent", "inconclusive", "likely worse", "worse"];

/** The comparisons the answer names: those the page leads with when there are more than a card holds. */
function namedClaimsOf(benchmark: Benchmark, claims: Comparison[]): Comparison[] {
  if (claims.length <= MAX_HEADLINES) return claims;

  const headlined = (benchmark.blocks ?? []).flatMap((block) =>
    block.type === "headline" && "comparison" in block ? claims.filter((claim) => claim.id === block.comparison) : [],
  );

  return (headlined.length > 0 ? [...new Set(headlined)] : claims).slice(0, MAX_HEADLINES);
}

/** A piece of the answer: a claim carries the tone of its verdict, so the page can colour it beside its words. */
export interface AnswerPart {
  text: string;
  tone?: "good" | "bad" | "neutral";
  /** The count of the claims left out, said after the answer rather than in it. */
  aside?: boolean;
}

export function answerPartsOf(benchmark: Benchmark): AnswerPart[] {
  const lookup = lookupOf(benchmark.results);
  const claims = (benchmark.results.comparisons ?? []).filter((comparison) => comparison.role === "primary");
  const named = namedClaimsOf(benchmark, claims);
  const others = claims.filter((claim) => !named.includes(claim));
  const byPair = new Map<string, Comparison[]>();

  for (const comparison of named) byPair.set(pairOf(lookup, comparison), [...(byPair.get(pairOf(lookup, comparison)) ?? []), comparison]);

  const parts: AnswerPart[] = [];

  [...byPair.entries()].forEach(([pair, comparisons], index) => {
    parts.push({ text: `${index > 0 ? " " : ""}${pair}: ` });
    comparisons.forEach((comparison, position) => {
      const metric = lookup.metricById.get(comparison.metric)!;

      parts.push({ text: `${position > 0 ? "; " : ""}${lowerFirstLetterOfWord(measuredOf(lookup, comparison))} ` });
      parts.push({ text: `${effectAndInterval(metric, comparison).effect}, ${verdictLabel(comparison)}`, tone: toneOf(comparison) });
    });
    parts.push({ text: "." });
  });

  if (others.length > 0) {
    const counts = VERDICTS_IN_READING_ORDER.flatMap((verdict) => {
      const count = others.filter((claim) => verdictLabel(claim) === verdict).length;

      return count > 0 ? [`${count} ${verdict}`] : [];
    });

    parts.push({ text: ` ${others.length} more primary comparison${others.length === 1 ? "" : "s"}: ${counts.join(", ")}.`, aside: true });
  }

  return parts;
}

export const answerOf = (benchmark: Benchmark) =>
  answerPartsOf(benchmark)
    .map((part) => part.text)
    .join("");

/**
 * The site in one folder: the page with every filter state, its style, script and font, a copy of the
 * benchmark file and its raw data so a reader can check them, and what a host needs to serve it as it is.
 */
export function writeSite(
  benchmark: Benchmark,
  context: BuildContext,
  inputs: { rawFiles?: Record<string, RawFile>; sourcePath?: string; url?: string },
  write: (relativePath: string, content: string | Buffer) => void,
): WrittenSite {
  const site: WrittenSite = { copied: [], warnings: [] };
  const rawFiles = inputs.rawFiles ?? {};
  const evidencePaths = new Map<string, string>();
  let evidenceBytes = 0;

  if (inputs.sourcePath) {
    write("benchmark.json", readFileSync(inputs.sourcePath));
    site.copied.push("benchmark.json");

    for (const raw of benchmark.results.raw_data) {
      const source = resolve(dirname(inputs.sourcePath), raw.path);

      if (!existsSync(source)) {
        site.warnings.push(`the raw file "${raw.id}" was not found at ${raw.path}, so the site carries no copy of it`);
        continue;
      }

      const content = readFileSync(source);
      const path = evidencePathOf(raw.path, raw.id);

      write(path, content);
      evidencePaths.set(raw.id, path);
      site.copied.push(path);
      evidenceBytes += content.byteLength;
    }
  } else {
    write("benchmark.json", `${JSON.stringify(benchmark, null, 2)}\n`);
  }

  if (evidenceBytes > LARGEST_EVIDENCE_COPY_BYTES)
    site.warnings.push(
      `the site carries ${Math.round(evidenceBytes / 1024 / 1024)} MB of raw data: a host may refuse it, and readers download it whole`,
    );

  for (const file of FONT_FILES) write(`fonts/${file}`, readFileSync(new URL(`fonts/${file}`, ASSETS)));

  write(
    "page.css",
    pageStyle(
      benchmark.style,
      benchmark.results.candidates.map((candidate) => candidate.id),
    ),
  );
  write("page.js", readFileSync(new URL("site/page.js", ASSETS)));
  write(".nojekyll", "");

  if (!benchmark.blocks || benchmark.blocks.length === 0) {
    site.warnings.push(
      "no blocks declared: the page shows only the first primary comparisons as headlines, with no chart or table; visualization/page.md says how to choose them",
    );
  }

  const description = answerOf(benchmark);
  const head: PageHead = { url: inputs.url, description, answer: answerPartsOf(benchmark) };

  if (inputs.url) {
    const preview = previewImageOf(benchmark, context, rawFiles);

    write(PREVIEW_IMAGE, preview.png);
    head.previewImage = { path: PREVIEW_IMAGE, alt: preview.alt, width: IMAGE_SIZES.wide.width, height: IMAGE_SIZES.wide.height };
  } else {
    site.warnings.push("no --url given: the site works anywhere, but a link to it shared on a social network shows no preview image");
  }

  const modes =
    benchmark.style?.mode === "light" || benchmark.style?.mode === "dark" ? [benchmark.style.mode] : (["light", "dark"] as const);

  write("index.html", renderPage({ benchmark, context, rawFiles, modes: [...modes], evidencePaths }, head));

  return site;
}
