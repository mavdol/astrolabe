import { z } from "zod";
import { blockSchema, exportSchema, filterSchema, styleSchema } from "./presentation.js";

/** Version of the file format. */
export const SCHEMA_VERSION = "0.5";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "an id uses letters, digits, '_', '-' or '.', and no spaces");
const text = z.string().min(1);
const interval = z.tuple([z.number(), z.number()]);

export const METRIC_KINDS = [
  "run_time",
  "latency",
  "throughput",
  "memory",
  "cpu",
  "energy",
  "quality",
  "cost",
  "preference",
  "usability",
  "feature",
] as const;
export const STATISTICS = ["mean", "median", "p50", "p95", "p99", "rate", "share", "total"] as const;
export const CONDITIONS = ["non_deterministic", "trained_or_tuned", "managed_runtime", "load_test", "gathered_before_plan"] as const;

const candidate = z.strictObject({
  id,
  name: text,
  version: text,
  config: z.record(z.string(), z.unknown()),
  publication_terms: z.strictObject({
    terms: text,
    restriction: text,
    checked_url: text,
    checked_on: text,
    clause_url: text.optional(),
  }),
  variants: z.strictObject({
    tested: z.array(text),
    selected: text.nullable().optional(),
    remeasured_on_fresh_runs: z.boolean().optional(),
  }),
  service: z.strictObject({ region: text, plan: text, api_version: text }).optional(),
  pricing: z
    .strictObject({
      model: text,
      source: text,
      date: text,
      fixed: z.number().optional(),
      variable: z.number().optional(),
      volume: text.optional(),
      period: text.optional(),
    })
    .optional(),
  family: text.optional(),
  role: z.enum(["candidate", "simple_baseline"]).optional(),
});

const metric = z.strictObject({
  id,
  label: text,
  unit: text,
  direction: z.enum(["higher", "lower"]),
  kind: z.enum(METRIC_KINDS),
  statistic: z.enum(STATISTICS),
  definition: text,
  compare_as: z.enum(["difference", "relative"]),
  minimum_meaningful: z.number().positive("minimum_meaningful must be greater than zero"),
  weight: z.number().optional(),
  scope: text.optional(),
  aggregation: z
    .strictObject({
      repeats: z.enum(["mean"]).optional(),
      items: z.enum(["mean"]).optional(),
      groups: z.enum(["macro", "micro"]).optional(),
    })
    .optional(),
  failures_count_as: z.enum(["zero", "excluded"]).optional(),
  reference_points: z.array(z.strictObject({ label: text, value: z.number() })).optional(),
  from: z.strictObject({ raw: id, measure: text }).optional(),
});

const value = z.strictObject({
  candidate: id,
  metric: id,
  node: id.optional(),
  value: z.number(),
  n: z.number().int().optional(),
  ci: interval.optional(),
  ci_level: z.number().optional(),
  se: z.number().optional(),
  sd: z.number().optional(),
  method: z.string().optional(),
  percentiles: z.record(z.string(), z.number()).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  charged: z.number().optional(),
  evidence: z.string().optional(),
  source: z.enum(["computed", "declared"]),
});

const failure = z.strictObject({
  candidate: id,
  metric: id,
  node: id.optional(),
  reason: text,
  count: z.number().int(),
  attempts: z.number().int(),
  unit: text,
  counted_as: z.enum(["zero", "excluded"]),
});

const exclusion = z.strictObject({
  candidate: id,
  metric: id,
  node: id.optional(),
  rule: text,
  count: z.number().int(),
  of: z.number().int(),
});

const comparison = z.strictObject({
  id: text,
  metric: id,
  node: id.optional(),
  candidate: id,
  vs: id,
  effect: z.number(),
  ci: interval.optional(),
  ci_level: z.number().optional(),
  verdict: z.enum(["better", "worse", "equivalent", "inconclusive"]),
  qualifier: z.enum(["likely"]).optional(),
  indicative: z.literal(true).optional(),
  role: z.enum(["primary", "exploratory"]),
  adjusted: z.boolean(),
  paired: z.boolean(),
  method: z.string(),
  source: z.enum(["computed", "declared"]),
  n: z.number().int().optional(),
  successful_only: z.boolean().optional(),
  failure_share: z
    .strictObject({ candidate: z.number(), baseline: z.number(), difference_ci: interval, difference_ci_adjusted: interval.optional() })
    .optional(),
  failure_warning: z.boolean().optional(),
  failure_warning_nodes: z.array(id).optional(),
});

