import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compute } from "../src/compute/compute.js";
import type { Issue } from "../src/rules/registry.js";
import { cardContentOf, renderCard } from "../src/render/card.js";
import { caveatSentences, comparisonsOn, UNBLINDED_JUDGES_WARNING } from "../src/render/chart/chart-content.js";
import { lookupOf, restsOnUnblindedJudges } from "../src/render/describe.js";
import { renderMarkdown } from "../src/render/markdown.js";
import { benchmarkSchema, SCHEMA_VERSION, type Benchmark, type Results } from "../src/schema/benchmark.js";
import { validate } from "../src/validate/validate.js";
import { planOf, rawFileOf } from "./helpers.js";

const context = { generatorVersion: "0.1.0", buildDate: "2026-11-18" };
const BASE_SCORES = [5, 6, 7, 5, 6, 7, 6, 5, 6, 7];
const NEW_SCORES = [6, 7, 7, 6, 8, 7, 7, 6, 7, 8];

function tastingPlan(options: { gatheredBeforePlan: boolean; judge?: Record<string, unknown> }): Results {
  const plan = planOf({
    metrics: [{ kind: "preference", label: "Taster score", definition: "Score from 1 to 10 given by one taster to one loaf" }],
    levels: [{ level: "taster", field: "item", planned: 10 }],
    extra: {
      judge: {
        type: "participants",
        method: "each taster scored each loaf from 1 to 10",
        blinded: false,
        order_policy: "fixed: base served first",
        ...options.judge,
      },
    },
  });

  if (options.gatheredBeforePlan) plan.benchmark.conditions.push("gathered_before_plan");

  return plan;
}

const issuesOf = (results: Results) =>
  validate({ schema_version: SCHEMA_VERSION, results } as Benchmark, {}).issues.map(({ severity, rule, path }: Issue) => ({
    severity,
    rule,
    path,
  }));

function computedTasting(): Benchmark {
  const rows = BASE_SCORES.flatMap((score, index) => [
    { candidate: "base", measure: "score", value: score, item: `taster-${index}` },
    { candidate: "new", measure: "score", value: NEW_SCORES[index], item: `taster-${index}` },
  ]);
  const results = compute(tastingPlan({ gatheredBeforePlan: true }), { data: rawFileOf(rows) }, { resamples: 2000 });

  return { schema_version: SCHEMA_VERSION, results } as Benchmark;
}

describe("data gathered before the plan", () => {
  it("accepts judges who knew which candidate was which, as a warning, only when the data was gathered before the plan", () => {
    expect(issuesOf(tastingPlan({ gatheredBeforePlan: true }))).toEqual([
      { severity: "warning", rule: "P2", path: "results.judge.blinded" },
    ]);
    expect(issuesOf(tastingPlan({ gatheredBeforePlan: false }))).toEqual([
      { severity: "error", rule: "P2", path: "results.judge.blinded" },
    ]);
  });

  it("still asks whether the judges were blind and in which order they saw the candidates", () => {
    const issues = issuesOf(tastingPlan({ gatheredBeforePlan: true, judge: { blinded: undefined, order_policy: undefined } }));

    expect(issues).toEqual([
      { severity: "error", rule: "P2", path: "results.judge.blinded" },
      { severity: "error", rule: "P2", path: "results.judge.order_policy" },
    ]);
  });

  it("asks no agreement figure from participants who score the candidates for themselves", () => {
    expect(issuesOf(tastingPlan({ gatheredBeforePlan: false, judge: { blinded: true } }))).toEqual([]);
  });

  it("warns instead of refusing when several raters gathered before the plan have no agreement figure", () => {
    const raters = { type: "human", raters: 3, blinded: true };

    expect(issuesOf(tastingPlan({ gatheredBeforePlan: true, judge: raters }))).toEqual([
      { severity: "warning", rule: "P7", path: "results.judge.agreement" },
    ]);
    expect(issuesOf(tastingPlan({ gatheredBeforePlan: false, judge: raters }))).toEqual([
      { severity: "error", rule: "P7", path: "results.judge.agreement" },
    ]);
  });

  it("asks a judge for the nodes it scores only when the plan has a structure", () => {
    const withoutStructure = tastingPlan({ gatheredBeforePlan: false, judge: { blinded: true } });

    expect(withoutStructure.judge!.used_for).toBeUndefined();
    expect(issuesOf(withoutStructure)).toEqual([]);

    const suite = benchmarkSchema.parse(JSON.parse(readFileSync("examples/support-assistant-eval/benchmark.json", "utf8")));

    delete suite.results.judge!.used_for;
    expect(validate(suite, {}).issues.map((issue) => issue.path)).toContain("results.judge.used_for");
  });
});

describe("a verdict that rests on judges who knew which candidate was which", () => {
  const tasting = computedTasting();

  it("says so beside the comparison in the report, on the card and in its text alternative", () => {
    const report = renderMarkdown(tasting, context);
    const card = renderCard(tasting, cardContentOf(tasting), "light", context);

    expect(report).toMatch(/\| new, taster score \|[^\n]*\| not blind: the judges knew which candidate was which \|/);
    expect(report).toContain("Judge: the participants themselves, each scoring the candidates;");
    expect(report).toContain("Declared conditions: gathered before plan.");
    expect(card.textLines).toContain("The judges knew which candidate was which");
    expect(card.altText).toContain("(the judges knew which candidate was which)");
  });

  it("warns under every chart of a metric those judges scored", () => {
    const lookup = lookupOf(tasting.results);
    const metric = tasting.results.metrics[0];

    expect(caveatSentences(lookup, metric, comparisonsOn(metric, lookup))).toContain(UNBLINDED_JUDGES_WARNING);
  });

  it("says so only on the comparisons the judge scored", () => {
    const suite = benchmarkSchema.parse(JSON.parse(readFileSync("examples/support-assistant-eval/benchmark.json", "utf8")));

    suite.results.judge!.blinded = false;

    const lookup = lookupOf(suite.results);
    const flagged = new Set(
      suite.results
        .comparisons!.filter((comparison) => restsOnUnblindedJudges(lookup, comparison))
        .map((comparison) => `${comparison.metric}@${comparison.node}`),
    );

    expect([...flagged].sort()).toEqual(["accuracy@policy_qa", "accuracy@reasoning", "accuracy@suite"]);
  });
});
