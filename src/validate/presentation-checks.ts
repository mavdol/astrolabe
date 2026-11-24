import type { Issue } from "../rules/registry.js";
import { lookupOf, resolveTemplates, type EffectFormat } from "../render/describe.js";
import type { Benchmark, Comparison } from "../schema/benchmark.js";
import { defaultCountOf, levelsOf, summaryChartOf } from "../render/summary.js";

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
  count?: string;
  vs?: string;
  rows?: string;
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

  if (results.candidates.length >= 3) checkEveryCandidateInItsOwnRight(benchmark, blocks, error);

  checkNothingRepeated(benchmark, blocks, warning);

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
      const countsBest = (block.count ?? defaultCountOf(results)) === "best";
      const strangers = (named ?? []).filter(
        (candidate) => !knownIds.candidate.has(String(candidate)) || (!countsBest && candidate === results.baseline),
      );

      if (strangers.length > 0)
        error(
          "S7",
          `${path}.candidates`,
          `${strangers.map((candidate) => `"${String(candidate)}"`).join(", ")}: not a candidate ${countsBest ? "of the benchmark" : "compared with the baseline"}`,
        );
      else if (!knownIds.metric.has(block.metric ?? ""))
        error("S7", `${path}.metric`, `"${String(block.metric)}" is not the id of a metric`);
      else if (countsBest) {
        const [summary] = summaryChartOf(results, {
          metric: block.metric!,
          candidates: named as string[] | undefined,
          count: "best",
        }).summaries;
        const parts = summary?.standings?.length ?? 0;
        const levels = summary ? [...levelsOf(results, summary)] : [];

        if (parts === 0)
          error(
            "S11",
            path,
            `a summary that counts who is best needs every pair of its candidates compared on "${String(block.metric)}": set analysis.pairs to "all", or name the pairs, and run astrolabe compute`,
          );
        else if (levels.length > 1)
          error(
            "S11",
            path,
            `the parts counted on "${String(block.metric)}" sit on several levels (${levels.map((level) => level ?? "the whole benchmark").join(", ")}): a summary counts one level, so that a total is not counted with its parts`,
          );
      } else
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

/** Blocks that show each candidate as a change against one other: read before the results, they make that one the measure of all. */
const showsChangesAgainstOne = (block: Block) =>
  (block.type === "chart" && (block.chart === "effect" || block.chart === "comparison-rows")) ||
  (block.type === "table" && block.cells === "effects");

/**
 * With three candidates or more, every candidate is compared in its own right: its results drawn beside the others'
 * before any change against one of them, and a summary counting where each stands among them all.
 */
function checkEveryCandidateInItsOwnRight(
  benchmark: Benchmark,
  blocks: Block[],
  error: (rule: string, path: string, message: string) => void,
): void {
  const pageOrder = [...new Set([...(benchmark.layout ?? []).flat(), ...blocks.map((block) => block.id)])].flatMap(
    (blockId) => blocks.find((block) => block.id === blockId) ?? [],
  );
  const firstResults = pageOrder.findIndex((block) => block.type === "chart" && block.chart === "results");
  const pathOf = (block: Block) => `blocks[${blocks.indexOf(block)}]`;

  pageOrder.forEach((block, position) => {
    if (block.type === "summary" && block.count === "verdicts")
      error(
        "V57",
        `${pathOf(block)}.count`,
        `with ${benchmark.results.candidates.length} candidates, a summary counts where each one stands among them all, not its verdicts against one: remove "count", or set it to "best"`,
      );

    if (showsChangesAgainstOne(block) && (firstResults === -1 || position < firstResults))
      error(
        "V57",
        pathOf(block),
        `"${block.id}" shows changes against one candidate ${firstResults === -1 ? "on a page that never draws" : "before"} every candidate's results side by side: add a results chart ("chart": "results") above it, so each candidate is read in its own right`,
      );
  });
}

const pageOrderOf = (benchmark: Benchmark, blocks: Block[]) =>
  [...new Set([...(benchmark.layout ?? []).flat(), ...blocks.map((block) => block.id)])].flatMap(
    (blockId) => blocks.find((block) => block.id === blockId) ?? [],
  );

/**
 * Each block says something the page has not shown yet: a table of values beside the results charts that already draw
 * its metrics on its parts, or a second section of changes on the same metric and parts, only makes the page longer.
 */
function checkNothingRepeated(benchmark: Benchmark, blocks: Block[], warning: (rule: string, path: string, message: string) => void): void {
  const pageOrder = pageOrderOf(benchmark, blocks);
  const pathOf = (block: Block) => `blocks[${blocks.indexOf(block)}]`;
  const keyOf = (metric: string, level: string | undefined) => `${metric}\u0000${level ?? ""}`;
  const resultsByKey = new Map<string, string>();
  const changesByKey = new Map<string, string>();
  const baseline = benchmark.results.baseline;
  const nameOf = (candidate: string) => benchmark.results.candidates.find((entry) => entry.id === candidate)?.name ?? candidate;

  for (const block of pageOrder) {
    if (block.type === "chart" && block.chart === "results" && block.metric)
      resultsByKey.set(keyOf(block.metric, block.breakdown), resultsByKey.get(keyOf(block.metric, block.breakdown)) ?? block.id);

    const changeKeys =
      block.type === "chart" && block.chart === "effect" && block.metric
        ? [keyOf(block.metric, block.breakdown)]
        : block.type === "table" && block.cells === "effects"
          ? (block.metrics ?? []).map((metric) => keyOf(metric, block.rows))
          : [];

    if (changeKeys.length > 0) {
      const earlier = changeKeys.map((key) => changesByKey.get(key));

      if (earlier.every(Boolean))
        warning(
          "V40",
          pathOf(block),
          `"${block.id}" shows again the changes "${earlier[0]}" shows, on the same metrics and parts, against ${nameOf(block.vs ?? baseline)}: one section of changes says it, against the candidate the question measures from; remove one`,
        );

      for (const key of changeKeys) if (!changesByKey.has(key)) changesByKey.set(key, block.id);
    }
  }

  for (const block of pageOrder) {
    if (block.type !== "table" || block.cells === "effects") continue;

    const drawnBy = (block.metrics ?? []).map((metric) => resultsByKey.get(keyOf(metric, block.rows)));

    if (drawnBy.length > 0 && drawnBy.every(Boolean))
      warning(
        "V40",
        pathOf(block),
        `"${block.id}" lists the values ${[...new Set(drawnBy)].map((id) => `"${id}"`).join(" and ")} already draw${drawnBy.length > 1 ? "" : "s"} with their intervals, and each chart's data is one click away under it: remove the table`,
      );
  }
}
