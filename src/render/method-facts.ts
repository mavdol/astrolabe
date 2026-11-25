import { descendantsOf } from "../compute/structure.js";
import type { Comparison, Failure, Value } from "../schema/benchmark.js";
import { effectAndInterval, lowerFirstLetterOfWord, restsOnUnblindedJudges, verdictLabel, type Lookup } from "./describe.js";

/** One sentence ends with one period, even when a declared text already ends with its own. */
const withSinglePeriods = (text: string) => text.replace(/\.\./g, ".");

/** Failures under a node: counted where they were recorded, so a parent shows the total of its children. */
function failuresUnder(lookup: Lookup, metric: string, candidate: string, node: string | undefined): Failure[] {
  const nodes: (string | undefined)[] = node === undefined ? [undefined] : [node, ...descendantsOf(lookup.tree, node)];

  return (lookup.results.failures ?? []).filter(
    (failure) => failure.metric === metric && failure.candidate === candidate && nodes.includes(failure.node),
  );
}

export function failuresCell(lookup: Lookup, value: Value): string {
  if (value.source === "declared") return "—";

  const failures = failuresUnder(lookup, value.metric, value.candidate, value.node);
  const failed = failures.reduce((sum, failure) => sum + failure.count, 0);

  if (failed === 0) return "0";

  const recordedHere = failures.every((failure) => failure.node === value.node);

  return recordedHere ? `${failed} of ${failures[0].attempts}` : `${failed} in total`;
}

export function comparisonNotes(lookup: Lookup, comparison: Comparison): string {
  const notes: string[] = [];

  if (comparison.source === "declared") notes.push("declared values");

  if (comparison.successful_only) notes.push("successful attempts only");

  if (restsOnUnblindedJudges(lookup, comparison)) notes.push("not blind: the judges knew which candidate was which");

  if (comparison.indicative) notes.push("indicative: fewer than 20 participants, no winner named");

  if (comparison.failure_warning) {
    const where = comparison.failure_warning_nodes?.map((node) => lookup.nodeLabel.get(node) ?? node).join(", ");

    notes.push(`warning: the candidates did not fail equally often${where ? ` (${where})` : ""}; see the failures`);
  }

  if (!comparison.ci) notes.push("too few observations for an interval");

  return notes.join("; ");
}

export const COMPARISON_HEADER = ["Comparison", "Effect", "Interval", "Verdict", "Notes"];

