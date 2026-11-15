import { describe, expect, it } from "vitest";
import { compute, ComputeError } from "../src/compute/compute.js";
import type { Comparison, Results, Value } from "../src/schema/benchmark.js";
import { planOf, rawFileOf, suiteStructure } from "./helpers.js";

const FAST = { resamples: 2000 };
const close = (actual: number, expected: number, tolerance = 1e-5) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));

function valueOf(results: Results, candidate: string, node?: string, metric = "score"): Value {
  const found = results.values!.find((value) => value.candidate === candidate && value.node === node && value.metric === metric);

  if (!found) throw new Error(`no value for ${candidate} at ${node}`);

  return found;
}

function comparisonOf(results: Results, id: string): Comparison {
  const found = results.comparisons!.find((comparison) => comparison.id === id);

  if (!found) throw new Error(`no comparison ${id}`);

  return found;
}

const runsOf = (candidate: string, values: (number | null)[], extra: Record<string, string | number> = {}) =>
  values.map((value, index) => ({
    candidate,
    measure: "score",
    value,
    run: index + 1,
    ...(value === null ? { status: "timeout" } : {}),
    ...extra,
  }));

const itemsOf = (candidate: string, values: (number | null)[], extra: Record<string, string | number> = {}) =>
  values.map((value, index) => ({
    candidate,
    measure: "score",
    value,
    item: `item-${index + 1}`,
    ...(value === null ? { status: "no_answer" } : {}),
    ...extra,
  }));

const BASE_SCORES = [0.8, 2.9, 2.7, 4.1, 5.0, 6.0];
const NEW_SCORES = [1.0, 2.5, 3.1, 4.7, 5.2, 6.9];

describe("values", () => {
  it("mean of runs: Student t interval, against scipy", () => {
    const results = compute(planOf(), { data: rawFileOf([...runsOf("base", BASE_SCORES), ...runsOf("new", NEW_SCORES)]) }, FAST);
    const value = valueOf(results, "new");

    close(value.value, 3.9);
    close(value.se!, 0.862941);
    close(value.ci![0], 1.68174);
    close(value.ci![1], 6.11826);
    expect(value).toMatchObject({ n: 6, ci_level: 0.95, method: "t", source: "computed" });
  });

  it("median of runs: distribution-free interval from order statistics", () => {
    const tenRuns = [4.2, 4.12, 4.31, 4.16, 4.18, 4.05, 4.296, 4.163, 4.14, 4.25];
    const plan = planOf({
      metrics: [{ statistic: "median", kind: "run_time", direction: "lower", compare_as: "relative", minimum_meaningful: 10 }],
      extra: {
        environment: { hardware: "x", os: "y", software: {} },
        runs: { levels: [{ level: "run", field: "run", planned: 10 }], warmup: "3 runs", state: "warm" },
      },
    });
    const results = compute(
      plan,
      {
        data: rawFileOf([
          ...runsOf("base", tenRuns),
          ...runsOf(
            "new",
            tenRuns.map((seconds) => seconds / 2),
          ),
        ]),
      },
      FAST,
    );
    const value = valueOf(results, "base");

    close(value.value, 4.1715);
    expect(value.ci).toEqual([4.12, 4.296]);
    expect(value.method).toBe("order statistics");
    close(comparisonOf(results, "score__new").effect, -50);
  });

  it("five runs cannot give a 95% interval for a median, and the value says so", () => {
    const plan = planOf({ metrics: [{ statistic: "median" }] });
    const results = compute(plan, { data: rawFileOf([...runsOf("base", [1, 2, 3, 4, 5]), ...runsOf("new", [2, 3, 4, 5, 6])]) }, FAST);

    expect(valueOf(results, "base").ci).toBeUndefined();
    expect(valueOf(results, "base").method).toContain("too few observations");
  });

  it("share of binary items: Wilson interval, in percent", () => {
    const plan = planOf({
      metrics: [{ statistic: "share", unit: "%", failures_count_as: "zero" }],
      levels: [{ level: "item", field: "item", planned: 24 }],
    });
    const nineteenOfTwentyFour = [...Array(19).fill(1), ...Array(5).fill(null)];
    const results = compute(
      plan,
      { data: rawFileOf([...itemsOf("base", nineteenOfTwentyFour), ...itemsOf("new", Array(24).fill(1))]) },
      FAST,
    );
    const value = valueOf(results, "base");

    close(value.value, 79.1667);
    close(value.ci![0], 59.5295);
    close(value.ci![1], 90.7552);
    expect(value.method).toBe("wilson");
    expect(valueOf(results, "new").ci).toEqual([86.2024, 100]);
    expect(results.failures).toEqual([
      { candidate: "base", metric: "score", reason: "no_answer", count: 5, attempts: 24, unit: "attempts", counted_as: "zero" },
    ]);
  });

  it("repeats are averaged per item first, and the items are the observations", () => {
    const plan = planOf({
      metrics: [{ statistic: "share", unit: "%" }],
      levels: [
        { level: "item", field: "item", planned: 3 },
        { level: "repeat", field: "repeat", planned: 2 },
      ],
    });
    const withRepeats = (candidate: string, perItem: number[][]) =>
      perItem.flatMap((repeats, item) =>
        repeats.map((value, repeat) => ({ candidate, measure: "score", value, item: `i${item}`, repeat: repeat + 1 })),
      );
    const results = compute(
      plan,
      {
        data: rawFileOf([
          ...withRepeats("base", [
            [1, 0],
            [1, 1],
            [0, 0],
          ]),
          ...withRepeats("new", [
            [1, 1],
            [1, 1],
            [0, 1],
          ]),
        ]),
      },
      FAST,
    );
    const value = valueOf(results, "base");

    expect(value.n).toBe(3);
    close(value.value, 50);
    expect(value.method).toBe("t");
  });
});

