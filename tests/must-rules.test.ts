import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allRules } from "../src/rules/registry.js";
import { validate } from "../src/validate/validate.js";
import { planOf, suiteStructure } from "./helpers.js";

/**
 * How each Must rule is proved. Every Must rule appears once:
 * - plan: a plan broken in one place, which validate refuses with that rule at that field;
 * - test: an existing test that feeds a failing input, or checks what the generator writes by construction;
 * - agent: what the agent does (asking, publishing, wording), which no check of the file can prove;
 * - page: the site and its filters, which the generator does not build yet.
 */
type Proof =
  | { plan: string; change: (plan: any) => void; field: string; reportedAs?: string }
  | { test: string; title: string }
  | { agent: string }
  | { page: string };

const humanJudge = { type: "human", used_for: [], method: "rubric", blinded: true, order_policy: "random per item", raters: 1 };
const modelJudge = {
  type: "model",
  model: "Judge",
  family: "provider-z",
  used_for: [],
  method: "rubric",
  blinded: true,
  order_policy: "both",
};
const withFamilies = (plan: any) => plan.candidates.forEach((candidate: any, index: number) => (candidate.family = `provider-${index}`));

const PROOFS: Record<string, Proof> = {
  C1: { plan: "a cost metric without pricing", change: (plan) => (plan.metrics[0].kind = "cost"), field: "candidates[0].pricing" },
  C5: {
    plan: "a price without its date",
    change: (plan) => plan.candidates.forEach((candidate: any) => (candidate.pricing = { model: "per call", source: "price page" })),
    field: "candidates[0].pricing.date",
  },
  D1: { test: "tests/chart.test.ts", title: "refuses a bar chart of negative values" },
  D3: { test: "tests/card.test.ts", title: "never cuts the axis, even when the interval lies far beyond the band" },
  D4: { test: "tests/markdown.test.ts", title: "keeps the interval, the number of observations and the failures next to every value" },
  D5: { plan: "weights without saying how a single score is made", change: (plan) => (plan.metrics[0].weight = 1), field: "composite" },
  D8: { plan: "no limitations", change: (plan) => (plan.limitations = []), field: "limitations" },
  D9: { plan: "a metric without unit", change: (plan) => (plan.metrics[0].unit = ""), field: "metrics[0].unit" },
  D12: { test: "tests/card.test.ts", title: "never shows a group alone: the best and worst of the groups below it come with it" },
  F1: { plan: "no goal", change: (plan) => (plan.benchmark.goal = ""), field: "benchmark.goal" },
  F2: { agent: "phrasing the goal neutrally" },
  F3: { plan: "a metric without label", change: (plan) => delete plan.metrics[0].label, field: "metrics[0].label" },
  F4: { plan: "no recorded research", change: (plan) => (plan.domain_research.sources = []), field: "domain_research.sources" },
  F5: {
    plan: "a workload without its usage pattern",
    change: (plan) => delete plan.workload.usage_pattern,
    field: "workload.usage_pattern",
  },
  F7: { plan: "a baseline that is not a candidate", change: (plan) => (plan.baseline = "nobody"), field: "baseline" },
  F8: {
    plan: "configurations that differ in keys",
    change: (plan) => (plan.candidates[1].config = { other: 1 }),
    field: "candidates[1].config",
  },
  F11: { plan: "no environment", change: (plan) => (plan.environment = {}), field: "environment" },
  F14: {
    plan: "a restriction without the address of its clause",
    change: (plan) => (plan.candidates[0].publication_terms.restriction = "benchmarks need written consent"),
    field: "candidates[0].publication_terms.clause_url",
  },
  F15: { test: "tests/compute.test.ts", title: "a service you do not control needs a timestamp on every row" },
  F16: { plan: "no measuring script", change: (plan) => (plan.artifacts.scripts = []), field: "artifacts.scripts" },
  F18: { plan: "a measured metric without raw data", change: (plan) => delete plan.metrics[0].from, field: "metrics[0].from" },
  H1: { agent: "publishing only on request" },
  H3: { agent: "never replacing an existing site" },
  H4: { agent: "saying what becomes public before the first publication" },
  H5: { test: "tests/cli.test.ts", title: "build writes nothing from a file that fails validate" },
  P2: {
    plan: "a judge who sees the candidates' names",
    change: (plan) => (plan.judge = { ...humanJudge, blinded: false }),
    field: "judge.blinded",
  },
  P4: {
    plan: "a candidate without its variants",
    change: (plan) => delete plan.candidates[0].variants,
    field: "candidates[0].variants",
    reportedAs: "S9",
  },
  P6: { plan: "a preference metric without a judge", change: (plan) => (plan.metrics[0].kind = "preference"), field: "judge" },
  P7: {
    plan: "several raters without their agreement",
    change: (plan) => (plan.judge = { ...humanJudge, raters: 3 }),
    field: "judge.agreement",
  },
  Q4: {
    plan: "non-deterministic candidates without repeats",
    change: (plan) => plan.benchmark.conditions.push("non_deterministic"),
    field: "runs.levels",
  },
  Q5: { agent: "checking that outputs are correct, not only that runs completed" },
  Q6: {
    plan: "a model judge without its order policy",
    change: (plan) => {
      withFamilies(plan);
      plan.judge = { ...modelJudge, order_policy: undefined };
    },
    field: "judge.order_policy",
  },
  Q7: {
    plan: "a model judging its own family",
    change: (plan) => {
      withFamilies(plan);
      plan.judge = { ...modelJudge, family: "provider-0" };
    },
    field: "judge.family",
  },
  Q9: {
    plan: "a node under a parent that does not exist",
    change: (plan) =>
      (plan.structure = {
        ...suiteStructure,
        nodes: [...suiteStructure.nodes, { id: "lost", level: "task", parent: "nowhere", label: "Lost" }],
      }),
    field: "structure.nodes[6].parent",
  },
  Q10: {
    plan: "tuned candidates without a contamination check",
    change: (plan) => plan.benchmark.conditions.push("trained_or_tuned"),
    field: "workload.contamination",
  },
  R1: { plan: "a memory metric without its scope", change: (plan) => (plan.metrics[0].kind = "memory"), field: "metrics[0].scope" },
  R2: {
    plan: "a CPU share compared in points",
    change: (plan) => Object.assign(plan.metrics[0], { kind: "cpu", unit: "%", scope: "process and children" }),
    field: "metrics[0].compare_as",
  },
  R4: { plan: "an energy metric without its domain", change: (plan) => (plan.metrics[0].kind = "energy"), field: "metrics[0].scope" },
  R8: { agent: "naming the memory metric exactly in metrics[].definition, which the schema requires" },
  R10: {
    plan: "a managed runtime without its settings",
    change: (plan) => plan.benchmark.conditions.push("managed_runtime"),
    field: "environment.runtime_settings",
  },
  S1: { plan: "no planned runs", change: (plan) => (plan.runs.levels = []), field: "runs.levels" },
  S3: { test: "tests/compute.test.ts", title: "relative effects are bootstrapped with the baseline in the denominator" },
  S7: {
    plan: "a minimum meaningful difference of zero",
    change: (plan) => (plan.metrics[0].minimum_meaningful = 0),
    field: "metrics[0].minimum_meaningful",
  },
  S9: {
    plan: "variants tested without naming the selected one",
    change: (plan) => (plan.candidates[0].variants = { tested: ["a", "b"], selected: null }),
    field: "candidates[0].variants.selected",
  },
  S11: {
    plan: "a primary comparison on an unknown metric",
    change: (plan) => (plan.analysis = { primary: [{ metric: "nothing" }] }),
    field: "analysis.primary[0].metric",
  },
  T1: { plan: "run times without warm-up", change: (plan) => (plan.metrics[0].kind = "run_time"), field: "runs.warmup" },
  T6: { plan: "latency read at the mean only", change: (plan) => (plan.metrics[0].kind = "latency"), field: "metrics[0].statistic" },
  T7: {
    plan: "a load test without its arrival model",
    change: (plan) => plan.benchmark.conditions.push("load_test"),
    field: "workload.arrival_model",
  },
  T8: { test: "tests/compute.test.ts", title: "failed observations without failures_count_as are refused" },
  U1: { plan: "a usability metric without tasks and users", change: (plan) => (plan.metrics[0].kind = "usability"), field: "workload" },
  U2: { agent: "measuring success, time and satisfaction in a usability study" },
  U6: { test: "tests/compute.test.ts", title: "a usability comparison with fewer than 20 participants is indicative and names no winner" },
  V1: { test: "tests/validate.test.ts", title: "a chart that does not fit the shape of its data is refused" },
  V2: { test: "tests/chart.test.ts", title: "accepts only the closed set of chart types: no angle, no area, no second axis" },
  V5: { test: "tests/chart.test.ts", title: "accepts only the closed set of chart types: no angle, no area, no second axis" },
  V6: { test: "tests/chart.test.ts", title: "shares its scale with the blocks it names" },
  V7: {
    test: "tests/card.test.ts",
    title: "can be read alone: the question, effects, verdicts, intervals, how to read and the provenance",
  },
  V9: { test: "tests/chart.test.ts", title: "draws a log scale with real values on its ticks, names it, and refuses bars on it" },
  V11: { test: "tests/chart.test.ts", title: "draws the interval of every value that has one" },
  V16: { page: "colours from style only" },
  V17: { page: "one colour per candidate" },
  V18: { test: "tests/chart.test.ts", title: "tells candidates apart by shape as well as by colour" },
  V19: { test: "tests/chart.test.ts", title: "moves a colour that would be too faint towards the ink, and keeps one that is visible" },
  V23: { test: "tests/chart.test.ts", title: "shades with a single grey ramp, the figures readable on every shade" },
  V25: { test: "tests/validate.test.ts", title: "an asserted verdict that no longer holds fails the file" },
  V26: { test: "tests/validate.test.ts", title: "a number typed in a title is refused, a template is not" },
  V27: {
    test: "tests/card.test.ts",
    title: "can be read alone: the question, effects, verdicts, intervals, how to read and the provenance",
  },
  V31: { test: "tests/markdown.test.ts", title: "keeps the interval, the number of observations and the failures next to every value" },
  V33: { test: "tests/validate.test.ts", title: "a filter default that is not one of its options is refused" },
  V34: { page: "tooltips" },
  V41: {
    test: "tests/card.test.ts",
    title: "can be read alone: the question, effects, verdicts, intervals, how to read and the provenance",
  },
  V42: {
    test: "tests/card.test.ts",
    title: "can be read alone: the question, effects, verdicts, intervals, how to read and the provenance",
  },
  V43: {
    test: "tests/chart.test.ts",
    title: "plans a wide or square image of one chart, in light mode unless asked otherwise, with the default filter state",
  },
  V44: { test: "tests/markdown.test.ts", title: "keeps the interval, the number of observations and the failures next to every value" },
  V46: { test: "tests/card.test.ts", title: "carries a text alternative for screen readers and for the README image" },
  V47: { test: "tests/chart.test.ts", title: "gives every chart type a data table and a text alternative" },
  V48: { page: "keyboard use of filters" },
  V49: { test: "tests/card.test.ts", title: "draws no text below 12 px" },
  V54: {
    test: "tests/chart.test.ts",
    title: "shows each comparison on its own row, with a factor and its word, or the verdict instead of a figure",
  },
  V56: {
    plan: "a declared value without its source",
    change: (plan) => {
      plan.metrics[0].kind = "feature";
      delete plan.metrics[0].from;
      plan.values = [{ candidate: "base", metric: "score", value: 1, source: "declared" }];
    },
    field: "values[0].evidence",
  },
};