export function comparisonRows(lookup: Lookup, comparisons: Comparison[]): string[][] {
  return comparisons.map((comparison) => {
    const metric = lookup.metricById.get(comparison.metric)!;
    const subject = [
      comparison.vs === lookup.results.baseline
        ? lookup.candidateName.get(comparison.candidate)
        : `${lookup.candidateName.get(comparison.candidate)} against ${lookup.candidateName.get(comparison.vs)}`,
      lowerFirstLetterOfWord(metric.label),
      comparison.node ? lookup.nodeLabel.get(comparison.node) : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    const { effect, interval, level, exact } = effectAndInterval(metric, comparison);

    return [
      subject,
      effect,
      interval ? `${interval} (${level})` : exact ? "exact" : "—",
      verdictLabel(comparison),
      comparisonNotes(lookup, comparison),
    ];
  });
}

/** How a verdict is read, said once above the comparisons. */
export function comparisonsIntro(lookup: Lookup): string {
  const { results } = lookup;
  const primary = (results.comparisons ?? []).filter((comparison) => comparison.role === "primary");
  const baselineName = lookup.candidateName.get(results.baseline);
  const adjustment =
    primary.length > 1
      ? ` Their intervals are widened together for the ${primary.length} comparisons (Bonferroni), so they hold jointly.`
      : "";

  const otherPairs = primary.some((comparison) => comparison.vs !== results.baseline);
  const who = otherPairs ? "Each candidate against the others it is compared with" : `Each candidate against the baseline, ${baselineName}`;

  return `${who}. A verdict is read from the interval of the effect and the smallest difference that matters to the author: better or worse when the interval lies past it, likely when the direction is clear but the size may fall short, equivalent when the interval lies inside it, inconclusive otherwise. These are the claims of the benchmark.${adjustment}`;
}

export const EXPLORATORY_INTRO =
  "Not declared before measuring and not adjusted for the number of comparisons: some of these verdicts can appear by chance, and none is a claim of the benchmark.";

export function environmentLines(environment: Record<string, unknown>): string[] {
  return Object.entries(environment).map(([key, setting]) => {
    const words = key.replace(/_/g, " ");
    const label = words.charAt(0).toUpperCase() + words.slice(1);

    if (typeof setting === "object" && setting !== null && !Array.isArray(setting)) {
      const versions = Object.entries(setting).map(([name, version]) => `${name} ${String(version)}`);

      return `${label}: ${versions.join(", ")}`;
    }

    return `${label}: ${Array.isArray(setting) ? setting.join(", ") : String(setting)}`;
  });
}

export interface CandidateEntry {
  name: string;
  isBaseline: boolean;
  version: string;
  lines: string[];
}

/** What the author declared about each candidate and that no raw file can prove: a reader checks these by hand. */
export function candidateEntries(lookup: Lookup): CandidateEntry[] {
  const { results } = lookup;

  return results.candidates.map((candidate) => {
    const terms = candidate.publication_terms;
    const clause = terms.clause_url ? `, clause at ${terms.clause_url}` : "";
    const variants = candidate.variants;
    const lines = [
      `Configuration: ${Object.entries(candidate.config)
        .map(([key, setting]) => `${key.replace(/_/g, " ")} ${typeof setting === "object" ? JSON.stringify(setting) : String(setting)}`)
        .join("; ")}`,
      `Publication terms: ${terms.terms}, read at ${terms.checked_url} on ${terms.checked_on}. Restriction on publishing results: ${terms.restriction}${clause}`,
      variants.tested.length > 0
        ? `Variants tried: ${variants.tested.join(", ")}; kept: ${variants.selected ?? "not stated"}${
            variants.remeasured_on_fresh_runs === undefined
              ? ""
              : variants.remeasured_on_fresh_runs
                ? ", measured again on fresh runs"
                : ", not measured again on fresh runs"
          }`
        : "Variants tried: none other than the one measured",
    ];

    if (candidate.family) lines.push(`Family: ${candidate.family}`);

    if (candidate.service)
      lines.push(`Service: region ${candidate.service.region}, plan ${candidate.service.plan}, version ${candidate.service.api_version}`);

    if (candidate.pricing) {
      const pricing = candidate.pricing;
      const amounts = [
        pricing.fixed !== undefined ? `fixed ${pricing.fixed}` : "",
        pricing.variable !== undefined ? `variable ${pricing.variable}` : "",
        pricing.volume ?? "",
        pricing.period ?? "",
      ].filter((part) => part !== "");

      lines.push(
        `Price: ${pricing.model}${amounts.length > 0 ? ` (${amounts.join(", ")})` : ""}; source: ${pricing.source}, read on ${pricing.date}`,
      );
    }

    return {
      name: candidate.name,
      isBaseline: candidate.id === results.baseline,
      version: candidate.version,
      lines: lines.map(withSinglePeriods),
    };
  });
}

function judgeAndItemsLines(lookup: Lookup): string[] {
  const { judge, workload } = lookup.results;
  const lines: string[] = [];

  if (judge) {
    const who =
      judge.type === "model"
        ? `${judge.model ?? "a model"} (family ${judge.family ?? "not stated"})`
        : judge.type === "participants"
          ? "the participants themselves, each scoring the candidates"
          : `${judge.raters ?? "?"} human raters`;
    const agreementNotMeasured = judge.type === "human" && (judge.raters ?? 0) > 1 ? "; agreement between raters not measured" : "";
    const agreement = judge.agreement
      ? `; agreement between raters: Krippendorff's alpha ${judge.agreement.krippendorff_alpha} on ${judge.agreement.double_rated_items} items`
      : agreementNotMeasured;
    const validation = judge.validation
      ? `; checked against human ratings: alpha ${judge.validation.krippendorff_alpha} on ${judge.validation.human_rated_items} items`
      : "; not checked against human ratings";

    lines.push(
      `Judge: ${who}; ${judge.method ?? "method not stated"}; ${judge.blinded ? "blind to the candidate" : "not blind"}; order: ${judge.order_policy ?? "not stated"}${agreement}${judge.type === "model" ? validation : ""}.`,
    );
  }

  if (workload.contamination) {
    const { items, published, risk } = workload.contamination;

    lines.push(`Items: ${items}, ${published ? "published" : "not published"}; risk that a candidate has seen them: ${risk}.`);
  }

  if (workload.tasks) lines.push(`Tasks: ${workload.tasks.join("; ")}.`);

  if (workload.users) lines.push(`Users: ${workload.users}.`);

  return lines;
}

/** How the benchmark was run: what was computed and what declared, how many comparisons, runs, conditions, workload. */
export function methodLines(lookup: Lookup): string[] {
  const { results } = lookup;
  const computedMetrics = results.metrics.filter((metric) => metric.from).map((metric) => metric.label);
  const declaredMetrics = results.metrics.filter((metric) => !metric.from).map((metric) => metric.label);
  const stamp = results.computed!;
  const plannedByLevel = new Map(results.runs.levels.map((level) => [level.level, level.planned]));
  const runs = (results.observed?.levels ?? []).map((level) => {
    const range = level.n_max !== undefined ? `${level.n} to ${level.n_max}` : String(level.n);

    return `${level.level} ${range} (planned ${plannedByLevel.get(level.level)})`;
  });
  const conditions = results.benchmark.conditions.length > 0 ? results.benchmark.conditions.join(", ").replace(/_/g, " ") : "none declared";

  return [
    `Computed from raw data by astrolabe: ${computedMetrics.join(", ") || "none"}.${declaredMetrics.length > 0 ? ` Declared by the author: ${declaredMetrics.join(", ")}.` : ""}`,
    `Comparisons: ${stamp.primary_comparisons} primary, ${stamp.exploratory_comparisons} exploratory.`,
    `Observed: ${runs.join("; ")}.`,
    ...(results.runs.warmup ? [`Warm-up: ${results.runs.warmup}; state: ${results.runs.state ?? "not stated"}.`] : []),
    ...(results.runs.order ? [`Order: ${results.runs.order}.`] : []),
    `Declared conditions: ${conditions}.`,
    `Workload: ${results.workload.description}. ${results.workload.usage_pattern}.`,
    ...judgeAndItemsLines(lookup),
  ].map(withSinglePeriods);
}
