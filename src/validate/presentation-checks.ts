import type { Issue } from "../rules/registry.js";
import { lookupOf, resolveTemplates, type EffectFormat } from "../render/describe.js";
import type { Benchmark, Comparison } from "../schema/benchmark.js";
import { levelsOf, summaryChartOf } from "../render/summary.js";

const TEMPLATE = /\{(\w+):([^}]+)\}/g;
const TRUST_BLOCK_TYPES = new Set(["methodology", "environment", "limitations", "provenance"]);

interface Block {
  id: string;
  type: string;
  title?: unknown;
  description?: unknown;
  comparison?: unknown;
  comparisons?: unknown;
  asserts?: unknown;
  metrics?: string[];
  cells?: string;
  chart?: string;
  breakdown?: string;
  node?: string;
  filters?: string[];
  candidates?: unknown;
  metric?: string;
  show?: string[];
  effect_format?: EffectFormat;
}

/** A claim read at a glance: one line on the page, the card and the images. */
const LONGEST_TITLE = 60;
const BLOCKS_WITH_WRITTEN_TITLES = new Set(["headline", "chart", "text"]);

function verdictLabel(comparison: Comparison): string {
  return comparison.qualifier ? `${comparison.qualifier} ${comparison.verdict}` : comparison.verdict;
}

/**
 * The checks on blocks that depend on computed verdicts: templates resolve,
 * headlines and asserted titles rely on primary comparisons only, and an
 * asserted verdict still holds. Whether each chart can be drawn is checked in chart-checks.
 */
