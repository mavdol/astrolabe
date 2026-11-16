import { descendantsOf } from "../compute/structure.js";
import { VALUE_INTERVAL_LEVEL } from "../compute/values.js";
import type { Benchmark, Comparison, Failure, Metric, Value } from "../schema/benchmark.js";
import {
  effectAndInterval,
  isPercentage,
  lowerFirstLetterOfWord,
  provenanceParts,
  STATISTIC_WORD,
  verdictLabel,
  lookupOf,
  type BuildContext,
  type Lookup,
} from "./describe.js";
import {
  decimalsForPercentage,
  decimalsForUncertainty,
  decimalsWithoutUncertainty,
  formatInterval,
  formatNumber,
  type Decimals,
} from "./number-format.js";

export { buildDateFrom, continuousIntegrationFrom, type BuildContext } from "./describe.js";

const escapeCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const tableRow = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;

function table(header: string[], alignments: ("left" | "right")[], rows: string[][]): string {
  const separator = alignments.map((alignment) => (alignment === "right" ? "---:" : "---"));

  return [tableRow(header), `| ${separator.join(" | ")} |`, ...rows.map(tableRow)].join("\n");
}

/** A median latency is shown with its tail, a run time with its fastest and slowest run: the summary alone hides them. */
const PERCENTILE_COLUMNS = ["min", "p95", "p99", "max"];

/** One number of decimals down a column, so values compare by eye: the finest any of its rows needs. */
function finestDecimals(decimalsOfRows: (Decimals | null)[]): Decimals | null {
  const known = decimalsOfRows.filter((decimals): decimals is Decimals => decimals !== null);

  return known.length > 0 ? Math.max(...known) : null;
}

