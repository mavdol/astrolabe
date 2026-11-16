import { applyFailureWarnings, compute, ComputeError, METHODS_VERSION, participantsOf, type RawFile } from "../compute/compute.js";
import { resultsHash } from "../compute/files.js";
import { sameNumber } from "../compute/numbers.js";
import { verdictOf, withEnoughParticipants } from "../compute/verdict.js";
import type { Issue } from "../rules/registry.js";
import { benchmarkSchema, type Benchmark, type Comparison, type Results } from "../schema/benchmark.js";
import { checkPlan } from "./plan-checks.js";
import { checkPresentation } from "./presentation-checks.js";

export interface ValidationReport {
  issues: Issue[];
  /** "plan" before astrolabe compute has run, "computed" after. */
  state: "plan" | "computed" | "invalid";
  resultsHash?: string;
}

const RULE_OF_FIELD: [RegExp, string][] = [
  [/^results\.benchmark\.goal/, "F1"],
  [/^results\.benchmark\.version/, "F17"],
  [/^results\.domain_research/, "F4"],
  [/^results\.candidates\[\d+\]\.publication_terms/, "F14"],
  [/^results\.candidates\[\d+\]\.variants/, "S9"],
  [/^results\.candidates\[\d+\]\.pricing/, "C5"],
  [/^results\.candidates/, "F8"],
  [/^results\.baseline/, "F7"],
  [/^results\.metrics\[\d+\]\.unit/, "D9"],
  [/^results\.metrics\[\d+\]\.minimum_meaningful/, "S7"],
  [/^results\.metrics\[\d+\]\.compare_as/, "S7"],
  [/^results\.metrics\[\d+\]\.statistic/, "S1"],
  [/^results\.metrics\[\d+\]\.failures_count_as/, "T8"],
  [/^results\.metrics\[\d+\]\.from/, "F18"],
  [/^results\.metrics/, "F3"],
  [/^results\.workload/, "F5"],
  [/^results\.environment/, "F11"],
  [/^results\.runs/, "S1"],
  [/^results\.artifacts/, "F16"],
  [/^results\.raw_data/, "F16"],
  [/^results\.limitations/, "D8"],
  [/^results\.analysis\.primary/, "S11"],
  [/^results\.analysis\.outliers/, "S6"],
];

const COUNT_FIELDS = new Set([
  "n",
  "n_max",
  "count",
  "attempts",
  "of",
  "rows",
  "resamples",
  "distinct",
  "primary_comparisons",
  "exploratory_comparisons",
]);
const FIELDS_READ_FROM_STORED_NUMBERS = new Set(["verdict", "qualifier", "failure_warning", "failure_warning_nodes"]);

function fieldPath(segments: PropertyKey[]): string {
  return segments
    .map((segment, index) => (typeof segment === "number" ? `[${segment}]` : index === 0 ? String(segment) : `.${String(segment)}`))
    .join("");
}

function schemaIssues(file: unknown): { benchmark?: Benchmark; issues: Issue[] } {
  const parsed = benchmarkSchema.safeParse(file);

  if (parsed.success) return { benchmark: parsed.data, issues: [] };

  const issues = parsed.error.issues.map((zodIssue): Issue => {
    const path = fieldPath(zodIssue.path) || "(file)";
    const rule = RULE_OF_FIELD.find(([pattern]) => pattern.test(path))?.[1] ?? "schema";

    return { severity: "error", rule, path, message: zodIssue.message };
  });

  return { issues };
}

/**
 * Checks a file against the schema and the rules. When the file has been
 * computed, everything is computed again from the raw files and compared.
 */