export function checkPresentation(benchmark: Benchmark): Issue[] {
  const issues: Issue[] = [];
  const error = (rule: string, path: string, message: string) => issues.push({ severity: "error", rule, path, message });
  const warning = (rule: string, path: string, message: string) => issues.push({ severity: "warning", rule, path, message });
  const blocks = (benchmark.blocks ?? []) as Block[];
  const results = benchmark.results;
  const comparisonById = new Map((results.comparisons ?? []).map((comparison) => [comparison.id, comparison]));
  const knownIds: Record<string, Set<string>> = {
    candidate: new Set(results.candidates.map((candidate) => candidate.id)),
    metric: new Set(results.metrics.map((metric) => metric.id)),
    node: new Set((results.structure?.nodes ?? []).map((node) => node.id)),
    effect: new Set(comparisonById.keys()),
    verdict: new Set(comparisonById.keys()),
  };

  const lookup = lookupOf(results);
  const blockIds = blocks.map((block) => block.id);

  for (const duplicated of new Set(blockIds.filter((id, index) => blockIds.indexOf(id) !== index))) {
    error("schema", "blocks", `the block id "${duplicated}" is used more than once`);
  }

  (benchmark.layout ?? []).forEach((row, rowIndex) => {
    for (const blockId of row)
      if (!blockIds.includes(blockId)) error("V38", `layout[${rowIndex}]`, `"${blockId}" is not the id of a block`);
  });

  blocks.forEach((block, blockIndex) => {
    if (block.type !== "table") return;

    const metrics = new Set(block.metrics ?? []);
    const show = new Set(block.show ?? []);

    if (block.cells === "effects") {
      const effects = (results.comparisons ?? []).filter((comparison) => metrics.has(comparison.metric));

      if (effects.length === 0)
        error("V31", `blocks[${blockIndex}].cells`, "a table of effects needs comparisons on its metrics: run astrolabe compute");
      else if (!show.has("ci") && effects.some((comparison) => comparison.ci))
        error("V31", `blocks[${blockIndex}].show`, 'the table of effects leaves out "ci": an effect is only weighed with its interval');

      return;
    }

    const values = (results.values ?? []).filter((value) => metrics.has(value.metric));
    const missing = [
      show.has("n") ? "" : "n",
      !show.has("ci") && values.some((value) => value.ci) ? "ci" : "",
      !show.has("failures") && (results.failures ?? []).some((failure) => metrics.has(failure.metric) && failure.count > 0)
        ? "failures"
        : "",
    ].filter(Boolean);

    if (missing.length > 0)
      error(
        "V31",
        `blocks[${blockIndex}].show`,
        `the table leaves out ${missing.join(", ")}: a value is only weighed with its observations, its interval and its failures`,
      );
  });

  const requirePrimary = (comparisonId: unknown, path: string, usedFor: string) => {
    const comparison = typeof comparisonId === "string" ? comparisonById.get(comparisonId) : undefined;

    if (!comparison) {
      error("S7", path, `"${String(comparisonId)}" is not the id of a comparison`);

      return undefined;
    }

    if (comparison.role !== "primary") {
      error(
        "S11",
        path,
        `"${comparison.id}" is exploratory: ${usedFor} may only rely on primary comparisons, declared in analysis.primary before measuring`,
      );
    }

    return comparison;
  };

  blocks.forEach((block, blockIndex) => {
    if (TRUST_BLOCK_TYPES.has(block.type)) return;

    const path = `blocks[${blockIndex}]`;

    for (const textField of ["title", "description"] as const) {
      const text = block[textField];

      if (typeof text !== "string") continue;

      for (const [, kind, id] of text.matchAll(TEMPLATE)) {
        if (!knownIds[kind])
          error("V26", `${path}.${textField}`, `unknown template "{${kind}:…}": use candidate, metric, node, effect or verdict`);
        else if (!knownIds[kind].has(id))
          error(
            "V26",
            `${path}.${textField}`,
            `"{${kind}:${id}}" does not name an existing ${kind === "effect" || kind === "verdict" ? "comparison" : kind}`,
          );
      }
    }

    const isHeadlineOrChart = block.type === "headline" || block.type === "chart";

    if (isHeadlineOrChart && typeof block.title === "string" && /\d/.test(block.title.replace(TEMPLATE, ""))) {
      error(
        "V26",
        `${path}.title`,
        "a number is typed in the title: numbers come from {effect:id}, and names that contain a digit from {metric:id}",
      );
    }

    if (BLOCKS_WITH_WRITTEN_TITLES.has(block.type) && typeof block.title === "string") {
      const shownTitle = resolveTemplates(block.title, lookup, block.effect_format);

      if (shownTitle.length > LONGEST_TITLE)
        warning(
          "V25",
          `${path}.title`,
          `the title reads "${shownTitle}", ${shownTitle.length} characters: keep the claim to ${LONGEST_TITLE} at most, and move the rest to the reading in description`,
        );
    }

    if (block.type === "headline") requirePrimary(block.comparison, `${path}.comparison`, "a headline");

    if (block.type === "summary") {
      const named = Array.isArray(block.candidates) ? (block.candidates as unknown[]) : undefined;
      const strangers = (named ?? []).filter((candidate) => !knownIds.candidate.has(String(candidate)) || candidate === results.baseline);

      if (strangers.length > 0)
        error(
          "S7",
          `${path}.candidates`,
          `${strangers.map((candidate) => `"${String(candidate)}"`).join(", ")}: not a candidate compared with the baseline`,
        );
      else if (!knownIds.metric.has(block.metric ?? ""))
        error("S7", `${path}.metric`, `"${String(block.metric)}" is not the id of a metric`);
      else
        for (const summary of summaryChartOf(results, { metric: block.metric!, candidates: named as string[] | undefined }).summaries) {
          const counted = summary.comparisons;
          const levels = [...levelsOf(results, summary)];

          if (counted.length >= 2 && levels.length > 1)
            error(
              "S11",
              path,
              `the primary comparisons of "${summary.candidate}" on "${summary.metric}" sit on several levels (${levels.map((level) => level ?? "the whole benchmark").join(", ")}): a summary counts one level, so that a total is not counted with its parts; use headlines`,
            );
          else if (counted.length < 2)
            error(
              "S11",
              path,
              `a summary counts the primary comparisons of "${summary.candidate}" on "${summary.metric}", and there ${counted.length === 1 ? "is one" : "are none"}: ${counted.length === 1 ? `use a headline on "${counted[0].id}"` : `name the other candidates in "candidates", declare the comparisons in analysis.primary, or summarize another metric`}`,
            );
        }
    }

    if (block.asserts !== undefined && typeof block.asserts === "object" && block.asserts !== null) {
      for (const [comparisonId, assertedVerdict] of Object.entries(block.asserts)) {
        const comparison = requirePrimary(comparisonId, `${path}.asserts`, "a title that states a result");
        const assertionHolds = comparison && (assertedVerdict === comparison.verdict || assertedVerdict === verdictLabel(comparison));

        if (comparison && !assertionHolds) {
          error(
            "V25",
            `${path}.asserts`,
            `the title relies on "${comparisonId}" being "${String(assertedVerdict)}", but the computed verdict is "${verdictLabel(comparison)}": rewrite the title`,
          );
        }

        const words = `${String(block.title ?? "")} ${String(block.description ?? "")}`;
        const saysTheQualifier =
          words.includes(`{verdict:${comparisonId}}`) || new RegExp(`\\b${comparison?.qualifier ?? ""}\\b`, "i").test(words);

        // Checked on the words, whichever form asserts takes: "likely better" asserted under a title that says "more" is still a firmer claim.
        if (comparison?.qualifier && assertionHolds && !saysTheQualifier)
          warning(
            "V25",
            `${path}.asserts`,
            `the title relies on "${comparisonId}", whose verdict is "${verdictLabel(comparison)}", but neither the title nor the reading says "${comparison.qualifier}": write it${assertedVerdict === comparison.verdict ? `, and assert "${verdictLabel(comparison)}"` : ""}`,
          );
      }
    }
  });

  return issues;
}
