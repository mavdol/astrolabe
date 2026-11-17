#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { compute, ComputeError } from "../compute/compute.js";
import { findBenchmark, formatBenchmark, loadRaw, resultsHash, resultsKeepingPlanAsWritten } from "../compute/files.js";
import type { RawRow } from "../compute/raw-data.js";
import { installSkill, SHARED_SKILLS_FOLDER } from "../init/install-skill.js";
import { importHyperfine } from "../import/hyperfine.js";
import { importInspect, readInspectLog } from "../import/inspect.js";
import { ImportError, rawFileContent } from "../import/raw-file.js";
import { allRules, formatIssue, rule as findRule, type Issue } from "../rules/registry.js";
import { benchmarkSchema, type Benchmark } from "../schema/benchmark.js";
import { jsonSchemaFileContent } from "../schema/json-schema.js";
import { AVAILABLE_FORMATS, buildOutputs, type OutputFormat } from "../render/build.js";
import { buildDateFrom, continuousIntegrationFrom } from "../render/describe.js";
import { pictureHtml } from "../render/exports.js";
import { validate } from "../validate/validate.js";

const packageVersion: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const HELP = `astrolabe ${packageVersion}: benchmarks authored by agents, verifiable by humans

Usage
  astrolabe validate [file]   Check the file against the schema and the rules. After
                              compute has run, everything is computed again from the
                              raw files and compared.
  astrolabe compute [file]    Read the plan and the raw files; write values, intervals,
                              failures, aggregates, comparisons and verdicts into results.
  astrolabe build [file] [--format md,svg] [--out dir]
                              Validate, then write the outputs next to the file:
                              dist/benchmark.md and the README cards in dist/exports/:
                              an SVG per mode, and a PNG for the GitHub mobile app.
                              Nothing is written when a rule fails.
  astrolabe import hyperfine <export.json...> --raw <id> [--benchmark file]
                              Convert hyperfine --export-json files into the raw file
                              declared as <id> in raw_data. Name each command after its
                              candidate id with hyperfine --command-name. Several exports
                              are numbered as successive runs, to alternate the order.
  astrolabe import inspect <log...> --raw <id> [--benchmark file]
                              Convert Inspect logs (.eval or .json) into the raw file
                              declared as <id>: sample id as item, epoch as repeat, task
                              as node, one measure per scorer, plus tokens and times.
                              A log names its candidate by model, or by
                              inspect eval --metadata candidate=<id>; a task names its
                              node by its name, or by --metadata node=<id>.
  astrolabe init [--dir folder] [--force]
                              Copy the skill into this project, where agents look for
                              skills: .agents/skills/astrolabe-benchmark. With --dir,
                              into another skills folder, for an agent that reads its
                              own. A copy that was changed is kept unless --force.
  astrolabe explain <rule>    Print one rule: instruction, pitfall, level, field.
  astrolabe schema            Print the JSON Schema of benchmark.json.

Without [file]: benchmark.json in the current folder, then the one under benchmarks/.
Exit codes: 0 no error, 1 at least one error, 2 wrong usage.`;

function printIssues(issues: Issue[]): number {
  for (const issue of issues) console.log(formatIssue(issue));

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;

  if (issues.length > 0)
    console.log(`\n${errorCount} error${errorCount === 1 ? "" : "s"}, ${warningCount} warning${warningCount === 1 ? "" : "s"}`);

  return errorCount;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (failure) {
    throw new Error(`${path} is not valid JSON: ${(failure as Error).message}`);
  }
}

function loadRawOrReport(benchmarkFile: unknown, benchmarkPath: string) {
  const parsed = benchmarkSchema.safeParse(benchmarkFile);

  return parsed.success ? loadRaw(parsed.data.results, benchmarkPath) : {};
}

function runValidate(fileArgument?: string): number {
  const benchmarkPath = findBenchmark(fileArgument);
  const benchmarkFile = readJson(benchmarkPath);
  const report = validate(benchmarkFile, loadRawOrReport(benchmarkFile, benchmarkPath));
  const errorCount = printIssues(report.issues);

  if (errorCount > 0) return 1;

  if (report.state === "plan") console.log("The plan is valid. Next: run the measuring scripts, then astrolabe compute.");
  else console.log(`Valid: every computed field matches the raw files.\nresults sha256: ${report.resultsHash}`);

  return 0;
}

