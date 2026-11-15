import { resultsHash } from "../compute/files.js";
import { descendantsOf, nodeTreeOf, type NodeTree } from "../compute/structure.js";
import type { Benchmark, Comparison, Failure, Metric, Results, Value } from "../schema/benchmark.js";
import {
  decimalsForPercentage,
  decimalsForUncertainty,
  formatInterval,
  formatLevel,
  formatNumber,
  type Decimals,
} from "./number-format.js";

export interface BuildContext {
  /** Version of the generator writing the output. */
  generatorVersion: string;
  /** Day of the build, YYYY-MM-DD. */
  buildDate: string;
  /** Present when the build runs in CI: the commit and a link to the run. */
  continuousIntegration?: { commit: string; runUrl?: string };
}

const SHORT_HASH_LENGTH = 12;
const STATISTIC_WORD: Record<Metric["statistic"], string> = {
  mean: "Mean",
  median: "Median",
  p50: "Median",
  p95: "95th percentile",
  p99: "99th percentile",
  rate: "Rate",
  share: "Share",
  total: "Total",
};

const escapeCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const tableRow = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;

function table(header: string[], alignments: ("left" | "right")[], rows: string[][]): string {
  const separator = alignments.map((alignment) => (alignment === "right" ? "---:" : "---"));

  return [tableRow(header), `| ${separator.join(" | ")} |`, ...rows.map(tableRow)].join("\n");
}

interface Lookup {
  results: Results;
  tree: NodeTree;
  candidateName: Map<string, string>;
  nodeLabel: Map<string, string>;
  nodeDepth: Map<string, number>;
  metricById: Map<string, Metric>;
}

function lookupOf(results: Results): Lookup {
  const tree = nodeTreeOf(results);
  const nodeDepth = new Map<string, number>();
  const depthOf = (node: string): number => {
    const parent = tree.parentOf.get(node);

    return parent === undefined ? 0 : depthOf(parent) + 1;
  };

  for (const node of results.structure?.nodes ?? []) nodeDepth.set(node.id, depthOf(node.id));

  return {
    results,
    tree,
    candidateName: new Map(results.candidates.map((candidate) => [candidate.id, candidate.name])),
    nodeLabel: new Map((results.structure?.nodes ?? []).map((node) => [node.id, node.label])),
    nodeDepth,
    metricById: new Map(results.metrics.map((metric) => [metric.id, metric])),
  };
}

const isPercentage = (metric: Metric) => metric.unit === "%";

/** A median latency is shown with its tail: the median alone hides the slow requests. */
const PERCENTILE_COLUMNS = ["p95", "p99", "max"];

/** One number of decimals down a column, so values compare by eye: the finest any of its rows needs. */
function finestDecimals(decimalsOfRows: (Decimals | null)[]): Decimals | null {
  const known = decimalsOfRows.filter((decimals): decimals is Decimals => decimals !== null);

  return known.length > 0 ? Math.max(...known) : null;
}

/** "Wall time" becomes "wall time" inside a sentence; "SUS score" keeps its acronym. */
const lowerFirstLetterOfWord = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

function valueDecimals(metric: Metric, value: Value): Decimals | null {
  if (isPercentage(metric)) return decimalsForPercentage(value.value);

  return decimalsForUncertainty(value.se, value.ci, value.ci_level);
}

function effectUnit(metric: Metric): string {
  if (metric.compare_as === "relative") return "%";

  return isPercentage(metric) ? " points" : ` ${metric.unit}`;
}

function effectDecimals(metric: Metric, comparison: Comparison): Decimals | null {
  const isInPercent = metric.compare_as === "relative" || isPercentage(metric);

  if (isInPercent) return decimalsForPercentage(comparison.effect);

  return decimalsForUncertainty(undefined, comparison.ci, comparison.ci_level);
}

function verdictLabel(comparison: Comparison): string {
  return comparison.qualifier ? `${comparison.qualifier} ${comparison.verdict}` : comparison.verdict;
}

