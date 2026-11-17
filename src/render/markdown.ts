import { descendantsOf } from "../compute/structure.js";
import type { Benchmark, Metric, Value } from "../schema/benchmark.js";
import { finestDecimals, valueDecimals, provenanceParts, STATISTIC_WORD, lookupOf, type BuildContext, type Lookup } from "./describe.js";
import {
  candidateEntries,
  COMPARISON_HEADER,
  comparisonRows,
  comparisonsIntro,
  environmentLines,
  EXPLORATORY_INTRO,
  failuresCell,
  methodLines,
} from "./method-facts.js";
import { formatInterval, formatNumber } from "./number-format.js";

export { buildDateFrom, continuousIntegrationFrom, type BuildContext } from "./describe.js";

const escapeCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const tableRow = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;

function table(header: string[], alignments: ("left" | "right")[], rows: string[][]): string {
  const separator = alignments.map((alignment) => (alignment === "right" ? "---:" : "---"));

  return [tableRow(header), `| ${separator.join(" | ")} |`, ...rows.map(tableRow)].join("\n");
}

/** A median latency is shown with its tail, a run time with its fastest and slowest run: the summary alone hides them. */
const PERCENTILE_COLUMNS = ["min", "p95", "p99", "max"];

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

function comparisonsSection(lookup: Lookup): string {
  const comparisons = lookup.results.comparisons ?? [];
  const primary = comparisons.filter((comparison) => comparison.role === "primary");
  const exploratory = comparisons.filter((comparison) => comparison.role === "exploratory");
  const alignments: ("left" | "right")[] = ["left", "right", "right", "left", "left"];
  const parts = [
    `## Against ${lookup.candidateName.get(lookup.results.baseline)}`,
    comparisonsIntro(lookup),
    table(COMPARISON_HEADER, alignments, comparisonRows(lookup, primary)),
  ];

  if (exploratory.length > 0)
    parts.push("### Exploratory comparisons", EXPLORATORY_INTRO, table(COMPARISON_HEADER, alignments, comparisonRows(lookup, exploratory)));

  return parts.join("\n\n");
}

function candidatesSection(lookup: Lookup): string {
  const entries = candidateEntries(lookup).map(
    (entry) =>
      `**${entry.name}${entry.isBaseline ? " (baseline)" : ""}**, version ${entry.version}\n\n${entry.lines.map((line) => `- ${line}`).join("\n")}`,
  );

  return ["### Candidates", "Declared by the author.", ...entries].join("\n\n");
}

const bulleted = (lines: string[]) => lines.map((line) => `- ${line}`).join("\n");

function methodSection(lookup: Lookup): string {
  const { results } = lookup;
  const lines = [
    "## Method",
    bulleted(methodLines(lookup)),
    candidatesSection(lookup),
    "### Environment",
    bulleted(environmentLines(results.environment)),
    "### Limitations",
    bulleted(results.limitations),
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