function runCompute(fileArgument?: string): number {
  const benchmarkPath = findBenchmark(fileArgument);
  const benchmarkFile = readJson(benchmarkPath) as Record<string, unknown>;
  const planReport = validate({ ...benchmarkFile, results: withoutStamp(benchmarkFile.results) }, {});

  if (printIssues(planReport.issues.filter((issue) => issue.severity === "error")) > 0) return 1;

  const benchmark = benchmarkSchema.parse(benchmarkFile);
  const computedResults = compute(benchmark.results, loadRaw(benchmark.results, benchmarkPath), {
    by: `astrolabe-bench ${packageVersion}`,
  });

  writeFileSync(
    benchmarkPath,
    formatBenchmark({
      ...benchmarkFile,
      results: resultsKeepingPlanAsWritten(benchmarkFile.results as Record<string, unknown>, computedResults),
    }),
  );

  const stamp = computedResults.computed!;

  console.log(
    `Computed ${computedResults.values!.length} values and ${computedResults.comparisons!.length} comparisons (${stamp.primary_comparisons} primary, ${stamp.exploratory_comparisons} exploratory).`,
  );

  for (const comparison of computedResults.comparisons!.filter((candidate) => candidate.role === "primary")) {
    const verdict = comparison.qualifier ? `${comparison.qualifier} ${comparison.verdict}` : comparison.verdict;
    const interval = comparison.ci ? `[${comparison.ci[0]}, ${comparison.ci[1]}]` : "no interval";

    console.log(
      `  ${comparison.id}: ${verdict} (effect ${comparison.effect}, ${interval})${comparison.failure_warning ? ", failure warning" : ""}`,
    );
  }

  console.log(`results sha256: ${resultsHash(computedResults)}\nNext: astrolabe validate.`);

  return 0;
}

function withoutStamp(results: unknown): unknown {
  if (typeof results !== "object" || results === null) return results;

  const { computed: _stamp, comparisons: _comparisons, values, ...plan } = results as Record<string, unknown>;
  const declaredValues = Array.isArray(values) ? values.filter((value) => value?.source === "declared") : undefined;

  return declaredValues && declaredValues.length > 0 ? { ...plan, values: declaredValues } : plan;
}

const PLANNED_FORMATS = ["site", "png"];

function runBuild(fileArgument: string | undefined, formatOption: string | undefined, outOption: string | undefined): number {
  const requestedFormats = (formatOption ?? AVAILABLE_FORMATS.join(","))
    .split(",")
    .map((format) => format.trim())
    .filter(Boolean);
  const unavailable = requestedFormats.filter((format) => !(AVAILABLE_FORMATS as readonly string[]).includes(format));

  if (unavailable.length > 0) {
    const reason = unavailable.every((format) => PLANNED_FORMATS.includes(format)) ? "not available yet" : "unknown";

    console.error(`astrolabe build: format ${unavailable.join(", ")} ${reason} (available: ${AVAILABLE_FORMATS.join(", ")})`);

    return 2;
  }

  const benchmarkPath = findBenchmark(fileArgument);
  const benchmarkFile = readJson(benchmarkPath);
  const rawFiles = loadRawOrReport(benchmarkFile, benchmarkPath);
  const report = validate(benchmarkFile, rawFiles);

  if (printIssues(report.issues) > 0) {
    console.log("Nothing was written: fix the errors above, then build again.");

    return 1;
  }

  if (report.state === "plan") {
    console.log("Nothing was written: the results have not been computed yet. Run astrolabe compute first.");

    return 1;
  }

  const benchmark = benchmarkSchema.parse(benchmarkFile);
  const outputFolder = resolve(dirname(benchmarkPath), outOption ?? "dist");
  const context = {
    generatorVersion: packageVersion,
    buildDate: buildDateFrom(process.env),
    continuousIntegration: continuousIntegrationFrom(process.env),
  };
  const built = buildOutputs(benchmark, requestedFormats as OutputFormat[], outputFolder, context, rawFiles);

  for (const warning of built.warnings) console.log(`warning: ${warning}`);

  console.log(`Wrote to ${relative(process.cwd(), outputFolder) || "."}:`);

  for (const file of built.files) console.log(`  ${file.path}  ${(file.bytes / 1024).toFixed(1)} KB`);

  if (built.readmeCard) {
    const fromHere = (path: string) => relative(process.cwd(), resolve(outputFolder, path)).split(sep).join("/");
    const svgFromHere = Object.fromEntries(Object.entries(built.readmeCard.files.svg).map(([mode, path]) => [mode, fromHere(path!)]));
    const filesFromHere = { svg: svgFromHere, png: fromHere(built.readmeCard.files.png) };

    const markdownWasBuilt = built.files.some((file) => file.path === "benchmark.md");
    const snippet = pictureHtml(built.readmeCard.altText, filesFromHere, markdownWasBuilt ? fromHere("benchmark.md") : undefined);

    console.log(`\nTo show the README card, linked to the full results, paste into a README in this folder:\n\n${snippet}`);
  }

  return 0;
}

