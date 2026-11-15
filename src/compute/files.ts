import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Results } from "../schema/benchmark.js";
import { parseRaw, type RawFile } from "./raw-data.js";

/** Canonical JSON (RFC 8785): keys in code-unit order, no spacing, shortest round-trip numbers. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) return `[${value.map((element) => canonicalJson(element === undefined ? null : element)).join(",")}]`;

  const object = value as Record<string, unknown>;
  const members = Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);

  return `{${members.join(",")}}`;
}

/** The hash every output shows in its provenance line. */
export function resultsHash(results: unknown): string {
  return createHash("sha256").update(canonicalJson(results), "utf8").digest("hex");
}

const LISTS_WRITTEN_ONE_ROW_PER_LINE = new Set(["values", "failures", "exclusions", "comparisons"]);
const LINE_WIDTH = 140;

const definedMembers = (object: object) => Object.entries(object).filter(([, member]) => member !== undefined);

function onOneLine(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) return `[${value.map(onOneLine).join(", ")}]`;

  return `{${definedMembers(value)
    .map(([key, member]) => `${JSON.stringify(key)}: ${onOneLine(member)}`)
    .join(", ")}}`;
}

function indented(value: unknown, indent: string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  const singleLine = onOneLine(value);

  if (singleLine.length + indent.length <= LINE_WIDTH) return singleLine;

  const inner = `${indent}  `;

  if (Array.isArray(value)) return `[\n${value.map((element) => inner + indented(element, inner)).join(",\n")}\n${indent}]`;

  const members = definedMembers(value).map(([key, member]) => {
    const isRowList = LISTS_WRITTEN_ONE_ROW_PER_LINE.has(key) && Array.isArray(member) && member.length > 0;
    const written = isRowList
      ? `[\n${(member as unknown[]).map((row) => `${inner}  ${onOneLine(row)}`).join(",\n")}\n${inner}]`
      : indented(member, inner);

    return `${inner}${JSON.stringify(key)}: ${written}`;
  });

  return `{\n${members.join(",\n")}\n${indent}}`;
}

/** The file as written to disk: readable, with one line per computed row so that a rerun gives a small diff. */
export function formatBenchmark(file: unknown): string {
  return `${indented(file, "")}\n`;
}

/** The argument, else benchmark.json in the current folder, else the only one under benchmarks/. */
export function findBenchmark(pathArgument?: string): string {
  if (pathArgument) {
    if (!existsSync(pathArgument)) throw new Error(`file not found: ${pathArgument}`);

    return resolve(pathArgument);
  }

  if (existsSync("benchmark.json")) return resolve("benchmark.json");

  if (existsSync("benchmarks")) {
    const found = readdirSync("benchmarks")
      .map((folder) => join("benchmarks", folder, "benchmark.json"))
      .filter((path) => existsSync(path));

    if (found.length === 1) return resolve(found[0]);

    if (found.length > 1) throw new Error(`several benchmarks found, name one: ${found.join(", ")}`);
  }

  throw new Error("no benchmark.json here or under benchmarks/: give the path of the file");
}

/** Reads the raw files listed in raw_data, relative to the folder of benchmark.json; missing files are left out. */
export function loadRaw(results: Results, benchmarkPath: string): Record<string, RawFile> {
  const folder = dirname(benchmarkPath);
  const rawFiles: Record<string, RawFile> = {};

  for (const rawFile of results.raw_data) {
    const path = resolve(folder, rawFile.path);

    if (existsSync(path)) rawFiles[rawFile.id] = parseRaw(rawFile.id, readFileSync(path));
  }

  return rawFiles;
}

const FIELDS_WRITTEN_BY_COMPUTE = ["values", "failures", "exclusions", "comparisons", "observed", "computed"] as const;

/**
 * The results as written to disk: the plan exactly as its author wrote it, keys
 * in their order, followed by the fields compute owns. Only the row counts and
 * hashes inside raw_data are filled in place.
 */
export function resultsKeepingPlanAsWritten(resultsAsWritten: Record<string, unknown>, computed: Results): Record<string, unknown> {
  const plan = Object.fromEntries(
    Object.entries(resultsAsWritten).filter(([key]) => !(FIELDS_WRITTEN_BY_COMPUTE as readonly string[]).includes(key)),
  );
  const computedRawFileById = new Map(computed.raw_data.map((rawFile) => [rawFile.id, rawFile]));
  const rawDataAsWritten = Array.isArray(plan.raw_data) ? (plan.raw_data as Record<string, unknown>[]) : [];

  plan.raw_data = rawDataAsWritten.map((rawFile) => {
    const computedRawFile = computedRawFileById.get(rawFile.id as string);

    return computedRawFile ? { ...rawFile, rows: computedRawFile.rows, sha256: computedRawFile.sha256 } : rawFile;
  });

  for (const field of FIELDS_WRITTEN_BY_COMPUTE) plan[field] = computed[field];

  return plan;
}
