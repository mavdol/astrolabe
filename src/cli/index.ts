#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { compute, ComputeError } from "../compute/compute.js";
import { findBenchmark, formatBenchmark, loadRaw, resultsHash } from "../compute/files.js";
import { allRules, formatIssue, rule as findRule, type Issue } from "../rules/registry.js";
import { benchmarkSchema, jsonSchema } from "../schema/benchmark.js";
import { validate } from "../validate/validate.js";

const packageVersion: string = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const HELP = `astrolabe ${packageVersion}: benchmarks authored by agents, verifiable by humans

Usage
  astrolabe validate [file]   Check the file against the schema and the rules. After
                              compute has run, everything is computed again from the
                              raw files and compared.
  astrolabe compute [file]    Read the plan and the raw files; write values, intervals,
                              failures, aggregates, comparisons and verdicts into results.
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

  writeFileSync(benchmarkPath, formatBenchmark({ ...benchmarkFile, results: computedResults }));

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

  if (entry.field) console.log(`Proved by: ${entry.field}`);

  console.log(`Explained in: ${entry.file}`);

  return 0;
}

function main(): number {
  const { values: flags, positionals } = parseArgs({
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" } },
  });
  const [command, argument] = positionals;

  if (flags.version) return (console.log(packageVersion), 0);

  if (flags.help || !command) return (console.log(HELP), command || flags.help ? 0 : 2);

  switch (command) {
    case "validate":
      return runValidate(argument);
    case "compute":
      return runCompute(argument);
    case "explain":
      return runExplain(argument);
    case "schema":
      return (console.log(JSON.stringify(jsonSchema(), null, 2)), 0);
    default:
      console.error(`unknown command "${command}"\n\n${HELP}`);

      return 2;
  }
}

try {
  process.exitCode = main();
} catch (failure) {
  if (failure instanceof ComputeError)
    console.error(formatIssue({ severity: "error", rule: failure.rule, path: failure.path, message: failure.message }));
  else console.error(`error: ${(failure as Error).message}`);

  process.exitCode = 1;
}