export function validate(file: unknown, rawFiles: Record<string, RawFile>): ValidationReport {
  const { benchmark, issues } = schemaIssues(file);

  if (!benchmark) return { issues, state: "invalid" };

  const results = benchmark.results;

  issues.push(...checkPlan(results));
  const planIsSound = !issues.some((issue) => issue.severity === "error");

  if (!results.computed) {
    const computedFieldsWithoutStamp =
      (results.values ?? []).some((value) => value.source === "computed") || results.comparisons !== undefined;

    if (computedFieldsWithoutStamp) {
      issues.push({
        severity: "error",
        rule: "F18",
        path: "results.computed",
        message: "the file holds computed fields but no stamp: run astrolabe compute, never write these fields yourself",
      });
    }

    return { issues, state: "plan" };
  }

  if (planIsSound) {
    issues.push(...checkComputedFields(results, rawFiles));
    issues.push(...checkVerdictsAgainstStoredNumbers(results));
    issues.push(...checkPresentation(benchmark));
  }

  return { issues, state: "computed", resultsHash: resultsHash(results) };
}

function checkComputedFields(results: Results, rawFiles: Record<string, RawFile>): Issue[] {
  const tampering = (path: string, message: string): Issue => ({ severity: "error", rule: "F18", path: `results.${path}`, message });
  const stamp = results.computed!;

  if (stamp.methods_version !== METHODS_VERSION) {
    return [
      tampering(
        "computed.methods_version",
        `computed with methods version ${stamp.methods_version}, this tool uses ${METHODS_VERSION}: run astrolabe compute again`,
      ),
    ];
  }

  const issues: Issue[] = [];

  for (const rawFile of results.raw_data) {
    const onDisk = rawFiles[rawFile.id];

    if (!onDisk)
      issues.push({
        severity: "error",
        rule: "F16",
        path: `results.raw_data[${rawFile.id}]`,
        message: `raw file "${rawFile.path}" was not found`,
      });
    else if (onDisk.sha256 !== rawFile.sha256)
      issues.push(tampering(`raw_data[${rawFile.id}]`, `"${rawFile.path}" changed since astrolabe compute ran: run it again`));
  }

  if (issues.length > 0) return issues;

  let recomputed: Results;

  try {
    recomputed = compute(results, rawFiles, { by: stamp.by, resamples: stamp.resamples });
  } catch (failure) {
    if (failure instanceof ComputeError) return [{ severity: "error", rule: failure.rule, path: failure.path, message: failure.message }];

    throw failure;
  }

  const reportDifference = (path: string) =>
    issues.push(
      tampering(
        path,
        "differs from what astrolabe compute gives from the raw files: a computed field is never edited by hand; run astrolabe compute again",
      ),
    );
  const valueKey = (row: { metric: string; node?: string; candidate: string }) => `${row.metric}|${row.node ?? ""}|${row.candidate}`;

  compareRows("values", results.values ?? [], recomputed.values ?? [], valueKey, reportDifference);
  compareRows("comparisons", results.comparisons ?? [], recomputed.comparisons ?? [], (comparison) => comparison.id, reportDifference);
  compareRows(
    "failures",
    results.failures ?? [],
    recomputed.failures ?? [],
    (failure) => `${valueKey(failure)}|${failure.reason}`,
    reportDifference,
  );
  compareRows("exclusions", results.exclusions ?? [], recomputed.exclusions ?? [], valueKey, reportDifference);

  if (!sameStoredValue(results.observed, recomputed.observed)) reportDifference("observed");

  const { by: _storedTool, ...storedStamp } = stamp;
  const { by: _recomputedTool, ...recomputedStamp } = recomputed.computed!;

  if (!sameStoredValue(storedStamp, recomputedStamp)) reportDifference("computed");

  return issues;
}

function compareRows<Row extends object>(
  listName: string,
  storedRows: Row[],
  recomputedRows: Row[],
  keyOf: (row: Row) => string,
  reportDifference: (path: string) => void,
): void {
  const storedByKey = new Map(storedRows.map((row) => [keyOf(row), row]));
  const recomputedKeys = new Set(recomputedRows.map(keyOf));

  for (const recomputedRow of recomputedRows) {
    const key = keyOf(recomputedRow);
    const storedRow = storedByKey.get(key) as Record<string, unknown> | undefined;

    if (!storedRow) {
      reportDifference(`${listName}[${key}] (missing)`);
      continue;
    }

    const fieldNames = new Set([...Object.keys(storedRow), ...Object.keys(recomputedRow)]);

    for (const fieldName of fieldNames) {
      if (FIELDS_READ_FROM_STORED_NUMBERS.has(fieldName)) continue;

      if (!sameStoredValue(storedRow[fieldName], (recomputedRow as Record<string, unknown>)[fieldName], fieldName))
        reportDifference(`${listName}[${key}].${fieldName}`);
    }
  }

  for (const key of storedByKey.keys())
    if (!recomputedKeys.has(key)) reportDifference(`${listName}[${key}] (not computed from the raw files)`);
}

