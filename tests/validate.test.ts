import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compute, METHODS_VERSION, parseRaw, type RawFile } from "../src/compute/compute.js";
import { loadRaw } from "../src/compute/files.js";
import type { Issue } from "../src/rules/registry.js";
import { rule } from "../src/rules/registry.js";
import { benchmarkSchema, type Benchmark } from "../src/schema/benchmark.js";
import { checkCharts } from "../src/validate/chart-checks.js";
import { checkPresentation } from "../src/validate/presentation-checks.js";
import { validate } from "../src/validate/validate.js";
import { planOf, rawFileOf, scriptsBenchmarkOf, versionsBenchmarkOf, withTasksAsPrimary } from "./helpers.js";

const ALL_EXAMPLES = readdirSync("examples").filter((folder) => existsSync(`examples/${folder}/benchmark.json`));
const isComputed = (id: string) => JSON.parse(readFileSync(`examples/${id}/benchmark.json`, "utf8")).results.computed !== undefined;
const COMPUTED_EXAMPLES = ALL_EXAMPLES.filter(isComputed);

function loadExample(id: string): { benchmark: Benchmark; rawFiles: Record<string, RawFile> } {
  const path = `examples/${id}/benchmark.json`;
  const benchmark = benchmarkSchema.parse(JSON.parse(readFileSync(path, "utf8")));

  return { benchmark, rawFiles: loadRaw(benchmark.results, path) };
}

const errorsOf = (issues: Issue[]) => issues.filter((issue) => issue.severity === "error");
const rulesOf = (issues: Issue[]) => issues.map((issue) => issue.rule);
const copyOf = <T>(value: T): T => structuredClone(value);

