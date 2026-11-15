import { z } from "zod";
import type { RawRow } from "../compute/raw-data.js";

const BYTES_PER_MEBIBYTE = 1024 * 1024;

const quantity = (unit: string) => z.looseObject({ value: z.number(), unit: z.literal(unit) });
const count = z.looseObject({ value: z.number() });

const exportOfVersion1 = z.looseObject({
  results: z.array(
    z.looseObject({
      command: z.string(),
      times: z.array(z.number()),
      exit_codes: z.array(z.number().int().nullable()),
      memory_usage_byte: z.array(z.number()).optional(),
    }),
  ),
});

const exportOfVersion2 = z.looseObject({
  schema_version: z.literal(2),
  results: z.array(
    z.looseObject({
      command: z.string(),
      name: z.string().optional(),
      measurements: z.array(
        z.looseObject({
          time_wall_clock: quantity("second"),
          time_cpu: quantity("second").optional(),
          time_user: quantity("second").optional(),
          time_system: quantity("second").optional(),
          memory_peak_resident: quantity("byte").optional(),
          cpu_cycles: count.optional(),
          instructions: count.optional(),
          cache_references: count.optional(),
          cache_misses: count.optional(),
          branch_misses: count.optional(),
          exit_code: z.number().int().nullable(),
        }),
      ),
    }),
  ),
});

/** One run of one command, whatever the export version: measures in seconds, MiB or counts. */
interface HyperfineRun {
  commandName: string;
  exitCode: number | null;
  measures: Record<string, number>;
}

export const HYPERFINE_MEASURES = [
  "wall_time",
  "cpu_time",
  "user_time",
  "system_time",
  "peak_rss",
  "cpu_cycles",
  "instructions",
  "cache_references",
  "cache_misses",
  "branch_misses",
] as const;

export class ImportError extends Error {}

function runsOfVersion1(exported: z.infer<typeof exportOfVersion1>, exportName: string): HyperfineRun[] {
  return exported.results.flatMap((result) => {
    if (result.exit_codes.length !== result.times.length) {
      throw new ImportError(
        `${exportName}: "${result.command}" has ${result.times.length} times but ${result.exit_codes.length} exit codes`,
      );
    }

    const memoryWasMeasured = result.memory_usage_byte !== undefined && result.memory_usage_byte.some((bytes) => bytes > 0);

    return result.times.map((seconds, runIndex) => ({
      commandName: result.command,
      exitCode: result.exit_codes[runIndex],
      measures: {
        wall_time: seconds,
        ...(memoryWasMeasured ? { peak_rss: result.memory_usage_byte![runIndex] / BYTES_PER_MEBIBYTE } : {}),
      },
    }));
  });
}

function runsOfVersion2(exported: z.infer<typeof exportOfVersion2>): HyperfineRun[] {
  return exported.results.flatMap((result) =>
    result.measurements.map((measurement) => {
      const measures: Record<string, number> = { wall_time: measurement.time_wall_clock.value };
      const optionalMeasures = {
        cpu_time: measurement.time_cpu?.value,
        user_time: measurement.time_user?.value,
        system_time: measurement.time_system?.value,
        peak_rss: measurement.memory_peak_resident === undefined ? undefined : measurement.memory_peak_resident.value / BYTES_PER_MEBIBYTE,
        cpu_cycles: measurement.cpu_cycles?.value,
        instructions: measurement.instructions?.value,
        cache_references: measurement.cache_references?.value,
        cache_misses: measurement.cache_misses?.value,
        branch_misses: measurement.branch_misses?.value,
      };

      for (const [measure, value] of Object.entries(optionalMeasures)) if (value !== undefined) measures[measure] = value;

      return { commandName: result.name ?? result.command, exitCode: measurement.exit_code, measures };
    }),
  );
}

export function hyperfineRuns(exported: unknown, exportName: string): HyperfineRun[] {
  const declaredVersion =
    typeof exported === "object" && exported !== null ? (exported as Record<string, unknown>).schema_version : undefined;

  if (declaredVersion !== undefined && declaredVersion !== 2) {
    throw new ImportError(
      `${exportName}: hyperfine export schema_version ${String(declaredVersion)} is not supported (supported: 1.x exports and schema_version 2)`,
    );
  }

  const parsed = declaredVersion === 2 ? exportOfVersion2.safeParse(exported) : exportOfVersion1.safeParse(exported);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    throw new ImportError(
      `${exportName}: not a hyperfine --export-json file (${firstIssue.path.join(".") || "file"}: ${firstIssue.message})`,
    );
  }

  return declaredVersion === 2
    ? runsOfVersion2(parsed.data as z.infer<typeof exportOfVersion2>)
    : runsOfVersion1(parsed.data as z.infer<typeof exportOfVersion1>, exportName);
}

export interface Candidate {
  id: string;
  name: string;
}

export interface HyperfineImport {
  rows: RawRow[];
  runsPerCandidate: Map<string, number>;
  measures: string[];
}

/**
 * Converts one or more hyperfine exports into raw rows. A command is matched to
 * the candidate whose id, else whose name, equals its hyperfine name (set with
 * --command-name). Runs are numbered per candidate across the exports, in the
 * order given, so a script can alternate the order of the candidates between
 * rounds: hyperfine itself runs every run of one command before the next.
 */
export function importHyperfine(exports: { name: string; content: unknown }[], candidates: Candidate[]): HyperfineImport {
  const candidateByHyperfineName = new Map<string, string>();

  for (const candidate of candidates) candidateByHyperfineName.set(candidate.name, candidate.id);

  for (const candidate of candidates) candidateByHyperfineName.set(candidate.id, candidate.id);

  const rows: RawRow[] = [];
  const runsPerCandidate = new Map<string, number>();
  const measuresSeen = new Set<string>();
  const unmatchedNames = new Set<string>();

  for (const exported of exports) {
    for (const run of hyperfineRuns(exported.content, exported.name)) {
      const candidate = candidateByHyperfineName.get(run.commandName);

      if (candidate === undefined) {
        unmatchedNames.add(run.commandName);
        continue;
      }

      const runNumber = (runsPerCandidate.get(candidate) ?? 0) + 1;

      runsPerCandidate.set(candidate, runNumber);

      const failed = run.exitCode !== 0;
      const status = run.exitCode === null ? "killed_by_signal" : `exit_${run.exitCode}`;

      for (const [measure, value] of Object.entries(run.measures)) {
        measuresSeen.add(measure);
        rows.push(
          failed
            ? { candidate, measure, value: null, run: String(runNumber), status }
            : { candidate, measure, value, run: String(runNumber) },
        );
      }
    }
  }

  if (unmatchedNames.size > 0) {
    const names = [...unmatchedNames].map((name) => `"${name}"`).join(", ");
    const ids = candidates.map((candidate) => candidate.id).join(", ");

    throw new ImportError(
      `no candidate matches the hyperfine command ${names}: name each command after its candidate id with hyperfine --command-name (candidates: ${ids})`,
    );
  }

  return { rows, runsPerCandidate, measures: HYPERFINE_MEASURES.filter((measure) => measuresSeen.has(measure)) };
}

/** One JSON object per line, keys in a fixed order, so that the same exports always give the same bytes. */
export function rawFileContent(rows: RawRow[]): string {
  return rows
    .map((row) => {
      const ordered: Record<string, unknown> = { candidate: row.candidate, measure: row.measure, value: row.value, run: Number(row.run) };

      if (row.status !== undefined) ordered.status = row.status;

      return JSON.stringify(ordered);
    })
    .join("\n")
    .concat("\n");
}
