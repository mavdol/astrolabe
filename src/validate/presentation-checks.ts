import type { Issue } from "../rules/registry.js";
import type { Benchmark, Comparison } from "../schema/benchmark.js";

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
}

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

  const blockIds = blocks.map((block) => block.id);

  for (const duplicated of new Set(blockIds.filter((id, index) => blockIds.indexOf(id) !== index))) {
    error("schema", "blocks", `the block id "${duplicated}" is used more than once`);
  }

  (benchmark.layout ?? []).forEach((row, rowIndex) => {
    for (const blockId of row)
      if (!blockIds.includes(blockId)) error("V38", `layout[${rowIndex}]`, `"${blockId}" is not the id of a block`);
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

    if (block.type === "headline") requirePrimary(block.comparison, `${path}.comparison`, "a headline");

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
      }
    }
  });

  return issues;
}
