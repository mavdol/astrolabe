import { describe, expect, it } from "vitest";
import { compareEvalResults, type EvalResults } from "../scripts/compare-eval-results.js";

const run = (gradersPassed: boolean[]) => ({
  score: gradersPassed.filter(Boolean).length / gradersPassed.length,
  passed: gradersPassed.every(Boolean),
  graders: gradersPassed.map((passed, index) => ({ name: `grader-${index + 1}`, passed })),
});

const resultsOf = (cases: Record<string, boolean[][]>, costUsd = 1): EvalResults => ({
  costUsd,
  suite: { modelOverride: "sonnet" },
  cases: Object.entries(cases).map(([name, runs]) => ({ name, arms: { with: runs.map(run) } })),
});

const threeRunsOf = (gradersPassed: boolean[]) => [gradersPassed, gradersPassed, gradersPassed];

describe("comparison of two evaluation runs", () => {
  const main = resultsOf({
    "keeps-failures": threeRunsOf([true, true]),
    "names-no-winner": threeRunsOf([true, false]),
    "only-on-main": threeRunsOf([true]),
  });
  const pullRequest = resultsOf(
    {
      "keeps-failures": [
        [true, false],
        [true, true],
        [true, false],
      ],
      "names-no-winner": threeRunsOf([true, true]),
    },
    2.5,
  );
  const report = compareEvalResults(main, pullRequest);

  it("gives each case its mean score on both sides, with the lowest and highest run when they differ", () => {
    expect(report).toContain("| keeps-failures | 1.00 | 0.67 (0.50 to 1.00) | worse |");
    expect(report).toContain("| names-no-winner | 0.50 | 1.00 | better |");
  });

  it("names the graders whose passes moved and the cases that pass in some runs only", () => {
    expect(report).toContain("grader-2: 3/3 → 1/3; unstable: passes in some runs and fails in others |");
    expect(report).toContain("grader-2: 0/3 → 3/3 |");
  });

  it("does not compare a case that ran on one side only", () => {
    expect(report).toContain("| only-on-main | 1.00 | not run | not compared |");
  });

  it("counts the changes and adds up the cost", () => {
    expect(report).toContain("3 cases, 3 runs each, on sonnet");
    expect(report).toContain("1 worse, 1 better, 0 the same");
    expect(report).toContain("Cost of these runs: $3.50.");
  });

  it("calls a single grader vote lost in three runs the same", () => {
    const allTwelvePass = Array<boolean>(12).fill(true);
    const before = resultsOf({ "long-case": threeRunsOf(allTwelvePass) });
    const after = resultsOf({ "long-case": [allTwelvePass, allTwelvePass, [...allTwelvePass.slice(1), false]] });

    expect(compareEvalResults(before, after)).toContain("| long-case | 1.00 | 0.97 (0.92 to 1.00) | same |");
  });
});