describe("comparisons", () => {
  it("unpaired runs: Welch interval, against scipy", () => {
    const results = compute(planOf(), { data: rawFileOf([...runsOf("base", BASE_SCORES), ...runsOf("new", NEW_SCORES)]) }, FAST);
    const comparison = comparisonOf(results, "score__new");

    close(comparison.effect, 0.316667);
    close(comparison.ci![0], -2.24447);
    close(comparison.ci![1], 2.8778);
    expect(comparison).toMatchObject({
      paired: false,
      method: "welch",
      verdict: "inconclusive",
      role: "primary",
      adjusted: false,
      ci_level: 0.95,
    });
  });

  it("the same items on both sides: paired t interval, against scipy", () => {
    const plan = planOf({ levels: [{ level: "item", field: "item", planned: 6 }] });
    const results = compute(plan, { data: rawFileOf([...itemsOf("base", BASE_SCORES), ...itemsOf("new", NEW_SCORES)]) }, FAST);
    const comparison = comparisonOf(results, "score__new");

    close(comparison.effect, 0.316667);
    close(comparison.ci![0], -0.145165);
    close(comparison.ci![1], 0.778498);
    expect(comparison).toMatchObject({ paired: true, method: "paired t", verdict: "equivalent" });
  });

  it("relative effects are bootstrapped with the baseline in the denominator", () => {
    const plan = planOf({ metrics: [{ compare_as: "relative", minimum_meaningful: 10 }] });
    const results = compute(
      plan,
      { data: rawFileOf([...runsOf("base", [10, 10.2, 9.8, 10.1, 9.9, 10]), ...runsOf("new", [20, 20.4, 19.6, 20.2, 19.8, 20])]) },
      FAST,
    );
    const comparison = comparisonOf(results, "score__new");

    close(comparison.effect, 100);
    expect(comparison.method).toBe("bootstrap");
    expect(comparison.ci![0]).toBeGreaterThan(95);
    expect(comparison.ci![1]).toBeLessThan(105);
    expect(comparison.verdict).toBe("better");
  });

  it("a bootstrap on too few runs gives no interval, so no verdict but inconclusive", () => {
    const plan = planOf({ metrics: [{ compare_as: "relative", minimum_meaningful: 10 }] });
    const fiveRunsEach = {
      data: rawFileOf([...runsOf("base", [10, 10.1, 9.9, 10.2, 9.8]), ...runsOf("new", [20, 20.1, 19.9, 20.2, 19.8])]),
    };
    const comparison = comparisonOf(compute(plan, fiveRunsEach, FAST), "score__new");

    expect(comparison.ci).toBeUndefined();
    expect(comparison).toMatchObject({ verdict: "inconclusive", method: "bootstrap (too few observations for an interval)" });
    expect(comparison.effect).toBeCloseTo(100, 6);

    const sixRunsEach = {
      data: rawFileOf([...runsOf("base", [10, 10.1, 9.9, 10.2, 9.8, 10]), ...runsOf("new", [20, 20.1, 19.9, 20.2, 19.8, 20])]),
    };

    expect(comparisonOf(compute(plan, sixRunsEach, FAST), "score__new")).toMatchObject({ verdict: "better", method: "bootstrap" });
  });

  it("the minimum follows the level: four primary comparisons at 98.75% need 8 runs on each side", () => {
    const plan = planOf({
      candidates: ["base", "new", "other"],
      metrics: [{ compare_as: "relative" }, { id: "speed", compare_as: "relative", from: { raw: "data", measure: "speed" } }],
    });
    const rowsWithRuns = (count: number) =>
      ["base", "new", "other"].flatMap((candidate, shift) => {
        const values = Array.from({ length: count }, (_, index) => 10 * (shift + 1) + index / 10);

        return [...runsOf(candidate, values), ...runsOf(candidate, values).map((row) => ({ ...row, measure: "speed" }))];
      });

    for (const comparison of compute(plan, { data: rawFileOf(rowsWithRuns(7)) }, FAST).comparisons!) expect(comparison.ci).toBeUndefined();

    for (const comparison of compute(plan, { data: rawFileOf(rowsWithRuns(8)) }, FAST).comparisons!) expect(comparison.ci).toBeDefined();
  });

  it("a value resampled on too few clusters has no interval", () => {
    const plan = planOf({ levels: [{ level: "item", field: "item", planned: 10 }] });
    const inThreeClusters = (candidate: string) =>
      itemsOf(candidate, [1, 2, 3, 4, 5, 6, 7, 8, 9]).map((row, index) => ({ ...row, cluster: `c${index % 3}` }));
    const value = valueOf(compute(plan, { data: rawFileOf([...inThreeClusters("base"), ...inThreeClusters("new")]) }, FAST), "base");

    expect(value.ci).toBeUndefined();
    expect(value.method).toBe("bootstrap, resampling clusters (too few observations for an interval)");
  });

  it("several primary comparisons share a Bonferroni level", () => {
    const plan = planOf({ candidates: ["base", "new", "other"], metrics: [{}, { id: "speed", from: { raw: "data", measure: "speed" } }] });
    const rows = ["base", "new", "other"].flatMap((candidate) => [
      ...runsOf(candidate, BASE_SCORES),
      ...runsOf(candidate, NEW_SCORES).map((row) => ({ ...row, measure: "speed" })),
    ]);
    const results = compute(plan, { data: rawFileOf(rows) }, FAST);

    expect(results.comparisons).toHaveLength(4);

    for (const comparison of results.comparisons!) expect(comparison).toMatchObject({ role: "primary", adjusted: true, ci_level: 0.9875 });

    expect(results.computed).toMatchObject({ primary_comparisons: 4, exploratory_comparisons: 0 });
  });

  it("the same raw files give the same digits, and computing again changes nothing", () => {
    const plan = planOf({ metrics: [{ compare_as: "relative", statistic: "median" }] });
    const raw = {
      data: rawFileOf([...runsOf("base", [10, 10.2, 9.8, 10.1, 9.9, 10, 10.3]), ...runsOf("new", [12, 12.4, 11.6, 12.2, 11.8, 12, 12.1])]),
    };
    const first = compute(plan, raw, FAST);

    expect(compute(plan, raw, FAST)).toEqual(first);
    expect(compute(first, raw, FAST)).toEqual(first);
  });
});