describe("the reference examples", () => {
  it.each(COMPUTED_EXAMPLES)("%s is valid: every computed field matches its raw files", (id) => {
    const { benchmark, rawFiles } = loadExample(id);
    const report = validate(benchmark, rawFiles);

    expect(report.issues).toEqual([]);
    expect(report.state).toBe("computed");
    expect(report.resultsHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("their plans alone are valid before any measurement", () => {
    for (const id of ALL_EXAMPLES) {
      const { benchmark } = loadExample(id);
      const {
        computed: _stamp,
        comparisons: _comparisons,
        failures: _failures,
        exclusions: _exclusions,
        observed: _observed,
        ...plan
      } = benchmark.results;
      const declaredOnly = (plan.values ?? []).filter((value) => value.source === "declared" && value.evidence);
      const report = validate({ ...benchmark, results: { ...plan, values: declaredOnly.length > 0 ? declaredOnly : undefined } }, {});

      expect(errorsOf(report.issues)).toEqual([]);
      expect(report.state).toBe("plan");
    }
  });
});

describe("tampering", () => {
  const { benchmark, rawFiles } = loadExample("json-cli-parse");

  it("a computed value edited by hand is an error that names the field", () => {
    const edited = copyOf(benchmark);

    edited.results.values![1].value = 1.9;
    const errors = errorsOf(validate(edited, rawFiles).issues);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rule: "F18", path: "results.values[wall_time||fastjson].value" });
  });

  it("an overclaimed verdict is caught from the stored interval alone", () => {
    const edited = copyOf(benchmark);
    const tinyjson = edited.results.comparisons!.find((comparison) => comparison.id === "wall_time__tinyjson")!;

    tinyjson.verdict = "better";
    const errors = errorsOf(validate(edited, rawFiles).issues);

    expect(errors.map((error) => [error.rule, error.path])).toContainEqual(["S7", "results.comparisons[wall_time__tinyjson].verdict"]);
  });

  it("one raw line changed is reported as a changed raw file", () => {
    const original = readFileSync("examples/json-cli-parse/data/runs.jsonl", "utf8");
    const changedRawFiles = { runs: parseRaw("runs", original.replace(/"value":(\d)/, '"value":9$1')) };
    const errors = errorsOf(validate(benchmark, changedRawFiles).issues);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("changed since astrolabe compute ran");
  });

  it("a missing raw file is an error", () => {
    expect(rulesOf(errorsOf(validate(benchmark, {}).issues))).toEqual(["F16"]);
  });

  it("a number that differs by one unit in its last digit passes", () => {
    const nudged = copyOf(benchmark);
    const value = nudged.results.values![0];

    value.value = Number((value.value + 10 ** (Math.floor(Math.log10(value.value)) - 5)).toPrecision(6));
    expect(value.value).not.toBe(benchmark.results.values![0].value);
    expect(errorsOf(validate(nudged, rawFiles).issues)).toEqual([]);
  });

  it("an older methods version asks for a recompute and never reports tampering", () => {
    const older = copyOf(benchmark);

    older.results.computed!.methods_version = "1";
    older.results.values![0].value = 99;
    const errors = errorsOf(validate(older, rawFiles).issues);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe(`computed with methods version 1, this tool uses ${METHODS_VERSION}: run astrolabe compute again`);
  });

  it("computed fields typed without running compute are refused", () => {
    const typed = copyOf(benchmark);

    delete typed.results.computed;
    expect(rulesOf(errorsOf(validate(typed, rawFiles).issues))).toEqual(["F18"]);
  });

  it("a failure warning switched off by hand is caught", () => {
    const usability = loadExample("notes-apps-onboarding");
    const edited = copyOf(usability.benchmark);
    const onTheCreateTask = edited.results.comparisons!.find((comparison) => comparison.id === "time__t_create__notes_b")!;

    expect(onTheCreateTask.failure_warning).toBe(true);
    onTheCreateTask.failure_warning = false;
    expect(rulesOf(errorsOf(validate(edited, usability.rawFiles).issues))).toContain("T8");
  });
});

describe("claims in the presentation", () => {
  const { benchmark, rawFiles } = loadExample("support-assistant-eval");
  const withBlock = (block: Record<string, unknown>) => ({ ...copyOf(benchmark), blocks: [block], layout: undefined });

  it("an asserted verdict that no longer holds fails the file", () => {
    const stale = withBlock({
      id: "claim",
      type: "chart",
      chart: "effect",
      metric: "accuracy",
      title: "Reasoning is better too",
      asserts: { accuracy__reasoning__model_a: "better" },
    });

    expect(rulesOf(errorsOf(validate(stale, rawFiles).issues))).toEqual(["V25"]);
  });

  it("a title longer than 60 characters as the reader sees it is a warning", () => {
    const titleIssues = (title: string) =>
      validate(withBlock({ id: "claim", type: "chart", chart: "effect", metric: "accuracy", title }), rawFiles).issues.filter(
        (issue) => issue.rule === "V25",
      );
    const longOnlyAsTyped = "{candidate:model_a} or {candidate:model_b}: the same on {metric:accuracy}";
    const longAsShown = "{candidate:model_a} is more accurate than {candidate:model_b} on coding, reasoning and writing";

    expect(longOnlyAsTyped.length).toBeGreaterThan(60);
    expect(titleIssues(longOnlyAsTyped)).toEqual([]);
    expect(titleIssues(longAsShown).map((issue) => [issue.severity, issue.path, issue.message])).toEqual([
      [
        "warning",
        "blocks[0].title",
        'the title reads "Model A is more accurate than Model B on coding, reasoning and writing", 70 characters: keep the claim to 60 at most, and move the rest to the reading in description',
      ],
    ]);
  });

  it('a title that leaves out the "likely" of its verdict is a warning', () => {
    const claim = (asserted: string, title = "{candidate:model_a} is more accurate") =>
      validate(
        withBlock({
          id: "claim",
          type: "chart",
          chart: "effect",
          metric: "accuracy",
          title,
          asserts: { accuracy__suite__model_a: asserted },
        }),
        rawFiles,
      ).issues.filter((issue) => issue.rule === "V25");

    expect(claim("better").map((issue) => [issue.severity, issue.message])).toEqual([
      [
        "warning",
        'the title relies on "accuracy__suite__model_a", whose verdict is "likely better", but neither the title nor the reading says "likely": write it, and assert "likely better"',
      ],
    ]);
    expect(
      claim("likely better").map((issue) => issue.severity),
      "the full verdict asserted, the words still firmer",
    ).toEqual(["warning"]);
    expect(claim("likely better", "{candidate:model_a} is likely more accurate")).toEqual([]);
    expect(claim("better", "{candidate:model_a} is likely more accurate")).toEqual([]);
    expect(claim("better", "Accuracy: {verdict:accuracy__suite__model_a}")).toEqual([]);
  });

  it("a headline on an exploratory comparison is refused", () => {
    const exploratory = withBlock({
      id: "claim",
      type: "headline",
      comparison: "accuracy__bugfix__model_a",
      title: "{effect:accuracy__bugfix__model_a} on bug fixes",
    });

    expect(rulesOf(errorsOf(validate(exploratory, rawFiles).issues))).toEqual(["S11"]);
  });

  it("a number typed in a title is refused, a template is not", () => {
    const typedNumber = withBlock({ id: "claim", type: "headline", comparison: "accuracy__suite__model_a", title: "6 points ahead" });

    expect(rulesOf(errorsOf(validate(typedNumber, rawFiles).issues))).toEqual(["V26"]);
    const template = withBlock({
      id: "claim",
      type: "headline",
      comparison: "accuracy__suite__model_a",
      title: "{effect:accuracy__suite__model_a} ahead",
    });

    expect(errorsOf(validate(template, rawFiles).issues)).toEqual([]);
  });

  it("a template that names nothing is refused", () => {
    const unknown = withBlock({ id: "claim", type: "text", description: "{verdict:accuracy__nowhere__model_a}" });

    expect(rulesOf(errorsOf(validate(unknown, rawFiles).issues))).toEqual(["V26"]);
  });
});

describe("summaries in the presentation", () => {
  const summaryIssues = (benchmark: Benchmark, block: Record<string, unknown>) =>
    checkPresentation({
      ...benchmark,
      blocks: [{ id: "summary", type: "summary", ...block } as never],
      layout: undefined,
    });
  const pattern = () => withTasksAsPrimary(loadExample("support-assistant-eval").benchmark);

  it("counts the primary comparisons of a candidate on a metric, when they share one level", () => {
    expect(errorsOf(summaryIssues(pattern(), { candidates: ["model_a"], metric: "accuracy" }))).toEqual([]);
  });

  it("refuses a summary of the baseline, of one comparison, or of a total together with its parts", () => {
    const messageOf = (benchmark: Benchmark, block: Record<string, unknown>) =>
      errorsOf(summaryIssues(benchmark, block)).map((issue) => [issue.rule, issue.message]);

    expect(messageOf(pattern(), { metric: "accuracy" })).toEqual([]);
    expect(messageOf(pattern(), { candidates: ["model_b"], metric: "accuracy" })).toEqual([
      ["S7", '"model_b": not a candidate compared with the baseline'],
    ]);
    expect(messageOf(pattern(), { metric: "cost_per_item" })).toEqual([
      [
        "S11",
        'a summary counts the primary comparisons of "model_a" on "cost_per_item", and there is one: use a headline on "cost_per_item__suite__model_a"',
      ],
    ]);
    expect(messageOf(loadExample("support-assistant-eval").benchmark, { metric: "accuracy" })).toEqual([
      [
        "S11",
        'the primary comparisons of "model_a" on "accuracy" sit on several levels (suite, category): a summary counts one level, so that a total is not counted with its parts; use headlines',
      ],
    ]);
  });

  it("leaves the page's choices to the agent: no answer at the top, four blocks in a row, a long effect chart", () => {
    const { benchmark } = loadExample("support-assistant-eval");
    const withoutAnswers = { ...benchmark, blocks: benchmark.blocks!.filter((block) => block.type !== "headline"), layout: undefined };
    const headline = (id: string) => ({
      id,
      type: "headline",
      comparison: "accuracy__suite__model_a",
      title: "{effect:accuracy__suite__model_a}",
    });
    const ids = ["one", "two", "three", "four"];
    const crowded = benchmarkSchema.parse({ ...copyOf(benchmark), blocks: ids.map(headline), layout: [ids], exports: undefined });
    const longChart = {
      id: "chart",
      type: "chart",
      chart: "effect",
      metric: "wall_time",
      breakdown: "script",
      title: "Wall time by script",
    };
    const long = benchmarkSchema.parse({ ...scriptsBenchmarkOf(20), blocks: [longChart] });

    expect(checkPresentation(withoutAnswers)).toEqual([]);
    expect(checkPresentation(crowded)).toEqual([]);
    expect(checkPresentation(long)).toEqual([]);
  });
});

describe("tables of effects", () => {
  const withBlocks = (scriptCount: number, blocks: Record<string, unknown>[]) =>
    checkPresentation(benchmarkSchema.parse({ ...scriptsBenchmarkOf(scriptCount), blocks }));

  it("a table of effects shows each effect's interval, and needs neither n nor failures", () => {
    const table = (show: string[]) => ({ id: "table", type: "table", metrics: ["wall_time"], rows: "script", cells: "effects", show });

    expect(errorsOf(withBlocks(3, [table(["n"])])).map((issue) => [issue.rule, issue.message])).toEqual([
      ["V31", 'the table of effects leaves out "ci": an effect is only weighed with its interval'],
    ]);
    expect(errorsOf(withBlocks(3, [table(["ci"])]))).toEqual([]);
  });
});

describe("charts in the presentation", () => {
  const { benchmark, rawFiles } = loadExample("support-assistant-eval");
  const withPresentation = (presentation: Record<string, unknown>) => ({
    ...copyOf(benchmark),
    blocks: [],
    layout: undefined,
    exports: undefined,
    ...presentation,
  });
  const locate = (issues: Issue[]) => errorsOf(issues).map((issue) => ({ rule: issue.rule, path: issue.path }));
  const errorsAt = (file: unknown) => locate(checkCharts(benchmarkSchema.parse(file), rawFiles));

  it("a chart that does not fit the shape of its data is refused", () => {
    const barsOfABreakdown = withPresentation({
      blocks: [{ id: "chart", type: "chart", chart: "bar", metric: "accuracy", breakdown: "category", title: "Accuracy" }],
    });

    expect(errorsAt(barsOfABreakdown)).toEqual([{ rule: "V1", path: "blocks[0]" }]);
  });

  it("a paired comparison shown only as two separate intervals is refused", () => {
    const twoIntervals = { id: "chart", type: "chart", chart: "dot-interval", metric: "accuracy", title: "Accuracy" };
    const headline = {
      id: "claim",
      type: "headline",
      comparison: "accuracy__suite__model_a",
      title: "{effect:accuracy__suite__model_a} accuracy",
    };

    expect(errorsAt(withPresentation({ blocks: [twoIntervals] }))).toEqual([{ rule: "V13", path: "blocks[0]" }]);
    expect(errorsAt(withPresentation({ blocks: [twoIntervals, headline] }))).toEqual([]);
  });

  it("a filter default that is not one of its options is refused", () => {
    const filters = [{ id: "category", label: "Category", level: "category", options: "from_structure", default: "nowhere" }];

    expect(errorsAt(withPresentation({ filters }))).toEqual([{ rule: "V33", path: "filters[0].default" }]);
  });

  it("filters with more combinations than can be rendered in advance are refused", () => {
    const filterOf = (id: string, level: string) => ({ id, label: id, level, options: "from_structure", default: "all", allow_all: true });
    const filters = [filterOf("category", "category"), filterOf("task", "task"), filterOf("again", "task")];

    expect(errorsAt(withPresentation({ filters }))).toEqual([{ rule: "V37", path: "filters" }]);
  });

  it("a table that leaves out the observations, intervals or failures of its values is refused", () => {
    const table = { id: "table", type: "table", metrics: ["accuracy"], rows: "task", show: ["n"] };
    const checked = (blocks: unknown[]) => locate(checkPresentation(benchmarkSchema.parse(withPresentation({ blocks }))));

    expect(checked([table])).toEqual([{ rule: "V31", path: "blocks[0].show" }]);
    expect(checked([{ ...table, show: ["n", "ci", "failures"] }])).toEqual([]);
  });

  it("an image export its chart does not fit fails the file", () => {
    const usability = loadExample("notes-apps-onboarding");
    const wide = { ...copyOf(usability.benchmark), exports: [{ id: "social", blocks: ["chart-tasks"], format: "png", size: "wide" }] };

    expect(locate(validate(wide, usability.rawFiles).issues)).toEqual([{ rule: "V41", path: "exports[0]" }]);
  });
});

describe("plan checks", () => {
  const fileOf = (results: unknown) => ({ schema_version: "0.5", results });
  const planIssues = (results: unknown) => validate(fileOf(results), {}).issues;

  it("a valid plan has no issue", () => {
    expect(planIssues(planOf())).toEqual([]);
  });

  it("schema errors cite the rule of the field", () => {
    const { baseline: _baseline, ...withoutBaseline } = planOf();
    const issues = planIssues({ ...withoutBaseline, limitations: [] });

    expect(rulesOf(issues).sort()).toEqual(["D8", "F7"]);
    expect(issues.find((issue) => issue.rule === "F7")!.path).toBe("results.baseline");
  });

  it("a misspelled field is refused instead of ignored", () => {
    const issues = planIssues({ ...planOf(), limitation: ["typo"] });

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("limitation");
  });

  it("Q7: a model never judges its own family", () => {
    const plan = copyOf(planOf()) as any;

    plan.candidates[0].family = "provider-x";
    plan.candidates[1].family = "provider-y";
    plan.judge = {
      type: "model",
      model: "Judge",
      family: "provider-x",
      used_for: [],
      method: "rubric",
      blinded: true,
      order_policy: "single",
    };
    expect(rulesOf(errorsOf(planIssues(plan)))).toEqual(["Q7"]);
    plan.judge.family = "provider-z";
    expect(errorsOf(planIssues(plan))).toEqual([]);
  });

  it("S7: the minimum meaningful difference must be greater than zero", () => {
    const plan = copyOf(planOf()) as any;

    plan.metrics[0].minimum_meaningful = 0;
    expect(rulesOf(planIssues(plan))).toEqual(["S7"]);
  });

  it("measurements on your own machines say where they ran: bare metal, a virtual machine, a container or a CI runner", () => {
    const { benchmark } = loadExample("js-runtimes");
    const { host: _host, ...environment } = benchmark.results.environment;
    const issues = validate({ ...benchmark, results: { ...benchmark.results, environment } }, {}).issues;

    expect(errorsOf(issues).map((issue) => [issue.rule, issue.path])).toEqual([["F11", "results.environment.host"]]);
  });

  it("a goal longer than the card's two lines is a warning", () => {
    const goal = "Which of these two parsers should the nightly import of our customer records use from now on?";
    const issues = planIssues({ ...planOf(), benchmark: { ...planOf().benchmark, goal } });

    expect(goal.length).toBeGreaterThan(80);
    expect(issues.map((issue) => [issue.severity, issue.rule, issue.path])).toEqual([["warning", "F2", "results.benchmark.goal"]]);
  });

  describe("planned runs must be able to give an interval", () => {
    const warningsFor = (planned: number, statistic: string, metricCount: number) => {
      const metrics = Array.from({ length: metricCount }, (_, index) => ({
        id: `metric_${index}`,
        statistic,
        from: { raw: "data", measure: `m${index}` },
      }));
      const plan = planOf({
        metrics,
        candidates: metricCount > 1 ? ["base", "new", "other"] : ["base", "new"],
        levels: [{ level: "run", field: "run", planned }],
      });

      return planIssues(plan).filter((issue) => issue.severity === "warning" && issue.rule === "S1").length;
    };

    it("a median at 95% needs 6 runs", () => {
      expect(warningsFor(5, "median", 1)).toBe(1);
      expect(warningsFor(6, "median", 1)).toBe(0);
    });

    it("four primary comparisons widen the level to 98.75%, which needs 8 runs", () => {
      expect(warningsFor(6, "median", 2)).toBe(2);
      expect(warningsFor(8, "median", 2)).toBe(0);
      expect(warningsFor(10, "median", 2)).toBe(0);
    });

    it("a 95th percentile at 95% needs 72 runs, a mean has no such minimum", () => {
      expect(warningsFor(71, "p95", 1)).toBe(1);
      expect(warningsFor(72, "p95", 1)).toBe(0);
      expect(warningsFor(5, "mean", 1)).toBe(0);
    });
  });
  it("asks to compare run time or memory script by script, not on a parent that pools or averages scripts of different sizes", () => {
    const scripts = {
      levels: ["suite", "script"],
      nodes: [
        { id: "suite", level: "suite", label: "All scripts" },
        { id: "start-up", level: "script", parent: "suite", label: "A short script" },
        { id: "parse", level: "script", parent: "suite", label: "A long script" },
      ],
    };
    const runTime = {
      id: "wall_time",
      label: "Wall time",
      unit: "s",
      direction: "lower",
      kind: "run_time",
      statistic: "median",
      compare_as: "relative",
      minimum_meaningful: 10,
    };
    const poolingWarnings = (plan: unknown) =>
      planIssues(plan)
        .filter((issue) => issue.rule === "T13")
        .map((issue) => issue.path);

    expect(poolingWarnings(planOf({ structure: scripts, metrics: [runTime] }))).toEqual(["results.metrics[0]"]);
    expect(
      poolingWarnings(planOf({ structure: scripts, metrics: [runTime], analysis: { primary: [{ metric: "wall_time", node: "suite" }] } })),
    ).toEqual(["results.analysis.primary[0]"]);
    expect(
      poolingWarnings(
        planOf({
          structure: scripts,
          metrics: [runTime],
          analysis: {
            primary: [
              { metric: "wall_time", node: "start-up" },
              { metric: "wall_time", node: "parse" },
            ],
          },
        }),
      ),
    ).toEqual([]);
    expect(poolingWarnings(planOf({ structure: scripts, analysis: { primary: [{ metric: "score", node: "suite" }] } }))).toEqual([]);

    const messageOn = (aggregation: unknown) =>
      planIssues(planOf({ structure: scripts, metrics: [{ ...runTime, aggregation }] })).find((issue) => issue.rule === "T13")!.message;

    expect(messageOn(undefined)).toContain("pools the runs of its children");
    expect(messageOn({ groups: "macro" })).toContain("averages its children's values");
  });
});

describe("usability studies with few participants", () => {
  const plan = planOf({
    metrics: [{ kind: "usability", statistic: "mean", unit: "s", direction: "lower", minimum_meaningful: 5 }],
    levels: [{ level: "participant", field: "item", planned: 12 }],
    extra: { workload: { description: "Onboarding", usage_pattern: "One session", tasks: ["Create a note"], users: "first-time users" } },
  });

  it("planning fewer than 20 participants is a warning, not an error", () => {
    const issues = validate({ schema_version: "0.5", results: plan }, {}).issues;

    expect(issues.map((issue) => [issue.severity, issue.rule])).toEqual([["warning", "U6"]]);
  });

  it("a winner named on fewer than 20 participants is caught from the file alone", () => {
    const rows = ["base", "new"].flatMap((candidate) =>
      Array.from({ length: 12 }, (_, index) => ({
        candidate,
        measure: "score",
        value: (candidate === "base" ? 100 : 60) + (index % 5),
        item: `${candidate}-${index}`,
      })),
    );
    const rawFiles = { data: rawFileOf(rows) };
    const computed = compute(plan, rawFiles, { resamples: 500 }) as any;

    computed.comparisons[0].verdict = "better";
    delete computed.comparisons[0].indicative;

    const rules = rulesOf(errorsOf(validate({ schema_version: "0.5", results: computed }, rawFiles).issues));

    expect(rules).toContain("S7");
    expect(rules).toContain("U6");
  });
});

describe("validate after compute on a hand-built file", () => {
  it("compute then validate passes, and the verdict can be checked from the file alone", () => {
    const rows = ["base", "new"].flatMap((candidate, shift) =>
      [3, 4, 5, 6, 7, 8].map((score, index) => ({ candidate, measure: "score", value: score + 5 * shift, run: index + 1 })),
    );
    const rawFiles = { data: rawFileOf(rows) };
    const results = compute(planOf(), rawFiles);
    const report = validate({ schema_version: "0.5", results }, rawFiles);

    expect(report.issues).toEqual([]);
    expect(results.comparisons![0]).toMatchObject({ effect: 5, verdict: "better" });
  });
});

describe("pairs of candidates", () => {
  it("refuses a pair naming a stranger, a candidate against itself, or the same pair twice", () => {
    const pairs = [
      { candidate: "new", vs: "nobody" },
      { candidate: "new", vs: "new" },
      { candidate: "new", vs: "base" },
      { candidate: "base", vs: "new" },
    ];
    const { issues } = validate({ schema_version: "0.5", results: planOf({ analysis: { pairs } }) } as Benchmark, {});

    expect(issues.filter((issue) => issue.path.startsWith("results.analysis.pairs")).map((issue) => [issue.path, issue.message])).toEqual([
      ["results.analysis.pairs[0]", '"nobody": not the id of a candidate'],
      ["results.analysis.pairs[1]", '"new" is compared with itself'],
      ["results.analysis.pairs[3]", '"base" and "new" are already compared: each pair once'],
    ]);
  });

  it("refuses a summary of who is best when its candidates are not all compared with each other", () => {
    const summary = { id: "summary", type: "summary", metric: "wall_time", count: "best" };
    const againstTheBaseline = { ...versionsBenchmarkOf(3, { pairs: "baseline" }), blocks: [summary] } as Benchmark;
    const everyPair = { ...versionsBenchmarkOf(3), blocks: [summary] } as Benchmark;

    expect(checkPresentation(againstTheBaseline).map((issue) => [issue.rule, issue.message])).toEqual([
      [
        "S11",
        'a summary that counts who is best needs every pair of its candidates compared on "wall_time": set analysis.pairs to "all", or name the pairs, and run astrolabe compute',
      ],
    ]);
    expect(checkPresentation(everyPair)).toEqual([]);
  });
});

describe("results drawn side by side", () => {
  const results = { id: "results", type: "chart", chart: "results", metric: "wall_time", breakdown: "script", title: "Wall time" };
  const paired = (benchmark: Benchmark) => {
    for (const comparison of benchmark.results.comparisons!) comparison.paired = true;

    return { ...benchmark, blocks: [results] } as Benchmark;
  };

  it("states paired results in words where every pair is compared, and leaves them to V13 where only the baseline is", () => {
    const everyPair = checkCharts(paired(versionsBenchmarkOf(2)), {});
    const againstTheBaseline = checkCharts(paired(versionsBenchmarkOf(2, { pairs: "baseline" })), {});

    expect(everyPair.filter((issue) => issue.rule === "V13")).toEqual([]);
    expect(againstTheBaseline.filter((issue) => issue.rule === "V13").map((issue) => issue.message)).toContain(
      '"wall_time__script-1__mid" is paired, so two separate intervals cannot show its result: show it as a headline, an effect chart or a comparison-rows chart too',
    );
  });
});
