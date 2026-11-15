export type Verdict = "better" | "worse" | "equivalent" | "inconclusive";

export interface VerdictResult {
  verdict: Verdict;
  qualifier?: "likely";
}

/**
 * The verdict of a comparison, read from the stored (rounded) interval of the
 * effect alone; the point estimate plays no part.
 *
 * The interval is first turned into the interval of the gain (sign flipped
 * when lower is better). Boundaries: "inside" is strict (−mm < end < mm),
 * "past" includes the boundary (end >= mm), "excludes zero" is strict.
 * Checked in this order: equivalent, better/worse, likely, inconclusive.
 */
export function verdictOf(interval: readonly [number, number], direction: "higher" | "lower", minimumMeaningful: number): VerdictResult {
  if (!(minimumMeaningful > 0)) throw new Error("minimum_meaningful must be greater than zero");

  const gainLower = direction === "higher" ? interval[0] : -interval[1];
  const gainUpper = direction === "higher" ? interval[1] : -interval[0];

  if (gainLower > -minimumMeaningful && gainUpper < minimumMeaningful) return { verdict: "equivalent" };

  if (gainLower >= minimumMeaningful) return { verdict: "better" };

  if (gainUpper <= -minimumMeaningful) return { verdict: "worse" };

  if (gainLower > 0) return { verdict: "better", qualifier: "likely" };

  if (gainUpper < 0) return { verdict: "worse", qualifier: "likely" };

  return { verdict: "inconclusive" };
}

/**
 * Rank in the partial order worse < likely worse < {equivalent, inconclusive}
 * < likely better < better. Equivalent and inconclusive share a rank because
 * they are not ordered against each other.
 */
export function verdictRank(result: VerdictResult): number {
  if (result.verdict === "better") return result.qualifier ? 1 : 2;

  if (result.verdict === "worse") return result.qualifier ? -1 : -2;

  return 0;
}

/** The warning on failures left out, read from the stored shares and the interval of their difference. */
export function failureWarningOf(share: { candidate: number; baseline: number; difference_ci: readonly [number, number] }): boolean {
  const excludesZero = share.difference_ci[0] > 0 || share.difference_ci[1] < 0;

  return excludesZero && Math.abs(share.candidate - share.baseline) >= FAILURE_GAP_POINTS;
}

/** Threshold (ours): failure shares must differ by at least this many points. */
export const FAILURE_GAP_POINTS = 5;