describe("structure and aggregation", () => {
  const accuracy = { statistic: "share", unit: "%", minimum_meaningful: 3 };
  const taskRows = (candidate: string, math: number[], policy: number[], bugfix: number[]) => [
    ...itemsOf(candidate, math, { node: "math" }).map((row) => ({ ...row, item: `math-${row.item}` })),
    ...itemsOf(candidate, policy, { node: "policy" }).map((row) => ({ ...row, item: `policy-${row.item}` })),
    ...itemsOf(candidate, bugfix, { node: "bugfix" }).map((row) => ({ ...row, item: `bugfix-${row.item}` })),
  ];
  const rows = [
    ...taskRows("base", [1, 1, 1, 0], [1, 0, 0, 0, 1, 0, 1, 0], [1, 0]),
    ...taskRows("new", [1, 1, 1, 1], [1, 1, 0, 0, 1, 0, 1, 0], [1, 1]),
  ];
  const levels = [{ level: "item", field: "item", planned: 14 }];

  it("macro aggregation goes level by level: the suite is the mean of its categories, not of its tasks", () => {
    const plan = planOf({ metrics: [{ ...accuracy, aggregation: { groups: "macro" } }], structure: suiteStructure, levels });
    const results = compute(plan, { data: rawFileOf(rows) }, FAST);

    close(valueOf(results, "base", "math").value, 75);
    close(valueOf(results, "base", "policy").value, 37.5);
    close(valueOf(results, "base", "reasoning").value, 56.25);
    close(valueOf(results, "base", "suite").value, (56.25 + 50) / 2);
    expect(valueOf(results, "base", "suite").n).toBe(14);
    expect(valueOf(results, "base", "suite").method).toBe("bootstrap, resampling items");
  });

  it("micro aggregation weighs every item equally", () => {
    const plan = planOf({ metrics: [{ ...accuracy, aggregation: { groups: "micro" } }], structure: suiteStructure, levels });
    const results = compute(plan, { data: rawFileOf(rows) }, FAST);

    close(valueOf(results, "base", "reasoning").value, (100 * 6) / 12);
    close(valueOf(results, "base", "suite").value, (100 * 7) / 14);
  });

  it("a parent with a single child repeats that child", () => {
    const plan = planOf({ metrics: [{ ...accuracy, aggregation: { groups: "macro" } }], structure: suiteStructure, levels });
    const results = compute(plan, { data: rawFileOf(rows) }, FAST);
    const { node: _childNode, ...child } = valueOf(results, "new", "bugfix");
    const { node: _parentNode, ...parent } = valueOf(results, "new", "coding");

    expect(parent).toEqual(child);
  });

  it("by default the primary comparison is at the highest node that has values", () => {
    const plan = planOf({ metrics: [{ ...accuracy, aggregation: { groups: "macro" } }], structure: suiteStructure, levels });
    const results = compute(plan, { data: rawFileOf(rows) }, FAST);
    const primary = results.comparisons!.filter((comparison) => comparison.role === "primary");

    expect(primary.map((comparison) => comparison.id)).toEqual(["score__suite__new"]);
    expect(results.computed).toMatchObject({ primary_comparisons: 1, exploratory_comparisons: 5 });
    expect(comparisonOf(results, "score__suite__new").method).toBe("bootstrap, paired by item");
  });

  it("declared primary comparisons are adjusted together, the rest is exploratory", () => {
    const analysis = {
      primary: [
        { metric: "score", node: "suite" },
        { metric: "score", node: "coding" },
      ],
    };
    const plan = planOf({ metrics: [{ ...accuracy, aggregation: { groups: "macro" } }], structure: suiteStructure, levels, analysis });
    const results = compute(plan, { data: rawFileOf(rows) }, FAST);

    expect(comparisonOf(results, "score__suite__new")).toMatchObject({ role: "primary", adjusted: true, ci_level: 0.975 });
    expect(comparisonOf(results, "score__math__new")).toMatchObject({ role: "exploratory", adjusted: false, ci_level: 0.95 });
  });

  it("a row without a node is refused when the file has a structure", () => {
    const plan = planOf({ metrics: [accuracy], structure: suiteStructure, levels });

    expect(() => compute(plan, { data: rawFileOf(itemsOf("base", [1, 0])) }, FAST)).toThrow(ComputeError);
  });
});