const SUPPORTED_IMPORT_TOOLS = ["hyperfine", "inspect"];

function runImport(tool: string | undefined, exportPaths: string[], rawFileId: string | undefined, benchmarkArgument?: string): number {
  if (!tool || !SUPPORTED_IMPORT_TOOLS.includes(tool)) {
    console.error(`astrolabe import: name a supported tool (${SUPPORTED_IMPORT_TOOLS.join(", ")})`);

    return 2;
  }

  if (exportPaths.length === 0 || !rawFileId) {
    console.error("astrolabe import: give at least one export file and --raw <id>");

    return 2;
  }

  const benchmarkPath = findBenchmark(benchmarkArgument);
  const parsedBenchmark = benchmarkSchema.safeParse(readJson(benchmarkPath));

  if (!parsedBenchmark.success) throw new Error(`${benchmarkPath} does not pass the schema: run astrolabe validate first`);

  const results = parsedBenchmark.data.results;
  const declaredRawFile = results.raw_data.find((rawFile) => rawFile.id === rawFileId);

  if (!declaredRawFile) {
    const declaredIds = results.raw_data.map((rawFile) => rawFile.id).join(", ") || "none";

    throw new Error(`raw_data has no entry "${rawFileId}" (declared: ${declaredIds}): declare the raw file in the plan first`);
  }

  const imported = tool === "hyperfine" ? importFromHyperfine(exportPaths, results) : importFromInspect(exportPaths, results);
  const rawFilePath = resolve(dirname(benchmarkPath), declaredRawFile.path);

  mkdirSync(dirname(rawFilePath), { recursive: true });
  writeFileSync(rawFilePath, rawFileContent(imported.rows));

  const counts = [...imported.countPerCandidate].map(([candidate, count]) => `${candidate} ${count}`).join(", ");

  console.log(
    `Wrote ${imported.rows.length} rows to ${declaredRawFile.path}: ${imported.countName} per candidate ${counts}; measures ${imported.measures.join(", ")}.`,
  );

  const failures = failureSummary(imported.rows);

  if (failures) console.log(`Failed ${imported.countName}: ${failures}.`);

  const missingCandidates = results.candidates.filter((candidate) => !imported.countPerCandidate.has(candidate.id));

  for (const candidate of missingCandidates) console.log(`warning: no ${tool} data for candidate "${candidate.id}"`);

  const metricsReadingMissingMeasures = results.metrics.filter(
    (metric) => metric.from?.raw === rawFileId && !imported.measures.includes(metric.from.measure),
  );

  for (const metric of metricsReadingMissingMeasures) {
    console.log(`warning: metric "${metric.id}" reads measure "${metric.from!.measure}", which these files do not contain`);
  }

  console.log("Next: astrolabe compute.");

  return 0;
}

/** Failed attempts per candidate and reason, so that errors and limits are seen at import time, not only in the results. */
function failureSummary(rows: RawRow[]): string {
  const attemptsByCandidate = new Map<string, Map<string, Set<string>>>();

  for (const row of rows) {
    if (row.status === undefined) continue;

    const byReason = attemptsByCandidate.get(row.candidate) ?? new Map<string, Set<string>>();
    const attempts = byReason.get(row.status) ?? new Set<string>();

    attempts.add([row.node, row.item, row.repeat, row.run].join("\u0000"));
    byReason.set(row.status, attempts);
    attemptsByCandidate.set(row.candidate, byReason);
  }

  return [...attemptsByCandidate]
    .map(([candidate, byReason]) => `${candidate} ${[...byReason].map(([reason, attempts]) => `${reason} ${attempts.size}`).join(", ")}`)
    .join("; ");
}

type Results = Benchmark["results"];

interface ImportedRows {
  rows: RawRow[];
  countPerCandidate: Map<string, number>;
  countName: string;
  measures: string[];
}

function importFromHyperfine(exportPaths: string[], results: Results): ImportedRows {
  const exports = exportPaths.map((path) => ({ name: path, content: readJson(path) }));
  const imported = importHyperfine(exports, results.candidates);

  return { rows: imported.rows, countPerCandidate: imported.runsPerCandidate, countName: "runs", measures: imported.measures };
}

