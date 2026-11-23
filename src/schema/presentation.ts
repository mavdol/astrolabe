import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "an id uses letters, digits, '_', '-' or '.', and no spaces");
const text = z.string().min(1);
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour is written as six hexadecimal digits, such as #2f6fed");

export const CHART_TYPES = [
  "bar",
  "grouped-bar",
  "dot-interval",
  "effect",
  "scatter",
  "distribution",
  "line",
  "shaded-table",
  "stacked-bar",
  "comparison-rows",
] as const;
export const TRUST_BLOCK_TYPES = ["methodology", "environment", "limitations", "provenance"] as const;
export const EXPORT_SIZES = ["banner", "wide", "square"] as const;
export const VERDICT_WORDS = ["better", "worse", "equivalent", "inconclusive", "likely better", "likely worse"] as const;

export const styleSchema = z.strictObject({
  theme: z.literal("astrolabe").optional(),
  mode: z.enum(["auto", "light", "dark"]).optional(),
  accent: colour.optional(),
  series: z.record(id, colour).optional(),
  highlight: id.optional(),
  attribution: z.boolean().optional(),
});

export const filterSchema = z.strictObject({
  id,
  label: text,
  level: text,
  options: z.union([z.literal("from_structure"), z.array(id).min(1)]),
  default: text,
  allow_all: z.boolean().optional(),
});

const scale = z
  .strictObject({
    type: z.enum(["linear", "log"]).optional(),
    zero: z.boolean().optional(),
    shared_with: z.array(id).optional(),
    reason: text.optional(),
  })
  .refine((declared) => declared.reason !== undefined || (declared.zero !== false && declared.type !== "log"), {
    message: "a scale that does not start at zero, or a log scale, needs its reason",
    path: ["reason"],
  });

const blockText = {
  title: text.optional(),
  description: text.optional(),
  asserts: z.record(text, z.enum(VERDICT_WORDS)).optional(),
  filters: z.array(id).optional(),
};

const headlineBlock = z.strictObject({ id, type: z.literal("headline"), comparison: text, ...blockText, title: text });
/** The answer when it is a pattern: every primary comparison of one candidate on one metric, counted by verdict. Its words are generated. */
const summaryBlock = z.strictObject({ id, type: z.literal("summary"), candidate: id, metric: id });

const chartBlock = z.strictObject({
  id,
  type: z.literal("chart"),
  chart: z.enum(CHART_TYPES),
  ...blockText,
  title: text,
  metric: id.optional(),
  x: id.optional(),
  y: id.optional(),
  node: id.optional(),
  breakdown: text.optional(),
  series: z.literal("candidate").optional(),
  uncertainty: z.literal("ci").optional(),
  scale: scale.optional(),
  sort: z.enum(["value", "declared"]).optional(),
  annotations: z.array(z.strictObject({ candidate: id.optional(), node: id.optional(), text })).optional(),
  comparisons: z.array(text).min(1).optional(),
  effect_format: z.enum(["percent", "times"]).optional(),
});

const tableBlock = z.strictObject({
  id,
  type: z.literal("table"),
  ...blockText,
  metrics: z.array(id).min(1),
  node: id.optional(),
  rows: text.optional(),
  columns: z.literal("candidate").optional(),
  show: z.array(z.enum(["n", "ci", "failures", "evidence"])).min(1),
});

const textBlock = z.strictObject({ id, type: z.literal("text"), title: text.optional(), description: text });
const trustBlock = z.strictObject({ id, type: z.enum(TRUST_BLOCK_TYPES) });

export const blockSchema = z.discriminatedUnion("type", [headlineBlock, summaryBlock, chartBlock, tableBlock, textBlock, trustBlock]);

export const exportSchema = z.strictObject({
  id,
  blocks: z.array(id).min(1),
  format: z.enum(["svg", "png"]),
  size: z.enum(EXPORT_SIZES),
  mode: z.enum(["light", "dark", "both"]).optional(),
  filter_state: z.record(id, text).optional(),
});

export type Style = z.infer<typeof styleSchema>;
export type Filter = z.infer<typeof filterSchema>;
export type Block = z.infer<typeof blockSchema>;
export type ChartBlock = z.infer<typeof chartBlock>;
export type SummaryBlock = z.infer<typeof summaryBlock>;
export type HeadlineBlock = z.infer<typeof headlineBlock>;
export type TableBlock = z.infer<typeof tableBlock>;
export type Export = z.infer<typeof exportSchema>;
export type ChartType = (typeof CHART_TYPES)[number];
export type ExportSize = (typeof EXPORT_SIZES)[number];

/** The blocks that state the answer: side by side at the top of the page, three at most. */
export const isAnswerBlock = (block: { type: string }) => block.type === "headline" || block.type === "summary";