describe("failures left out", () => {
  const seconds = {
    statistic: "median",
    unit: "s",
    direction: "lower",
    compare_as: "relative",
    minimum_meaningful: 20,
    failures_count_as: "excluded",
    aggregation: { groups: "micro" },
  };
  const structure = {
    levels: ["study", "task"],
    nodes: [
      { id: "tasks", level: "study", label: "Tasks" },
      { id: "create", level: "task", parent: "tasks", label: "Create" },
      { id: "find", level: "task", parent: "tasks", label: "Find" },
    ],
  };
  const participants = (candidate: string, prefix: string, node: string, values: (number | null)[]) =>
    values.map((value, index) => ({
      candidate,
      measure: "score",
      value,
      item: `${prefix}${index}`,
      node,
      ...(value === null ? { status: "gave_up" } : {}),
    }));
  const twentyFour = (failures: number) => [
    ...Array(failures).fill(null),
    ...Array.from({ length: 24 - failures }, (_, index) => 100 + index),
  ];
  const rows = [
    ...participants("base", "a", "create", twentyFour(8)),
    ...participants("base", "a", "find", twentyFour(0)),
    ...participants("new", "b", "create", twentyFour(0)),
    ...participants("new", "b", "find", twentyFour(0)),
  ];
  const plan = planOf({ metrics: [seconds], structure, levels: [{ level: "participant", field: "item", planned: 24 }] });
  const results = compute(plan, { data: rawFileOf(rows) }, FAST);

  it("failures keep their denominator and the comparison is marked successful attempts only", () => {
    expect(results.failures).toEqual([
      {
        candidate: "base",
        metric: "score",
        node: "create",
        reason: "gave_up",
        count: 8,
        attempts: 24,
        unit: "attempts",
        counted_as: "excluded",
      },
    ]);
    expect(valueOf(results, "base", "create").n).toBe(16);
    expect(comparisonOf(results, "score__create__new")).toMatchObject({ successful_only: true, paired: false });
  });

  it("the warning is set where the shares differ, and reaches the overall comparison", () => {
    const onTask = comparisonOf(results, "score__create__new");

    expect(onTask.failure_share).toMatchObject({ candidate: 0, baseline: 33.3333 });
    expect(onTask.failure_warning).toBe(true);
    const overall = comparisonOf(results, "score__tasks__new");

    expect(overall.failure_warning).toBe(true);
    expect(overall.failure_warning_nodes).toEqual(["create"]);
    expect(comparisonOf(results, "score__find__new").failure_share).toBeUndefined();
  });

  it("failed observations without failures_count_as are refused", () => {
    const undeclared = planOf({
      metrics: [{ ...seconds, failures_count_as: undefined }],
      structure,
      levels: [{ level: "participant", field: "item", planned: 24 }],
    });

    expect(() => compute(undeclared, { data: rawFileOf(rows) }, FAST)).toThrow(/failures_count_as/);
  });
});

