import { describe, expect, it } from "vitest";
import { compute } from "../src/compute/compute.js";
import { Xoshiro128 } from "../src/compute/rng.js";
import type { Comparison, Results } from "../src/schema/benchmark.js";
import { planOf, rawFileOf } from "./helpers.js";

/** Synthetic data with a known truth, drawn from a fixed stream so that every run of the tests sees the same data. */
function syntheticData(seed: number) {
  const generator = new Xoshiro128([seed, 0x9e3779b9, 0x7f4a7c15, 0x2545f491]);
  const uniform = () => (generator.next() + 0.5) / 4294967296;

  return {
    uniform,
    normal: () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()),
  };
}

const comparisonAt = (results: Results, metric: string, node?: string): Comparison =>
  results.comparisons!.find((comparison) => comparison.metric === metric && comparison.node === node && comparison.role === "primary")!;

const covers = (comparison: Comparison, trueEffect: number) => comparison.ci![0] <= trueEffect && trueEffect <= comparison.ci![1];

describe("interval coverage", () => {
  const DATASETS = 200;
  const RUNS = 30;
  const TRUE_EFFECT = { wall_time: -10, peak_memory: 5 };
  const relativeMedian = (id: string) => ({
    id,
    label: id,
    unit: "s",
    direction: "lower",
    kind: "quality",
    statistic: "median",
    compare_as: "relative",
    minimum_meaningful: 5,
    weight: 0.5,
    from: { raw: "data", measure: id },
  });
  const plan = planOf({
    metrics: [relativeMedian("wall_time"), relativeMedian("peak_memory")],
    levels: [{ level: "run", field: "run", planned: RUNS }],
    analysis: { primary: [{ metric: "wall_time" }, { metric: "peak_memory" }] },
  });
  const coverage = { wall_time: 0, peak_memory: 0, both: 0 };
  const claimedLevels = new Set<number>();

  for (let dataset = 0; dataset < DATASETS; dataset++) {
    const { normal } = syntheticData(dataset + 1);
    const rows = [];

    for (let run = 1; run <= RUNS; run++) {
      for (const [measure, effect] of Object.entries(TRUE_EFFECT)) {
        rows.push({ candidate: "base", measure, value: Math.exp(0.3 * normal()), run });
        rows.push({ candidate: "new", measure, value: (1 + effect / 100) * Math.exp(0.3 * normal()), run });
      }
    }

    const results = compute(plan, { data: rawFileOf(rows) }, { resamples: 1000 });
    const wallTimeCovered = covers(comparisonAt(results, "wall_time"), TRUE_EFFECT.wall_time);

    claimedLevels.add(comparisonAt(results, "wall_time").ci_level!).add(comparisonAt(results, "peak_memory").ci_level!);
    const peakMemoryCovered = covers(comparisonAt(results, "peak_memory"), TRUE_EFFECT.peak_memory);

    coverage.wall_time += Number(wallTimeCovered);
    coverage.peak_memory += Number(peakMemoryCovered);
    coverage.both += Number(wallTimeCovered && peakMemoryCovered);
  }

  it("a bootstrap interval of a relative effect between medians holds the true effect as often as its level says, within sampling error", () => {
    expect(claimedLevels).toEqual(new Set([0.975]));
    expect(coverage.wall_time / DATASETS).toBeGreaterThanOrEqual(0.95);
    expect(coverage.peak_memory / DATASETS).toBeGreaterThanOrEqual(0.95);
  });

  it("two primary comparisons, adjusted together, both hold the truth at least 95% of the time", () => {
    expect(coverage.both / DATASETS).toBeGreaterThanOrEqual(0.95);
  });
});

describe("failure warnings on a suite of 50 tasks", () => {
  const TASKS = 50;
  const ITEMS = 20;
  const tasks = Array.from({ length: TASKS }, (_, index) => `task-${index + 1}`);
  const plan = planOf({
    metrics: [{ statistic: "mean", unit: "s", direction: "lower", failures_count_as: "excluded" }],
    structure: {
      levels: ["suite", "task"],
      nodes: [{ id: "suite", level: "suite", label: "Suite" }, ...tasks.map((id) => ({ id, level: "task", parent: "suite", label: id }))],
    },
    levels: [{ level: "item", field: "item", planned: ITEMS }],
    analysis: { primary: [{ metric: "score", node: "suite" }] },
  });

  /** Every task fails with the given share on both sides, except those listed, where the new candidate fails more. */
  function suiteWith(seed: number, failureShare: number, newFailsMoreOn: Record<string, number> = {}): Results {
    const { uniform, normal } = syntheticData(seed);
    const rows = tasks.flatMap((task) =>
      ["base", "new"].flatMap((candidate) =>
        Array.from({ length: ITEMS }, (_, index) => {
          const share = candidate === "new" ? (newFailsMoreOn[task] ?? failureShare) : failureShare;
          const failed = uniform() < share;

          return {
            candidate,
            node: task,
            item: `${task}-${index + 1}`,
            measure: "score",
            value: failed ? null : 10 + normal(),
            ...(failed ? { status: "gave_up" } : {}),
          };
        }),
      ),
    );

    return compute(plan, { data: rawFileOf(rows) }, { resamples: 200 });
  }

  it("rarely warns on the headline when both candidates fail equally often", () => {
    const SUITES = 40;
    let headlinesWithAWarning = 0;
    let tasksWithAWarning = 0;

    for (let suite = 0; suite < SUITES; suite++) {
      const results = suiteWith(1000 + suite, 0.2);

      headlinesWithAWarning += Number(comparisonAt(results, "score", "suite").failure_warning === true);
      tasksWithAWarning += results.comparisons!.filter((comparison) => comparison.node !== "suite" && comparison.failure_warning).length;
    }

    expect(tasksWithAWarning, "each task still warns on its own gap").toBeGreaterThan(0);
    expect(headlinesWithAWarning / SUITES).toBeLessThanOrEqual(0.1);
  });

  it("still warns on the headline, and names the task, when one task has a large gap", () => {
    const results = suiteWith(7, 0.05, { "task-17": 0.7 });
    const headline = comparisonAt(results, "score", "suite");

    expect(headline.failure_warning).toBe(true);
    expect(headline.failure_warning_nodes).toEqual(["task-17"]);
  });
});
