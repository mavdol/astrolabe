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

/** Below this many participants on either side, a usability study can find problems but cannot rank the candidates. */
export const PARTICIPANTS_TO_RANK = 20;

/**
 * A usability comparison with too few participants is indicative: it keeps
 * its interval, but names no winner, so "better" and "worse" become
 * "inconclusive". Other kinds of metric, and declared values without n, are
 * left as they are.
 */
export function withEnoughParticipants(
  result: VerdictResult,
  metricKind: string,
  fewestParticipants: number | undefined,
): VerdictResult & { indicative?: true } {
  const isIndicative = metricKind === "usability" && fewestParticipants !== undefined && fewestParticipants < PARTICIPANTS_TO_RANK;

  if (!isIndicative) return result;

  const namesAWinner = result.verdict === "better" || result.verdict === "worse";

  return namesAWinner ? { verdict: "inconclusive", indicative: true } : { ...result, indicative: true };
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