describe("outliers", () => {
  const steady = [10, 10.1, 9.9, 10.2, 9.8, 10, 10.1, 9.9];
  const levels = [{ level: "item", field: "item", planned: 9 }];

  it("the declared rule is applied by compute and every removal is listed", () => {
    const plan = planOf({ analysis: { outliers: { rule: "tukey", k: 1.5 } }, levels });
    const results = compute(plan, { data: rawFileOf([...itemsOf("base", [...steady, 50]), ...itemsOf("new", [...steady, 10])]) }, FAST);

    expect(results.exclusions).toEqual([{ candidate: "base", metric: "score", rule: "tukey, k=1.5", count: 1, of: 9 }]);
    expect(valueOf(results, "base").n).toBe(8);
    expect(valueOf(results, "new").n).toBe(9);
  });

  it("in a paired comparison, an item removed on one side is removed from both", () => {
    const plan = planOf({ analysis: { outliers: { rule: "tukey", k: 1.5 } }, levels });
    const results = compute(plan, { data: rawFileOf([...itemsOf("base", [...steady, 50]), ...itemsOf("new", [...steady, 10])]) }, FAST);
    const comparison = comparisonOf(results, "score__new");

    expect(comparison.paired).toBe(true);
    expect(comparison.effect).toBe(0);
  });

  it("without a declared rule nothing is removed", () => {
    const results = compute(
      planOf({ levels }),
      { data: rawFileOf([...itemsOf("base", [...steady, 50]), ...itemsOf("new", [...steady, 10])]) },
      FAST,
    );

    expect(results.exclusions).toEqual([]);
    expect(valueOf(results, "base").n).toBe(9);
  });
});

describe("what was observed", () => {
  it("run levels are counted from the raw rows, per candidate", () => {
    const results = compute(
      planOf(),
      { data: rawFileOf([...runsOf("base", BASE_SCORES), ...runsOf("new", NEW_SCORES.slice(0, 5))]) },
      FAST,
    );

    expect(results.observed!.levels).toEqual([{ level: "run", field: "run", n: 5, n_max: 6 }]);
    expect(results.raw_data[0].rows).toBe(11);
  });

  it("a service you do not control needs a timestamp on every row", () => {
    const plan = planOf();

    plan.candidates[1].service = { region: "eu", plan: "standard", api_version: "1" };
    const raw = { data: rawFileOf([...runsOf("base", BASE_SCORES), ...runsOf("new", NEW_SCORES)]) };

    expect(() => compute(plan, raw, FAST)).toThrow(/ts field/);
    const stamped = { data: rawFileOf([...runsOf("base", BASE_SCORES), ...runsOf("new", NEW_SCORES, { ts: "2026-11-03T08:00:00Z" })]) };

    expect(compute(plan, stamped, FAST).observed!.timestamps).toEqual({
      first: "2026-11-03T08:00:00Z",
      last: "2026-11-03T08:00:00Z",
      distinct: 1,
    });
  });
});
