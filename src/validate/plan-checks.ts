import { minObservations } from "../compute/stats.js";
import { ALPHA, declaredInputs } from "../compute/compute.js";
import { PARTICIPANTS_TO_RANK } from "../compute/verdict.js";
import type { Issue } from "../rules/registry.js";
import type { Metric, Results } from "../schema/benchmark.js";

const KINDS_MEASURED_ON_AUTHOR_MACHINES = new Set(["run_time", "throughput", "memory", "cpu", "energy"]);
const KINDS_NEEDING_WARMUP = new Set(["run_time", "latency", "throughput"]);
const KINDS_NEEDING_SCOPE = new Set(["cpu", "memory", "energy"]);
const KINDS_ALLOWED_WITHOUT_RAW_DATA = new Set(["cost", "feature"]);
const QUANTILE_OF_STATISTIC: Record<string, number> = { median: 0.5, p50: 0.5, p95: 0.95, p99: 0.99 };

export function checkPlan(results: Results): Issue[] {
  const issues: Issue[] = [];
  const error = (rule: string, path: string, message: string) => issues.push({ severity: "error", rule, path: `results.${path}`, message });
  const warning = (rule: string, path: string, message: string) =>
    issues.push({ severity: "warning", rule, path: `results.${path}`, message });

  const candidateIds = results.candidates.map((candidate) => candidate.id);
  const metricIds = results.metrics.map((metric) => metric.id);
  const rawFileIds = results.raw_data.map((rawFile) => rawFile.id);
  const nodeIds = (results.structure?.nodes ?? []).map((node) => node.id);
  const conditions = new Set(results.benchmark.conditions);
  const metricKinds = new Set(results.metrics.map((metric) => metric.kind));
  const hasKindIn = (kinds: Set<string>) => [...metricKinds].some((kind) => kinds.has(kind));

  const reportDuplicates = (ids: string[], path: string) => {
    const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);

    for (const id of new Set(duplicated)) error("schema", path, `the id "${id}" is used more than once`);
  };

  reportDuplicates(candidateIds, "candidates");
  reportDuplicates(metricIds, "metrics");
  reportDuplicates(rawFileIds, "raw_data");
  reportDuplicates(nodeIds, "structure.nodes");

  if (!candidateIds.includes(results.baseline)) error("F7", "baseline", `"${results.baseline}" is not the id of a candidate`);

  checkCandidates();
  checkStructure();
  checkMetrics();
  checkDeclaredConditions();
  checkJudge();
  checkEnvironmentAndRuns();
  checkAnalysis();
  checkDeclaredValues();
  checkPlannedRunsGiveAnInterval();

  return issues;

  function checkCandidates() {
    const configKeysOfFirst = Object.keys(results.candidates[0].config).sort().join(", ");

    results.candidates.forEach((candidate, index) => {
      const path = `candidates[${index}]`;
      const configKeys = Object.keys(candidate.config).sort().join(", ");

      if (configKeys !== configKeysOfFirst) {
        error(
          "F8",
          `${path}.config`,
          `every candidate documents the same configuration keys: "${candidate.id}" has (${configKeys}), "${candidateIds[0]}" has (${configKeysOfFirst})`,
        );
      }

      const noRestrictionFound = /^none\b/i.test(candidate.publication_terms.restriction.trim());

      if (!noRestrictionFound && !candidate.publication_terms.clause_url) {
        error("F14", `${path}.publication_terms.clause_url`, "a restriction was found: give the address of the clause");
      }

      if (candidate.variants.tested.length > 0) {
        if (!candidate.variants.selected) error("S9", `${path}.variants.selected`, "variants were tested: name the one that was selected");

        if (candidate.variants.remeasured_on_fresh_runs === undefined) {
          error(
            "S9",
            `${path}.variants.remeasured_on_fresh_runs`,
            "variants were tested: say whether the selected one was measured again on fresh runs",
          );
        }
      }

      if (metricKinds.has("cost") && !candidate.pricing)
        error("C1", `${path}.pricing`, "a cost metric needs the pricing of every candidate: model, source and date");

      if (results.judge?.type === "model" && !candidate.family)
        error("Q7", `${path}.family`, "a model judge is used: give the model family of every candidate");
    });
  }

  function checkStructure() {
    const structure = results.structure;

    if (!structure) return;

    structure.nodes.forEach((node, index) => {
      const path = `structure.nodes[${index}]`;

      if (!structure.levels.includes(node.level)) error("Q9", `${path}.level`, `"${node.level}" is not one of structure.levels`);

      if (node.parent !== undefined && !nodeIds.includes(node.parent))
        error("Q9", `${path}.parent`, `"${node.parent}" is not the id of a node`);

      if (node.parent === node.id) error("Q9", `${path}.parent`, "a node cannot be its own parent");
    });
  }

  function checkMetrics() {
    const severalMetrics = results.metrics.length > 1;
    const anyWeight = results.metrics.some((metric) => metric.weight !== undefined);

    results.metrics.forEach((metric, index) => {
      const path = `metrics[${index}]`;

      if (!metric.from && !KINDS_ALLOWED_WITHOUT_RAW_DATA.has(metric.kind)) {
        error("F18", `${path}.from`, `a "${metric.kind}" metric is measured: name the raw file and the measure it reads`);
      }

      if (metric.from && !rawFileIds.includes(metric.from.raw))
        error("F16", `${path}.from.raw`, `"${metric.from.raw}" is not the id of an entry of raw_data`);

      if (severalMetrics && metric.weight === undefined)
        error("F3", `${path}.weight`, "with several metrics, each one has a weight confirmed by the user");

      if (KINDS_NEEDING_SCOPE.has(metric.kind) && !metric.scope) {
        if (metric.kind === "energy")
          error(
            "R4",
            `${path}.scope`,
            "an energy metric says which domain its counter covers (package, cores, DRAM), not the whole machine",
          );
        else error("R1", `${path}.scope`, `a "${metric.kind}" metric says what its counter covers`);
      }
    });

    results.metrics.forEach((metric, index) => {
      if (KINDS_NEEDING_SCOPE.has(metric.kind) && metric.unit === "%" && metric.compare_as === "difference") {
        error(
          "R2",
          `metrics[${index}].compare_as`,
          "a change in usage is a relative increase: 6% to 13% is more than double, not 7 points; compare it as relative",
        );
      }
    });

    const latencyMetrics = results.metrics.filter((metric) => metric.kind === "latency");

    if (latencyMetrics.length > 0 && !latencyMetrics.some((metric) => metric.statistic in QUANTILE_OF_STATISTIC)) {
      const index = results.metrics.indexOf(latencyMetrics[0]);

      error("T6", `metrics[${index}].statistic`, "latency is read at percentiles: give at least one latency metric a median, p95 or p99");
    }

    if (anyWeight && !results.composite) error("D5", "composite", "weights are given: say whether a single score is computed, and how");

    if (results.composite?.computed && !results.composite.method)
      error("D5", "composite.method", "a computed single score needs its method");

    if (metricKinds.has("usability") && (!results.workload.tasks?.length || !results.workload.users)) {
      error("U1", "workload", "a usability metric needs workload.tasks, with their success criteria, and workload.users");
    }

    const participants = results.runs.levels[0].planned;

    if (metricKinds.has("usability") && participants < PARTICIPANTS_TO_RANK) {
      warning(
        "U6",
        "runs.levels[0].planned",
        `${participants} participants can find problems but cannot rank products: the results will be indicative and name no winner; plan at least ${PARTICIPANTS_TO_RANK} per candidate to compare`,
      );
    }
  }

  function checkDeclaredConditions() {
    if (conditions.has("non_deterministic") && !results.runs.levels.some((level) => level.field === "repeat")) {
      error("Q4", "runs.levels", 'non-deterministic candidates need repeats per item: add a level whose field is "repeat"');
    }

    if (conditions.has("trained_or_tuned") && !results.workload.contamination) {
      error("Q10", "workload.contamination", "candidates were trained or tuned: say whether they may have seen the items");
    }

    if (conditions.has("managed_runtime") && results.environment.runtime_settings === undefined) {
      error("R10", "environment.runtime_settings", "a managed runtime needs its settings: heap size, collector");
    }

    if (conditions.has("load_test") && !results.workload.arrival_model)
      error("T7", "workload.arrival_model", "a load test states its arrival model");
  }

  function checkJudge() {
    const judge = results.judge;
    const judgedNodes = (results.structure?.nodes ?? []).filter((node) => node.scoring === "judge");

    if (!judge) {
      if (judgedNodes.length > 0 || metricKinds.has("preference")) error("P6", "judge", "a judge scores some results: describe it");

      return;
    }

    const gatheredBeforePlan = conditions.has("gathered_before_plan");

    if (judge.method === undefined) error("Q6", "judge.method", "a judge needs method");

    if (nodeIds.length > 0 && judge.used_for === undefined) error("Q6", "judge.used_for", "a judge needs used_for: the nodes it scores");

    if (judge.blinded === false && gatheredBeforePlan) {
      warning("P2", "judge.blinded", "the judges knew which candidate was which: every verdict that rests on them says so");
    } else if (judge.blinded !== true) {
      error(
        "P2",
        "judge.blinded",
        gatheredBeforePlan
          ? "say whether the judges knew which candidate was which"
          : "the judge does not see which candidate wrote what: set blinded to true",
      );
    }

    if (judge.order_policy === undefined) {
      if (judge.type === "model") error("Q6", "judge.order_policy", "a model judge gives its order policy: both orders, or a random order");
      else if (gatheredBeforePlan) error("P2", "judge.order_policy", "say in which order the judges saw the candidates");
      else error("P2", "judge.order_policy", "human judges see the outputs in a random order: say how it is drawn");
    }

    for (const nodeId of judge.used_for ?? [])
      if (!nodeIds.includes(nodeId)) error("Q6", "judge.used_for", `"${nodeId}" is not the id of a node`);

    if (judge.type === "model") {
      if (!judge.model || !judge.family) error("Q7", "judge", "a model judge gives its model and its family");

      const candidateOfSameFamily = results.candidates.find(
        (candidate) => candidate.family !== undefined && candidate.family === judge.family,
      );

      if (candidateOfSameFamily) {
        error("Q7", "judge.family", `the judge is from the family of "${candidateOfSameFamily.id}": a model never judges its own family`);
      }
    } else if (judge.type === "human") {
      if (judge.raters === undefined) error("P7", "judge.raters", "human judges: say how many raters");

      if ((judge.raters ?? 0) > 1 && !judge.agreement) {
        if (gatheredBeforePlan)
          warning("P7", "judge.agreement", "several raters and no agreement figure: how reliable the ratings are is unknown");
        else error("P7", "judge.agreement", "several raters: report their agreement");
      }
    }
  }

  function checkEnvironmentAndRuns() {
    if (Object.keys(results.environment).length === 0) error("F11", "environment", "describe the environment the measurements ran in");

    if (hasKindIn(KINDS_MEASURED_ON_AUTHOR_MACHINES)) {
      for (const required of ["hardware", "os", "software"]) {
        if (results.environment[required] === undefined)
          error("F11", `environment.${required}`, `measurements on your own machines need environment.${required}`);
      }
    }

    if (hasKindIn(KINDS_NEEDING_WARMUP)) {
      if (!results.runs.warmup) error("T1", "runs.warmup", "time measurements say how the warm-up was handled");

      if (!results.runs.state) error("R11", "runs.state", 'time measurements say whether the state was "cold" or "warm"');
    }
  }

  function checkAnalysis() {
    results.analysis?.primary?.forEach((primary, index) => {
      const path = `analysis.primary[${index}]`;

      if (!metricIds.includes(primary.metric)) error("S11", `${path}.metric`, `"${primary.metric}" is not the id of a metric`);

      if (primary.node !== undefined && !nodeIds.includes(primary.node))
        error("S11", `${path}.node`, `"${primary.node}" is not the id of a node`);

      if (primary.node === undefined && results.structure)
        error("S11", `${path}.node`, "the file has a structure: name the node of each primary comparison");
    });

    for (const metricId of results.analysis?.outliers?.metrics ?? []) {
      if (!metricIds.includes(metricId)) error("S6", "analysis.outliers.metrics", `"${metricId}" is not the id of a metric`);
    }
  }

  function checkDeclaredValues() {
    const metricById = new Map(results.metrics.map((metric) => [metric.id, metric]));

    for (const value of declaredInputs(results)) {
      const path = `values[${results.values!.indexOf(value)}]`;
      const metric = metricById.get(value.metric);

      if (!metric) error("schema", `${path}.metric`, `"${value.metric}" is not the id of a metric`);
      else if (metric.from) error("F18", path, `"${metric.id}" reads raw data: its values are computed, never declared`);

      if (!candidateIds.includes(value.candidate))
        error("schema", `${path}.candidate`, `"${value.candidate}" is not the id of a candidate`);

      if (value.node !== undefined && !nodeIds.includes(value.node))
        error("schema", `${path}.node`, `"${value.node}" is not the id of a node`);

      if (results.structure && value.node === undefined)
        error("Q9", `${path}.node`, "the file has a structure: a declared value names its node");

      if (!value.evidence) error("V56", `${path}.evidence`, "a declared value says where it comes from");
    }
  }

  /**
   * A distribution-free interval for a quantile needs a minimum number of
   * observations (6 for a median at 95%, 72 for a 95th percentile). Only plans
   * with one level of repetition are held to it: with items and repeats or
   * sessions, intervals come from resampling items and have no hard minimum.
   */
  function checkPlannedRunsGiveAnInterval() {
    if (results.runs.levels.length !== 1) return;

    const onlyLevel = results.runs.levels[0];
    const plannedPrimaryComparisons = (results.analysis?.primary?.length ?? results.metrics.length) * (results.candidates.length - 1);
    const intervalLevel = plannedPrimaryComparisons > 1 ? 1 - ALPHA / plannedPrimaryComparisons : 1 - ALPHA;

    results.metrics.forEach((metric: Metric, index) => {
      const quantile = QUANTILE_OF_STATISTIC[metric.statistic];

      if (quantile === undefined || !metric.from) return;

      const observationsNeeded = minObservations(quantile, intervalLevel);

      if (onlyLevel.planned < observationsNeeded) {
        warning(
          "S1",
          `metrics[${index}]`,
          `${onlyLevel.planned} planned ${onlyLevel.level} observations cannot give a ${(100 * intervalLevel).toFixed(2).replace(/\.?0+$/, "")}% interval for the ${metric.statistic}: plan at least ${observationsNeeded} in runs.levels`,
        );
      }
    });
  }
}
