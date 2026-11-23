import { compute, parseRaw, type RawFile } from "../src/compute/compute.js";
import { resultsSchema, SCHEMA_VERSION, type Benchmark, type Results } from "../src/schema/benchmark.js";

type RawRowInput = Record<string, string | number | null>;

export function rawFileOf(rows: RawRowInput[]): RawFile {
  return parseRaw("data", rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

const candidate = (id: string) => ({
  id,
  name: id,
  version: "1.0",
  config: { mode: "default" },
  publication_terms: {
    terms: "MIT licence",
    restriction: "none found",
    checked_url: `https://example.com/${id}`,
    checked_on: "2026-11-02",
  },
  variants: { tested: [], selected: null },
});

const metric = (overrides: Record<string, unknown>) => ({
  id: "score",
  label: "Score",
  unit: "points",
  direction: "higher",
  kind: "quality",
  statistic: "mean",
  definition: "What the measuring script reports",
  compare_as: "difference",
  minimum_meaningful: 1,
  from: { raw: "data", measure: "score" },
  ...overrides,
});

interface PlanOptions {
  candidates?: string[];
  metrics?: Record<string, unknown>[];
  structure?: unknown;
  analysis?: unknown;
  levels?: unknown[];
  extra?: Record<string, unknown>;
}

/** A small valid plan: candidates "base" (the baseline) and "new", one raw file called "data". */
export function planOf(options: PlanOptions = {}): Results {
  const metrics = (options.metrics ?? [{}]).map(metric);
  const severalMetrics = metrics.length > 1;

  return resultsSchema.parse({
    benchmark: { id: "test", version: "1.0.0", goal: "Which one should we use?", conditions: [] },
    domain_research: { reference_suites: ["none found"], standard_metrics: ["score"], pitfalls: ["none found"], sources: ["none"] },
    candidates: (options.candidates ?? ["base", "new"]).map(candidate),
    baseline: "base",
    ...(options.structure ? { structure: options.structure } : {}),
    metrics: severalMetrics ? metrics.map((entry) => ({ weight: 1 / metrics.length, ...entry })) : metrics,
    ...(severalMetrics ? { composite: { computed: false } } : {}),
    workload: { description: "A small test workload", usage_pattern: "One call per item" },
    environment: { machine: "test" },
    runs: { levels: options.levels ?? [{ level: "run", field: "run", planned: 10 }] },
    artifacts: { repo: "https://example.com/repo", command: "./bench.sh", scripts: ["bench.sh"] },
    raw_data: [{ id: "data", kind: "samples", path: "data/data.jsonl", format: "jsonl" }],
    limitations: ["Synthetic test data."],
    ...(options.analysis ? { analysis: options.analysis } : {}),
    ...options.extra,
  });
}

export const suiteStructure = {
  levels: ["suite", "category", "task"],
  nodes: [
    { id: "suite", level: "suite", label: "Suite" },
    { id: "reasoning", level: "category", parent: "suite", label: "Reasoning" },
    { id: "coding", level: "category", parent: "suite", label: "Coding" },
    { id: "math", level: "task", parent: "reasoning", label: "Math" },
    { id: "policy", level: "task", parent: "reasoning", label: "Policy" },
    { id: "bugfix", level: "task", parent: "coding", label: "Bug fixes" },
  ],
};

/** The support example with Model A's accuracy on each task as the primary comparisons: a pattern on one level, which a summary can count. */
export function withTasksAsPrimary(support: Benchmark): Benchmark {
  const tasks = new Set(["math_word", "policy_qa", "bugfix"]);

  support.results.comparisons = support.results.comparisons!.map((comparison) =>
    comparison.metric === "accuracy" ? { ...comparison, role: tasks.has(comparison.node ?? "") ? "primary" : "exploratory" } : comparison,
  );

  return support;
}

/**
 * A computed benchmark of several scripts side by side, "new" against "base" on wall time: script i takes
 * 0.1 × (i + 1) s on base, and new is 20% faster on even scripts, 20% slower on odd ones.
 */
export function scriptsBenchmarkOf(scriptCount: number): Benchmark {
  const scripts = Array.from({ length: scriptCount }, (_, index) => `script-${index + 1}`);
  const plan = planOf({
    structure: { levels: ["script"], nodes: scripts.map((id, index) => ({ id, level: "script", label: `Script ${index + 1}` })) },
    metrics: [
      {
        id: "wall_time",
        label: "Wall time",
        unit: "s",
        direction: "lower",
        kind: "run_time",
        statistic: "median",
        compare_as: "relative",
        minimum_meaningful: 10,
        failures_count_as: "excluded",
        from: { raw: "data", measure: "wall_time" },
      },
    ],
    levels: [{ level: "process", field: "run", planned: 12 }],
  });
  const rows = scripts.flatMap((node, scriptIndex) =>
    (["base", "new"] as const).flatMap((candidate) =>
      Array.from({ length: 12 }, (_, run) => ({
        candidate,
        node,
        measure: "wall_time",
        value: 0.1 * (scriptIndex + 1) * (candidate === "new" ? (scriptIndex % 2 === 0 ? 0.8 : 1.2) : 1) * (1 + (run - 6) / 1000),
        run: run + 1,
      })),
    ),
  );

  return { schema_version: SCHEMA_VERSION, results: compute(plan, { data: rawFileOf(rows) }) } as Benchmark;
}
