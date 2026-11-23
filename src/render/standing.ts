import type { Comparison, Results } from "../schema/benchmark.js";

/**
 * Where a candidate stands on one part among the others: best when it is better than every other candidate there,
 * tied for best when no candidate is better than it but it is not better than all, behind when another is better.
 * Read from the verdicts between candidates, never from overlapping intervals.
 */
export type Standing = "best" | "tied" | "behind";

/** The primary comparison between two candidates on a metric and a node, whichever side the plan put each on. */
function comparisonBetween(comparisons: Comparison[], metric: string, node: string | undefined, first: string, second: string) {
  return comparisons.find(
    (comparison) =>
      comparison.metric === metric &&
      comparison.node === node &&
      ((comparison.candidate === first && comparison.vs === second) || (comparison.candidate === second && comparison.vs === first)),
  );
}

/** True when the comparison says `subject` is better than the other side, firmly: a likely difference beats no one. */
function isBetter(comparison: Comparison, subject: string): boolean {
  if (comparison.qualifier) return false;

  return comparison.candidate === subject ? comparison.verdict === "better" : comparison.verdict === "worse";
}

/**
 * Each candidate's standing on one part, or undefined when a pair among them was not compared there: the plan must
 * compare every pair for anyone to be called best.
 */
export function standingsOn(
  results: Results,
  metric: string,
  node: string | undefined,
  candidates: string[],
): Map<string, Standing> | undefined {
  const primary = (results.comparisons ?? []).filter((comparison) => comparison.role === "primary");
  const beats = new Map(candidates.map((candidate) => [candidate, new Set<string>()]));

  for (const [index, first] of candidates.entries()) {
    for (const second of candidates.slice(index + 1)) {
      const comparison = comparisonBetween(primary, metric, node, first, second);

      if (!comparison) return undefined;

      if (isBetter(comparison, first)) beats.get(first)!.add(second);

      if (isBetter(comparison, second)) beats.get(second)!.add(first);
    }
  }

  const beaten = new Set(candidates.filter((candidate) => candidates.some((other) => beats.get(other)!.has(candidate))));

  return new Map(
    candidates.map((candidate) => [
      candidate,
      beaten.has(candidate) ? "behind" : beats.get(candidate)!.size === candidates.length - 1 ? "best" : "tied",
    ]),
  );
}

/** True when the plan compares every pair of candidates, so that the page can say who is best rather than who beats the baseline. */
export function comparesEveryPair(results: Results): boolean {
  const ids = results.candidates.map((candidate) => candidate.id);
  const pairs = results.analysis?.pairs ?? "baseline";

  if (pairs === "all") return true;

  if (pairs === "baseline") return false;

  return ids.every((first, index) =>
    ids
      .slice(index + 1)
      .every((second) =>
        pairs.some((pair) => (pair.candidate === first && pair.vs === second) || (pair.candidate === second && pair.vs === first)),
      ),
  );
}

/** The nodes where a metric's primary comparisons sit, in the order they were computed. */
export function primaryNodesOf(results: Results, metric: string): (string | undefined)[] {
  return [
    ...new Set(
      (results.comparisons ?? []).filter((comparison) => comparison.role === "primary" && comparison.metric === metric).map((c) => c.node),
    ),
  ];
}