const mustRules = allRules().filter((entry) => entry.level === "must");
const entries = Object.entries(PROOFS);

describe("Must rules", () => {
  it("each has a proof: a failing plan, a test, the agent's behaviour, or the page still to build", () => {
    const mustIds = mustRules.map((entry) => entry.id).sort();

    expect(
      mustIds.filter((id) => !(id in PROOFS)),
      "Must rules without a proof",
    ).toEqual([]);
    expect(
      Object.keys(PROOFS).filter((id) => !mustIds.includes(id)),
      "proofs of rules that are not Must",
    ).toEqual([]);
  });

  const planProofs = entries
    .filter((entry): entry is [string, Extract<Proof, { plan: string }>] => "plan" in entry[1])
    .map(([ruleId, proof]) => [ruleId, proof.plan, proof] as const);

  it.each(planProofs)("%s: validate refuses %s", (ruleId, _description, proof) => {
    const plan = structuredClone(planOf()) as any;

    proof.change(plan);

    const issues = validate({ schema_version: "0.5", results: plan }, {}).issues.filter((issue) => issue.severity === "error");
    const expected = { rule: proof.reportedAs ?? ruleId, path: `results.${proof.field}` };

    expect(issues.map((issue) => ({ rule: issue.rule, path: issue.path }))).toContainEqual(expected);
  });

  const testProofs = entries
    .filter((entry): entry is [string, Extract<Proof, { test: string }>] => "test" in entry[1])
    .map(([ruleId, proof]) => [ruleId, proof.title, proof] as const);

  it.each(testProofs)("%s: proved by the test that %s", (_ruleId, _title, proof) => {
    expect(readFileSync(proof.test, "utf8")).toContain(`"${proof.title}"`);
  });
});