/** Text and counts must match exactly; other numbers to one unit in their sixth significant digit. */
function sameStoredValue(storedValue: unknown, recomputedValue: unknown, fieldName = ""): boolean {
  if (typeof storedValue === "number" && typeof recomputedValue === "number") {
    return COUNT_FIELDS.has(fieldName) ? storedValue === recomputedValue : sameNumber(storedValue, recomputedValue);
  }

  if (Array.isArray(storedValue) && Array.isArray(recomputedValue)) {
    return (
      storedValue.length === recomputedValue.length &&
      storedValue.every((element, index) => sameStoredValue(element, recomputedValue[index], fieldName))
    );
  }

  if (storedValue !== null && recomputedValue !== null && typeof storedValue === "object" && typeof recomputedValue === "object") {
    const storedObject = storedValue as Record<string, unknown>;
    const recomputedObject = recomputedValue as Record<string, unknown>;
    const fieldNames = new Set([...Object.keys(storedObject), ...Object.keys(recomputedObject)]);

    return [...fieldNames].every((name) => sameStoredValue(storedObject[name], recomputedObject[name], name));
  }

  return storedValue === recomputedValue;
}

/**
 * Verdicts and failure warnings are not compared with recomputed ones: they
 * are read again from the numbers stored in the file, so anyone can check
 * them without running anything.
 */
function checkVerdictsAgainstStoredNumbers(results: Results): Issue[] {
  const issues: Issue[] = [];
  const metricById = new Map(results.metrics.map((metric) => [metric.id, metric]));
  const participants = participantsOf(results.observed);
  const storedComparisons = results.comparisons ?? [];
  const withWarningsReadAgain: Comparison[] = storedComparisons.map((comparison) => ({ ...comparison }));

  applyFailureWarnings(withWarningsReadAgain, results);

  storedComparisons.forEach((comparison, index) => {
    const metric = metricById.get(comparison.metric);

    if (!metric) return;

    const path = `results.comparisons[${comparison.id}]`;
    const expected = withEnoughParticipants(
      comparison.ci
        ? verdictOf(comparison.ci, metric.direction, metric.minimum_meaningful)
        : { verdict: "inconclusive" as const, qualifier: undefined },
      metric.kind,
      participants,
    );

    if (comparison.verdict !== expected.verdict || comparison.qualifier !== expected.qualifier) {
      const expectedLabel = expected.qualifier ? `${expected.qualifier} ${expected.verdict}` : expected.verdict;

      issues.push({
        severity: "error",
        rule: "S7",
        path: `${path}.verdict`,
        message: `the stored interval and a minimum meaningful difference of ${metric.minimum_meaningful} give "${expectedLabel}"`,
      });
    }

    if (comparison.indicative !== expected.indicative) {
      issues.push({
        severity: "error",
        rule: "U6",
        path: `${path}.indicative`,
        message: expected.indicative
          ? "fewer than 20 participants on one side: the comparison is indicative and names no winner"
          : "20 or more participants on each side: the comparison is not indicative",
      });
    }

    const readAgain = withWarningsReadAgain[index];
    const sameNodes = JSON.stringify(comparison.failure_warning_nodes ?? []) === JSON.stringify(readAgain.failure_warning_nodes ?? []);

    if (comparison.failure_warning !== readAgain.failure_warning || !sameNodes) {
      issues.push({
        severity: "error",
        rule: "T8",
        path: `${path}.failure_warning`,
        message: "does not follow from the stored failure shares of this comparison and of the nodes below it",
      });
    }
  });

  return issues;
}