function importFromInspect(logPaths: string[], results: Results): ImportedRows {
  const logs = logPaths.map((path) => readInspectLog(path, readFileSync(path)));
  const nodes = results.structure?.nodes;
  const parents = new Set(nodes?.map((node) => node.parent).filter(Boolean));
  const leafNodes = nodes?.filter((node) => !parents.has(node.id)).map((node) => node.id);
  const imported = importInspect(logs, results.candidates, leafNodes);

  return { rows: imported.rows, countPerCandidate: imported.samplesPerCandidate, countName: "samples", measures: imported.measures };
}

function runInit(skillsFolderOption: string | undefined, replaceChangedFiles: boolean): number {
  const installation = installSkill(skillsFolderOption ?? SHARED_SKILLS_FOLDER, { replaceChangedFiles });
  const folder = relative(process.cwd(), resolve(installation.folder)) || ".";
  const listed = (files: string[]) => files.map((file) => `  ${file}`).join("\n");

  if (installation.state === "kept") {
    console.error(
      `The skill in ${folder} is not the one of astrolabe ${packageVersion}: these files were changed, or are new in this version.\n${listed(installation.filesThatDiffer)}\nNothing was written. To replace them: astrolabe init --force`,
    );

    return 1;
  }

  if (installation.state === "already current") console.log(`The skill in ${folder} is already the one of astrolabe ${packageVersion}.`);
  else
    console.log(
      `${installation.state === "installed" ? "Installed" : "Updated"} the skill of astrolabe ${packageVersion} in ${folder}:\n${listed(installation.filesWritten)}`,
    );

  if (installation.filesOnlyInDestination.length > 0)
    console.log(`Not part of the skill, left in place:\n${listed(installation.filesOnlyInDestination)}`);

  if (installation.state === "installed") {
    const whereAgentsLook = skillsFolderOption
      ? ""
      : `\nAgents that follow the Agent Skills format read ${SHARED_SKILLS_FOLDER}. If yours reads its own folder: astrolabe init --dir <that folder>.`;

    console.log(
      `${whereAgentsLook}\nThe skill runs the astrolabe command from this project: keep astrolabe-bench in its development dependencies.\nThen ask your agent for a benchmark or a comparison.`,
    );
  }

  return 0;
}

function runExplain(ruleId?: string): number {
  if (!ruleId) {
    console.log(
      allRules()
        .map((entry) => `${entry.id.padEnd(4)} ${entry.level.padEnd(6)} ${entry.text}`)
        .join("\n"),
    );

    return 0;
  }

  const entry = findRule(ruleId);

  if (!entry) {
    console.error(`unknown rule "${ruleId}"`);

    return 2;
  }

  console.log(`${entry.id} (${entry.level})\n${entry.text}`);

  if (entry.pitfall) console.log(`Pitfall it prevents: ${entry.pitfall}`);

  if (entry.proved_by) console.log(`Proved by: ${entry.proved_by}`);

  console.log(`Explained in: ${entry.explained_in}`);

  return 0;
}

function main(): number {
  const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      raw: { type: "string" },
      benchmark: { type: "string" },
      format: { type: "string" },
      out: { type: "string" },
      dir: { type: "string" },
      force: { type: "boolean" },
    },
  });
  const [command, argument, ...rest] = positionals;

  if (flags.version) return (console.log(packageVersion), 0);

  if (flags.help || !command) return (console.log(HELP), command || flags.help ? 0 : 2);

  switch (command) {
    case "validate":
      return runValidate(argument);
    case "compute":
      return runCompute(argument);
    case "build":
      return runBuild(argument, flags.format, flags.out);
    case "import":
      return runImport(argument, rest, flags.raw, flags.benchmark);
    case "init":
      return runInit(flags.dir, flags.force === true);
    case "explain":
      return runExplain(argument);
    case "schema":
      return (process.stdout.write(jsonSchemaFileContent()), 0);
    default:
      console.error(`unknown command "${command}"\n\n${HELP}`);

      return 2;
  }
}

try {
  process.exitCode = main();
} catch (failure) {
  if (failure instanceof ImportError) console.error(`error: ${failure.message}`);
  else if (failure instanceof ComputeError)
    console.error(formatIssue({ severity: "error", rule: failure.rule, path: failure.path, message: failure.message }));
  else console.error(`error: ${(failure as Error).message}`);

  process.exitCode = 1;
}