function valueDecimals(metric: Metric, value: Value): Decimals | null {
  if (isPercentage(metric)) return decimalsForPercentage(value.value);

  const supportedByInterval = decimalsForUncertainty(value.se, value.ci, value.ci_level);

  if (supportedByInterval !== null || value.source === "declared") return supportedByInterval;

  const { min, max } = value.percentiles ?? {};
  const supportedByRange =
    min !== undefined && max !== undefined ? decimalsForUncertainty(undefined, [min, max], VALUE_INTERVAL_LEVEL) : null;

  return supportedByRange ?? decimalsWithoutUncertainty(value.value);
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
  const hasRange = values.some((value) => value.percentiles?.min !== undefined);
  const rangeSentence = hasRange ? " Min and max: the lowest and the highest observation." : "";
  const declared = metric.from ? "" : " Declared by the author, not computed from raw data.";
  const failureTreatment =
    metric.failures_count_as === "excluded"
      ? " Failed attempts are left out: values cover successful attempts only."
      : metric.failures_count_as === "zero"
        ? " Failed attempts count as zero."
        : "";

  return `${metric.definition}. The ${statistic}, in ${metric.unit}; ${direction}.${intervalSentence}${rangeSentence}${failureTreatment}${declared}`.replace(
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

  if (comparison.indicative) notes.push("indicative: fewer than 20 participants, no winner named");

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
    const subject = [
      lookup.candidateName.get(comparison.candidate),
      lowerFirstLetterOfWord(metric.label),
      comparison.node ? lookup.nodeLabel.get(comparison.node) : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    const { effect, interval, level } = effectAndInterval(metric, comparison);

    return [subject, effect, interval ? `${interval} (${level})` : "—", verdictLabel(comparison), comparisonNotes(lookup, comparison)];
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

/** What the author declared about each candidate and that no raw file can prove: a reader checks these by hand. */
function candidatesSection(lookup: Lookup): string {
  const { results } = lookup;
  const entries = results.candidates.map((candidate) => {
    const terms = candidate.publication_terms;
    const clause = terms.clause_url ? `, clause at ${terms.clause_url}` : "";
    const variants = candidate.variants;
    const lines = [
      `- Configuration: ${Object.entries(candidate.config)
        .map(([key, setting]) => `${key.replace(/_/g, " ")} ${typeof setting === "object" ? JSON.stringify(setting) : String(setting)}`)
        .join("; ")}`,
      `- Publication terms: ${terms.terms}, read at ${terms.checked_url} on ${terms.checked_on}. Restriction on publishing results: ${terms.restriction}${clause}`,
      variants.tested.length > 0
        ? `- Variants tried: ${variants.tested.join(", ")}; kept: ${variants.selected ?? "not stated"}${
            variants.remeasured_on_fresh_runs === undefined
              ? ""
              : variants.remeasured_on_fresh_runs
                ? ", measured again on fresh runs"
                : ", not measured again on fresh runs"
          }`
        : "- Variants tried: none other than the one measured",
    ];

    if (candidate.family) lines.push(`- Family: ${candidate.family}`);

    if (candidate.service)
      lines.push(`- Service: region ${candidate.service.region}, plan ${candidate.service.plan}, version ${candidate.service.api_version}`);

    if (candidate.pricing) {
      const pricing = candidate.pricing;
      const amounts = [
        pricing.fixed !== undefined ? `fixed ${pricing.fixed}` : "",
        pricing.variable !== undefined ? `variable ${pricing.variable}` : "",
        pricing.volume ?? "",
        pricing.period ?? "",
      ].filter((part) => part !== "");

      lines.push(
        `- Price: ${pricing.model}${amounts.length > 0 ? ` (${amounts.join(", ")})` : ""}; source: ${pricing.source}, read on ${pricing.date}`,
      );
    }

    const role = candidate.id === results.baseline ? " (baseline)" : "";

    return `**${candidate.name}${role}**, version ${candidate.version}\n\n${lines.join("\n")}`;
  });

  return ["### Candidates", "Declared by the author.", ...entries].join("\n\n");
}

function judgeAndItemsLines(lookup: Lookup): string[] {
  const { judge, workload } = lookup.results;
  const lines: string[] = [];

  if (judge) {
    const who =
      judge.type === "model"
        ? `${judge.model ?? "a model"} (family ${judge.family ?? "not stated"})`
        : `${judge.raters ?? "?"} human raters`;
    const agreement = judge.agreement
      ? `; agreement between raters: Krippendorff's alpha ${judge.agreement.krippendorff_alpha} on ${judge.agreement.double_rated_items} items`
      : "";
    const validation = judge.validation
      ? `; checked against human ratings: alpha ${judge.validation.krippendorff_alpha} on ${judge.validation.human_rated_items} items`
      : "; not checked against human ratings";

    lines.push(
      `- Judge: ${who}; ${judge.method ?? "method not stated"}; ${judge.blinded ? "blind to the candidate" : "not blind"}; order: ${judge.order_policy ?? "not stated"}${agreement}${judge.type === "model" ? validation : ""}.`,
    );
  }

  if (workload.contamination) {
    const { items, published, risk } = workload.contamination;

    lines.push(`- Items: ${items}, ${published ? "published" : "not published"}; risk that a candidate has seen them: ${risk}.`);
  }

  if (workload.tasks) lines.push(`- Tasks: ${workload.tasks.join("; ")}.`);

  if (workload.users) lines.push(`- Users: ${workload.users}.`);

  return lines;
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
      `- Workload: ${results.workload.description}. ${results.workload.usage_pattern}.`,
      ...judgeAndItemsLines(lookup),
    ].join("\n"),
    candidatesSection(lookup),
    "### Environment",
    environmentLines(results.environment).join("\n"),
    "### Limitations",
    results.limitations.map((limitation) => `- ${limitation}`).join("\n"),
  ];

  return lines.join("\n\n").replace(/\.\./g, ".");
}

function provenanceLine(benchmark: Benchmark, context: BuildContext): string {
  const provenance = provenanceParts(benchmark, context);
  const ciRun = provenance.continuousIntegration;
  const parts = [`results sha256 \`${provenance.hash}\``, provenance.date, `source ${provenance.source}`];

  if (ciRun) parts.push(ciRun.runUrl ? `commit ${ciRun.commit}, [CI run](${ciRun.runUrl})` : `commit ${ciRun.commit}`);

  parts.push(provenance.generator);

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
    ...(context.cardPicture ? [context.cardPicture] : []),
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