/** Failures under a node: counted where they were recorded, so a parent shows the total of its children. */
function failuresUnder(lookup: Lookup, metric: string, candidate: string, node: string | undefined): Failure[] {
  const nodes: (string | undefined)[] = node === undefined ? [undefined] : [node, ...descendantsOf(lookup.tree, node)];

  return (lookup.results.failures ?? []).filter(
    (failure) => failure.metric === metric && failure.candidate === candidate && nodes.includes(failure.node),
  );
}

function failuresCell(lookup: Lookup, value: Value): string {
  if (value.source === "declared") return "—";

  const failures = failuresUnder(lookup, value.metric, value.candidate, value.node);
  const failed = failures.reduce((sum, failure) => sum + failure.count, 0);

  if (failed === 0) return "0";

  const recordedHere = failures.every((failure) => failure.node === value.node);

  return recordedHere ? `${failed} of ${failures[0].attempts}` : `${failed} in total`;
}

function nodeCell(lookup: Lookup, node: string | undefined): string {
  if (node === undefined) return "";

  const indent = "&emsp;".repeat(lookup.nodeDepth.get(node) ?? 0);

  return `${indent}${lookup.nodeLabel.get(node) ?? node}`;
}

function howToRead(lookup: Lookup, metric: Metric, values: Value[]): string {
  const direction = metric.direction === "lower" ? "lower is better" : "higher is better";
  const statistic = STATISTIC_WORD[metric.statistic].toLowerCase();
  const methods = [...new Set(values.filter((value) => value.ci && value.method).map((value) => value.method!))];
  const intervalSentence = methods.length > 0 ? ` Intervals: 95%, by ${methods.join(" and ")}.` : "";
  const declared = metric.from ? "" : " Declared by the author, not computed from raw data.";
  const failureTreatment =
    metric.failures_count_as === "excluded"
      ? " Failed attempts are left out: values cover successful attempts only."
      : metric.failures_count_as === "zero"
        ? " Failed attempts count as zero."
        : "";

  return `${metric.definition}. The ${statistic}, in ${metric.unit}; ${direction}.${intervalSentence}${failureTreatment}${declared}`.replace(
    /\.\./g,
    ".",
  );
}

/** Every node followed by the nodes below it, so a category sits right above its own tasks. */
function nodesDepthFirst(lookup: Lookup): string[] {
  const roots = (lookup.results.structure?.nodes ?? []).filter((node) => node.parent === undefined).map((node) => node.id);

  return roots.flatMap((root) => [root, ...descendantsOf(lookup.tree, root)]);
}

function metricSection(lookup: Lookup, metric: Metric): string {
  const { results } = lookup;
  const values = (results.values ?? []).filter((value) => value.metric === metric.id);
  const hasStructure = results.structure !== undefined;
  const nodesInOrder: (string | undefined)[] = hasStructure ? nodesDepthFirst(lookup) : [undefined];
  const candidatesInOrder = [
    results.baseline,
    ...results.candidates.map((candidate) => candidate.id).filter((id) => id !== results.baseline),
  ];
  const rows: string[][] = [];

  const rowsInOrder = nodesInOrder.flatMap((node) =>
    candidatesInOrder.flatMap((candidate) => values.filter((value) => value.node === node && value.candidate === candidate)),
  );
  const columnDecimals = finestDecimals(rowsInOrder.map((value) => valueDecimals(metric, value)));
  const percentileNames = PERCENTILE_COLUMNS.filter((name) => rowsInOrder.some((value) => value.percentiles?.[name] !== undefined));

  for (const value of rowsInOrder) {
    const candidateLabel = `${lookup.candidateName.get(value.candidate)}${value.candidate === results.baseline ? " (baseline)" : ""}`;
    const valueText = `${formatNumber(value.value, columnDecimals)}${value.source === "declared" ? " (declared)" : ""}`;
    const intervalText = value.ci ? formatInterval(value.ci, columnDecimals) : "—";
    const percentileCells = percentileNames.map((name) =>
      value.percentiles?.[name] === undefined ? "—" : formatNumber(value.percentiles[name], columnDecimals),
    );
    const row = [candidateLabel, valueText, intervalText, ...percentileCells, String(value.n ?? "—"), failuresCell(lookup, value)];

    rows.push(hasStructure ? [nodeCell(lookup, value.node), ...row] : row);
  }

  const header = ["Candidate", `${STATISTIC_WORD[metric.statistic]} (${metric.unit})`, "95% interval", ...percentileNames, "n", "Failures"];
  const alignments: ("left" | "right")[] = ["left", "right", "right", ...percentileNames.map(() => "right" as const), "right", "right"];

  return [
    `### ${metric.label}`,
    howToRead(lookup, metric, values),
    table(hasStructure ? ["Node", ...header] : header, hasStructure ? ["left", ...alignments] : alignments, rows),
  ].join("\n\n");
}