export const resultsSchema = z.strictObject({
  // ---- the plan: written by the agent ----
  benchmark: z.strictObject({
    id,
    version: text,
    goal: text,
    scope: text.optional(),
    conditions: z.array(z.enum(CONDITIONS)),
  }),
  domain_research: z.strictObject({
    reference_suites: z.array(text).min(1),
    standard_metrics: z.array(text).min(1),
    pitfalls: z.array(text).min(1),
    sources: z.array(text).min(1),
  }),
  candidates: z.array(candidate).min(2),
  baseline: id,
  structure: z
    .strictObject({
      levels: z.array(text).min(1),
      nodes: z
        .array(
          z.strictObject({
            id,
            level: text,
            label: text,
            parent: id.optional(),
            n_items: z.number().int().optional(),
            scoring: text.optional(),
          }),
        )
        .min(1),
    })
    .optional(),
  metrics: z.array(metric).min(1),
  composite: z.strictObject({ computed: z.boolean(), method: text.optional(), note: text.optional() }).optional(),
  workload: z.strictObject({
    description: text,
    usage_pattern: text,
    contamination: z.strictObject({ items: z.enum(["private", "public", "regenerated"]), published: z.boolean(), risk: text }).optional(),
    arrival_model: text.optional(),
    tasks: z.array(text).optional(),
    users: text.optional(),
    clusters: z.number().int().optional(),
  }),
  judge: z
    .strictObject({
      type: z.enum(["model", "human", "participants"]),
      used_for: z.array(id).optional(),
      method: text.optional(),
      blinded: z.boolean().optional(),
      order_policy: text.optional(),
      model: text.optional(),
      family: text.optional(),
      raters: z.number().int().optional(),
      agreement: z.strictObject({ double_rated_items: z.number().int(), krippendorff_alpha: z.number() }).optional(),
      validation: z.strictObject({ human_rated_items: z.number().int(), krippendorff_alpha: z.number() }).optional(),
    })
    .optional(),
  environment: z.record(z.string(), z.unknown()),
  runs: z.strictObject({
    levels: z.array(z.strictObject({ level: text, field: z.enum(["run", "item", "repeat"]), planned: z.number().int().positive() })).min(1),
    warmup: text.optional(),
    state: z.enum(["cold", "warm"]).optional(),
    order: text.optional(),
    power: z.strictObject({ minimum_detectable_effect: z.number(), pilot_n: z.number().int() }).optional(),
  }),
  artifacts: z.strictObject({ repo: text, command: text, scripts: z.array(text).min(1) }),
  raw_data: z.array(
    z.strictObject({
      id,
      kind: z.enum(["items", "samples", "timeseries"]),
      path: text,
      format: z.literal("jsonl"),
      fields: z.array(text).optional(),
      // written by compute
      rows: z.number().int().optional(),
      sha256: z.string().optional(),
    }),
  ),
  limitations: z.array(text).min(1),
  analysis: z
    .strictObject({
      primary: z
        .array(z.strictObject({ metric: id, node: id.optional() }))
        .min(1)
        .optional(),
      outliers: z
        .strictObject({ rule: z.enum(["none", "tukey"]), k: z.number().positive().optional(), metrics: z.array(id).optional() })
        .optional(),
    })
    .optional(),

  // ---- written by astrolabe compute (declared values excepted) ----
  values: z.array(value).optional(),
  failures: z.array(failure).optional(),
  exclusions: z.array(exclusion).optional(),
  comparisons: z.array(comparison).optional(),
  observed: z
    .strictObject({
      levels: z.array(z.strictObject({ level: text, field: text, n: z.number().int(), n_max: z.number().int().optional() })),
      timestamps: z.strictObject({ first: text, last: text, distinct: z.number().int() }).optional(),
    })
    .optional(),
  computed: z
    .strictObject({
      by: text,
      methods_version: text,
      resamples: z.number().int(),
      seed: text,
      alpha: z.number(),
      primary_comparisons: z.number().int(),
      exploratory_comparisons: z.number().int(),
      raw_sha256: z.record(z.string(), z.string()),
    })
    .optional(),
});

/** The whole file: one verifiable part, results, and five presentation sections. */
export const benchmarkSchema = z.looseObject({
  $schema: z.string().optional(),
  schema_version: z.literal(SCHEMA_VERSION),
  results: resultsSchema,
  style: styleSchema.optional(),
  filters: z.array(filterSchema).optional(),
  layout: z.array(z.array(z.string()).min(1)).optional(),
  blocks: z.array(blockSchema).optional(),
  exports: z.array(exportSchema).optional(),
});

export type Results = z.infer<typeof resultsSchema>;
export type Benchmark = z.infer<typeof benchmarkSchema>;
export type Metric = Results["metrics"][number];
export type Value = NonNullable<Results["values"]>[number];
export type Comparison = NonNullable<Results["comparisons"]>[number];
export type Failure = NonNullable<Results["failures"]>[number];
export type Exclusion = NonNullable<Results["exclusions"]>[number];

/** Keys of results that astrolabe compute writes; everything else is the plan. */
export const COMPUTED_KEYS = ["values", "failures", "exclusions", "comparisons", "observed", "computed"] as const;
