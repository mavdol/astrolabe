#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { compute, ComputeError } from "../compute/compute.js";
import { findBenchmark, formatBenchmark, loadRaw, resultsHash, resultsKeepingPlanAsWritten } from "../compute/files.js";
import { importHyperfine, ImportError, rawFileContent } from "../import/hyperfine.js";
import { allRules, formatIssue, rule as findRule, type Issue } from "../rules/registry.js";
import { benchmarkSchema } from "../schema/benchmark.js";
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
                              dist/benchmark.md and the README cards in dist/exports/.
                              Nothing is written when a rule fails.
  astrolabe import hyperfine <export.json...> --raw <id> [--benchmark file]
                              Convert hyperfine --export-json files into the raw file
                              declared as <id> in raw_data. Name each command after its
                              candidate id with hyperfine --command-name. Several exports
                              are numbered as successive runs, to alternate the order.
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
  const report = validate(benchmarkFile, loadRawOrReport(benchmarkFile, benchmarkPath));

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
  const built = buildOutputs(benchmark, requestedFormats as OutputFormat[], outputFolder, context);

  for (const warning of built.warnings) console.log(`warning: ${warning}`);

  console.log(`Wrote to ${relative(process.cwd(), outputFolder) || "."}:`);

  for (const file of built.files) console.log(`  ${file.path}  ${(file.bytes / 1024).toFixed(1)} KB`);

  if (built.readmeCard) {
    const fromHere = (path: string) => relative(process.cwd(), resolve(outputFolder, path)).split(sep).join("/");
    const pathsFromHere = Object.fromEntries(Object.entries(built.readmeCard.paths).map(([mode, path]) => [mode, fromHere(path!)]));

    console.log(
      `\nTo show the README card, paste into a README in this folder:\n\n${pictureHtml(built.readmeCard.altText, pathsFromHere)}`,
    );
  }

  return 0;
}

const SUPPORTED_IMPORT_TOOLS = ["hyperfine"];

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

  const exports = exportPaths.map((path) => ({ name: path, content: readJson(path) }));
  const imported = importHyperfine(exports, results.candidates);
  const rawFilePath = resolve(dirname(benchmarkPath), declaredRawFile.path);

  mkdirSync(dirname(rawFilePath), { recursive: true });
  writeFileSync(rawFilePath, rawFileContent(imported.rows));

  const runCounts = [...imported.runsPerCandidate].map(([candidate, runs]) => `${candidate} ${runs}`).join(", ");

  console.log(
    `Wrote ${imported.rows.length} rows to ${declaredRawFile.path}: runs per candidate ${runCounts}; measures ${imported.measures.join(", ")}.`,
  );

  const missingCandidates = results.candidates.filter((candidate) => !imported.runsPerCandidate.has(candidate.id));

  for (const candidate of missingCandidates) console.log(`warning: no hyperfine run for candidate "${candidate.id}"`);

  const metricsReadingMissingMeasures = results.metrics.filter(
    (metric) => metric.from?.raw === rawFileId && !imported.measures.includes(metric.from.measure),
  );

  for (const metric of metricsReadingMissingMeasures) {
    console.log(`warning: metric "${metric.id}" reads measure "${metric.from!.measure}", which these exports do not contain`);
  }

  console.log("Next: astrolabe compute.");

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