function comparisonNotes(lookup: Lookup, comparison: Comparison): string {
  const notes: string[] = [];

  if (comparison.source === "declared") notes.push("declared values");

  if (comparison.successful_only) notes.push("successful attempts only");

  if (comparison.failure_warning) {
    const where = comparison.failure_warning_nodes?.map((node) => lookup.nodeLabel.get(node) ?? node).join(", ");

    notes.push(`warning: the candidates did not fail equally often${where ? ` (${where})` : ""}; see the failures`);
  }

  if (!comparison.ci) notes.push("too few observations for an interval");

  return notes.join("; ");
}

function comparisonRows(lookup: Lookup, comparisons: Comparison[]): string[][] {
  return comparisons.map((comparison) => {
    const metric = lookup.metricById.get(comparison.metric)!;
    const decimals = effectDecimals(metric, comparison);
    const unit = effectUnit(metric);
    const subject = [
      lookup.candidateName.get(comparison.candidate),
      lowerFirstLetterOfWord(metric.label),
      comparison.node ? lookup.nodeLabel.get(comparison.node) : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    const isDeclared = comparison.source === "declared";
    const intervalText =
      comparison.ci && !isDeclared
        ? `${formatInterval(comparison.ci, decimals, { signed: true })}${unit} (${formatLevel(comparison.ci_level!)}%)`
        : "—";

    return [
      subject,
      `${formatNumber(comparison.effect, decimals, { signed: true })}${unit}`,
      intervalText,
      verdictLabel(comparison),
      comparisonNotes(lookup, comparison),
    ];
  });
}

function comparisonsSection(lookup: Lookup): string {
  const { results } = lookup;
  const comparisons = results.comparisons ?? [];
  const primary = comparisons.filter((comparison) => comparison.role === "primary");
  const exploratory = comparisons.filter((comparison) => comparison.role === "exploratory");
  const header = ["Comparison", "Effect", "Interval", "Verdict", "Notes"];
  const alignments: ("left" | "right")[] = ["left", "right", "right", "left", "left"];
  const baselineName = lookup.candidateName.get(results.baseline);
  const adjustment =
    primary.length > 1
      ? ` Their intervals are widened together for the ${primary.length} comparisons (Bonferroni), so they hold jointly.`
      : "";
  const parts = [
    `## Against ${baselineName}`,
    `Each candidate against the baseline, ${baselineName}. A verdict is read from the interval of the effect and the smallest difference that matters to the author: better or worse when the interval lies past it, likely when the direction is clear but the size may fall short, equivalent when the interval lies inside it, inconclusive otherwise. These are the claims of the benchmark.${adjustment}`,
    table(header, alignments, comparisonRows(lookup, primary)),
  ];

  if (exploratory.length > 0) {
    parts.push(
      "### Exploratory comparisons",
      "Not declared before measuring and not adjusted for the number of comparisons: some of these verdicts can appear by chance, and none is a claim of the benchmark.",
      table(header, alignments, comparisonRows(lookup, exploratory)),
    );
  }

  return parts.join("\n\n");
}

function environmentLines(environment: Record<string, unknown>): string[] {
  return Object.entries(environment).map(([key, setting]) => {
    const words = key.replace(/_/g, " ");
    const label = words.charAt(0).toUpperCase() + words.slice(1);

    if (typeof setting === "object" && setting !== null && !Array.isArray(setting)) {
      const versions = Object.entries(setting).map(([name, version]) => `${name} ${String(version)}`);

      return `- ${label}: ${versions.join(", ")}`;
    }

    return `- ${label}: ${Array.isArray(setting) ? setting.join(", ") : String(setting)}`;
  });
}

function methodSection(lookup: Lookup): string {
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
  const lines = [
    "## Method",
    [
      `- Computed from raw data by astrolabe: ${computedMetrics.join(", ") || "none"}.${declaredMetrics.length > 0 ? ` Declared by the author: ${declaredMetrics.join(", ")}.` : ""}`,
      `- Comparisons: ${stamp.primary_comparisons} primary, ${stamp.exploratory_comparisons} exploratory.`,
      `- Observed: ${runs.join("; ")}.`,
      ...(results.runs.warmup ? [`- Warm-up: ${results.runs.warmup}; state: ${results.runs.state ?? "not stated"}.`] : []),
      ...(results.runs.order ? [`- Order: ${results.runs.order}.`] : []),
      `- Declared conditions: ${conditions}.`,
      `- Workload: ${results.workload.description}.`,
    ].join("\n"),
    "### Environment",
    environmentLines(results.environment).join("\n"),
    "### Limitations",
    results.limitations.map((limitation) => `- ${limitation}`).join("\n"),
  ];

  return lines.join("\n\n").replace(/\.\./g, ".");
}

function provenanceLine(benchmark: Benchmark, context: BuildContext): string {
  const results = benchmark.results;
  const attribution = (benchmark.style as { attribution?: boolean } | undefined)?.attribution !== false;
  const parts = [
    `results sha256 \`${resultsHash(results).slice(0, SHORT_HASH_LENGTH)}\``,
    context.buildDate,
    `source ${results.artifacts.repo}`,
  ];

  if (context.continuousIntegration) {
    const commit = context.continuousIntegration.commit.slice(0, SHORT_HASH_LENGTH);

    parts.push(
      context.continuousIntegration.runUrl ? `commit ${commit}, [CI run](${context.continuousIntegration.runUrl})` : `commit ${commit}`,
    );
  }

  parts.push(attribution ? `built with astrolabe-bench ${context.generatorVersion}` : `astrolabe-bench ${context.generatorVersion}`);

  return `<sub>${parts.join(" · ")}</sub>`;
}

/** The Markdown output: tables with their intervals and run counts, comparisons, method and provenance. */
export function renderMarkdown(benchmark: Benchmark, context: BuildContext): string {
  const results = benchmark.results;

  if (!results.computed) throw new Error("the results have not been computed: run astrolabe compute first");

  const lookup = lookupOf(results);
  const scope = results.benchmark.scope ? `\n\n${results.benchmark.scope}` : "";

  return [
    `# ${results.benchmark.goal}${scope}`,
    `Benchmark \`${results.benchmark.id}\`, version ${results.benchmark.version}. Baseline: ${lookup.candidateName.get(results.baseline)}.`,
    "## Results",
    ...results.metrics.map((metric) => metricSection(lookup, metric)),
    comparisonsSection(lookup),
    methodSection(lookup),
    "---",
    provenanceLine(benchmark, context),
  ]
    .join("\n\n")
    .concat("\n");
}

/** The build date: SOURCE_DATE_EPOCH when set, as reproducible builds expect, otherwise today. */
export function buildDateFrom(environment: NodeJS.ProcessEnv, now: Date = new Date()): string {
  const epoch = environment.SOURCE_DATE_EPOCH;
  const date = epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : now;

  return date.toISOString().slice(0, 10);
}

/** The commit and run link GitHub Actions exposes; other CI systems can be added here. */
export function continuousIntegrationFrom(environment: NodeJS.ProcessEnv): BuildContext["continuousIntegration"] {
  if (environment.GITHUB_ACTIONS !== "true" || !environment.GITHUB_SHA) return undefined;

  const runUrl =
    environment.GITHUB_SERVER_URL && environment.GITHUB_REPOSITORY && environment.GITHUB_RUN_ID
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`
      : undefined;

  return { commit: environment.GITHUB_SHA, runUrl };
}
