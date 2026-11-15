import { z } from "zod";
import type { RawRow } from "../compute/raw-data.js";
import { ImportError, type Candidate } from "./raw-file.js";
import { readZip, ZipError } from "./zip.js";

const usage = z.looseObject({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  reasoning_tokens: z.number().nullish(),
  total_cost: z.number().nullish(),
});

const logHeader = z.looseObject({
  status: z.string(),
  invalidated: z.boolean().optional(),
  eval: z.looseObject({
    task: z.string(),
    model: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
    model_roles: z.record(z.string(), z.looseObject({ model: z.string() })).nullish(),
  }),
});

const sampleSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  epoch: z.number().int(),
  scores: z.record(z.string(), z.looseObject({ value: z.unknown() })).nullish(),
  error: z.looseObject({ message: z.string().optional() }).nullish(),
  limit: z.looseObject({ type: z.string() }).nullish(),
  invalidation: z.unknown().optional(),
  model_usage: z.record(z.string(), usage).nullish(),
  role_usage: z.record(z.string(), usage).nullish(),
  total_time: z.number().nullish(),
  working_time: z.number().nullish(),
  started_at: z.string().nullish(),
});

type Sample = z.infer<typeof sampleSchema>;

export interface InspectLog {
  name: string;
  header: unknown;
  samples: unknown[];
}

const USAGE_MEASURES = ["input_tokens", "output_tokens", "total_tokens", "reasoning_tokens", "total_cost"] as const;
const TIME_MEASURES = ["total_time", "working_time"] as const;

/** Inspect writes NaN when a scorer cannot score; JSON has no NaN, so non-finite numbers are read as null. */
function parseJsonAllowingNonFinite(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    let cleaned = "";
    let insideString = false;

    for (let index = 0; index < text.length; index++) {
      const character = text[index];

      if (insideString) {
        cleaned += character;

        if (character === "\\") cleaned += text[++index];
        else if (character === '"') insideString = false;

        continue;
      }

      if (character === '"') insideString = true;

      const token = ["-Infinity", "Infinity", "NaN"].find((candidate) => text.startsWith(candidate, index));

      if (token) {
        cleaned += "null";
        index += token.length - 1;
        continue;
      }

      cleaned += character;
    }

    return JSON.parse(cleaned);
  }
}

const isZip = (bytes: Buffer) => bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;

/** Reads an Inspect log in either of its formats: `.eval` (a zip archive) or `.json`. */
export function readInspectLog(name: string, bytes: Buffer): InspectLog {
  if (!isZip(bytes)) {
    let parsed: unknown;

    try {
      parsed = parseJsonAllowingNonFinite(bytes.toString("utf8"));
    } catch {
      throw new ImportError(`${name}: neither an .eval archive nor a JSON log`);
    }

    const samples = (parsed as { samples?: unknown[] } | null)?.samples ?? [];

    return { name, header: parsed, samples };
  }

  try {
    const files = readZip(bytes);
    const header = files.get("header.json");

    if (!header) throw new ImportError(`${name}: the log has no header: the evaluation is still running or was interrupted`);

    const sampleFiles = [...files.keys()].filter((file) => file.startsWith("samples/") && file.endsWith(".json")).sort();

    return {
      name,
      header: parseJsonAllowingNonFinite(header().toString("utf8")),
      samples: sampleFiles.map((file) => parseJsonAllowingNonFinite(files.get(file)!().toString("utf8"))),
    };
  } catch (failure) {
    if (failure instanceof ZipError) throw new ImportError(`${name}: ${failure.message}`);

    throw failure;
  }
}

const SCORE_WORDS: Record<string, number> = { c: 1, i: 0, p: 0.5, n: 0, correct: 1, incorrect: 0, yes: 1, no: 0, true: 1, false: 0 };

/** Inspect's own conversion: C 1, I 0, P 0.5, N 0, booleans and numbers as they are. Null means the sample was not scored. */
function scoreToNumber(value: unknown, scorer: string, logName: string): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "boolean") return value ? 1 : 0;

  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (typeof value === "string") {
    const word = SCORE_WORDS[value.trim().toLowerCase()];

    if (word !== undefined) return word;

    if (value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }

  throw new ImportError(`${logName}: scorer "${scorer}" gave ${JSON.stringify(value)}, which is not a number, a boolean or C/I/P/N`);
}

/** A subtraction of costs leaves float noise (0.3 - 0.1 = 0.19999999999999998); twelve digits remove it. */
const withoutFloatNoise = (value: number) => Number(value.toPrecision(12));

/**
 * The candidate's own use: the usage of its model, minus that of any role
 * (a grader, for example) served by the same model, which Inspect adds to it.
 */
function candidateUsage(sample: Sample, model: string, rolesOnTheSameModel: string[]): Partial<Record<string, number>> | undefined {
  const modelUsage = sample.model_usage?.[model];

  if (!modelUsage) return undefined;

  const result: Partial<Record<string, number>> = {};

  for (const field of USAGE_MEASURES) {
    const total = modelUsage[field];

    if (typeof total !== "number") continue;

    const usedByRoles = rolesOnTheSameModel.reduce((sum, role) => sum + (sample.role_usage?.[role]?.[field] ?? 0), 0);

    result[field] = withoutFloatNoise(Math.max(0, total - usedByRoles));
  }

  return result;
}

function failureStatus(sample: Sample): string | undefined {
  if (sample.error) return "error";

  if (sample.limit) return `limit_${sample.limit.type}`;

  if (sample.invalidation) return "invalidated";

  return undefined;
}

const compareItems = (left: string, right: string) => {
  const bothNumbers = /^\d+$/.test(left) && /^\d+$/.test(right);

  if (bothNumbers) return Number(left) - Number(right);

  return left < right ? -1 : left > right ? 1 : 0;
};

function candidateOf(evalSpec: z.infer<typeof logHeader>["eval"], candidates: Candidate[], logName: string): string {
  const ids = candidates.map((candidate) => candidate.id).join(", ");
  const declared = evalSpec.metadata?.candidate;

  if (declared !== undefined) {
    const match = candidates.find((candidate) => candidate.id === String(declared));

    if (!match) throw new ImportError(`${logName}: metadata candidate "${String(declared)}" names no candidate (candidates: ${ids})`);

    return match.id;
  }

  const match = candidates.find((candidate) => candidate.id === evalSpec.model || candidate.name === evalSpec.model);

  if (!match) {
    throw new ImportError(
      `${logName}: no candidate matches the model "${evalSpec.model}": run inspect eval with --metadata candidate=<id> (candidates: ${ids})`,
    );
  }

  return match.id;
}

function nodeOf(evalSpec: z.infer<typeof logHeader>["eval"], leafNodes: string[], logName: string): string {
  const nodes = leafNodes.join(", ");
  const declared = evalSpec.metadata?.node;

  if (declared !== undefined) {
    if (!leafNodes.includes(String(declared)))
      throw new ImportError(`${logName}: metadata node "${String(declared)}" names no node at the lowest level (nodes: ${nodes})`);

    return String(declared);
  }

  const taskWithoutPackage = evalSpec.task.split("/").at(-1)!;
  const match = [evalSpec.task, taskWithoutPackage].find((name) => leafNodes.includes(name));

  if (!match) {
    throw new ImportError(
      `${logName}: no node matches the task "${evalSpec.task}": give the node the task's name, or run inspect eval with --metadata node=<id> (nodes: ${nodes})`,
    );
  }

  return match;
}

export interface InspectImport {
  rows: RawRow[];
  samplesPerCandidate: Map<string, number>;
  measures: string[];
}

/**
 * Converts Inspect logs into raw rows: one row per sample, epoch and measure,
 * with `item` the sample id, `repeat` the epoch and `node` the task. Measures
 * are the scorers (a scorer that gives several values gives one measure per
 * key, as `scorer.key`), the candidate's tokens and cost when Inspect records
 * them, and the sample's times in seconds. A sample that errored, hit a limit
 * or was invalidated is a failure on every measure.
 */
export function importInspect(logs: InspectLog[], candidates: Candidate[], leafNodes: string[] | undefined): InspectImport {
  const rows: RawRow[] = [];
  const samplesPerCandidate = new Map<string, number>();
  const measuresSeen: string[] = [];
  const firstLogOfSample = new Map<string, string>();
  const tasksSeen = new Set<string>();

  for (const log of logs) {
    const parsedHeader = logHeader.safeParse(log.header);

    if (!parsedHeader.success) {
      const firstIssue = parsedHeader.error.issues[0];

      throw new ImportError(`${log.name}: not an Inspect log (${firstIssue.path.join(".") || "file"}: ${firstIssue.message})`);
    }

    const header = parsedHeader.data;

    if (header.status === "started") throw new ImportError(`${log.name}: the evaluation is still running`);

    if (header.status !== "success") {
      throw new ImportError(
        `${log.name}: the evaluation did not finish (status "${header.status}"), so samples are missing: finish it with inspect eval-retry, or run it with --no-fail-on-error so that errored samples are kept and counted as failures`,
      );
    }

    if (header.invalidated) throw new ImportError(`${log.name}: the log is marked invalidated`);

    if (log.samples.length === 0) throw new ImportError(`${log.name}: the log has no samples: run inspect eval without --no-log-samples`);

    const candidate = candidateOf(header.eval, candidates, log.name);
    const node = leafNodes ? nodeOf(header.eval, leafNodes, log.name) : undefined;

    tasksSeen.add(header.eval.task);

    const samples = log.samples.map((sample, index) => {
      const parsed = sampleSchema.safeParse(sample);

      if (!parsed.success)
        throw new ImportError(`${log.name}: sample ${index + 1} is not an Inspect sample (${parsed.error.issues[0].message})`);

      return parsed.data;
    });
    const rolesOnTheSameModel = Object.entries(header.eval.model_roles ?? {})
      .filter(([, role]) => role.model === header.eval.model)
      .map(([role]) => role);
    const scorerKeys = new Map<string, Set<string> | null>();

    for (const sample of samples) {
      for (const [scorer, score] of Object.entries(sample.scores ?? {})) {
        const isDictionary = typeof score.value === "object" && score.value !== null && !Array.isArray(score.value);

        if (!scorerKeys.has(scorer)) scorerKeys.set(scorer, isDictionary ? new Set() : null);

        if (isDictionary) for (const key of Object.keys(score.value as object)) scorerKeys.get(scorer)?.add(key);
      }
    }

    const scoreMeasures = [...scorerKeys].flatMap(([scorer, keys]) => (keys ? [...keys].map((key) => `${scorer}.${key}`) : [scorer]));
    const usageBySample = samples.map((sample) => candidateUsage(sample, header.eval.model, rolesOnTheSameModel));
    const usageMeasures = USAGE_MEASURES.filter((field) => usageBySample.some((sampleUsage) => sampleUsage?.[field] !== undefined));
    const timeMeasures = TIME_MEASURES.filter((field) => samples.some((sample) => typeof sample[field] === "number"));
    const logMeasures = [...scoreMeasures, ...usageMeasures, ...timeMeasures];

    for (const measure of logMeasures) if (!measuresSeen.includes(measure)) measuresSeen.push(measure);

    const order = samples
      .map((sample, index) => ({ sample, index, item: String(sample.id) }))
      .sort((left, right) => left.sample.epoch - right.sample.epoch || compareItems(left.item, right.item));

    for (const { sample, index, item } of order) {
      const sampleKey = [candidate, node ?? "", item, sample.epoch].join("\u0000");
      const earlierLog = firstLogOfSample.get(sampleKey);

      if (earlierLog !== undefined) {
        const where = earlierLog === log.name ? `twice in ${log.name}` : `in ${earlierLog} and in ${log.name}`;

        throw new ImportError(
          `sample "${item}" epoch ${sample.epoch} of task "${header.eval.task}" for candidate "${candidate}" appears ${where}: import each evaluation once`,
        );
      }

      firstLogOfSample.set(sampleKey, log.name);
      samplesPerCandidate.set(candidate, (samplesPerCandidate.get(candidate) ?? 0) + 1);

      const identity = {
        candidate,
        ...(node !== undefined ? { node } : {}),
        item,
        repeat: String(sample.epoch),
        ...(sample.started_at ? { ts: sample.started_at } : {}),
      };
      const status = failureStatus(sample);

      if (status) {
        for (const measure of logMeasures) rows.push({ ...identity, measure, value: null, status });

        continue;
      }

      const scoreRow = (measure: string, value: unknown): RawRow => {
        const number = scoreToNumber(value, measure, log.name);

        return number === null ? { ...identity, measure, value: null, status: "not_scored" } : { ...identity, measure, value: number };
      };

      for (const [scorer, keys] of scorerKeys) {
        const value = sample.scores?.[scorer]?.value;

        if (!keys) {
          rows.push(scoreRow(scorer, value));
          continue;
        }

        const valuesByKey = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

        for (const key of keys) rows.push(scoreRow(`${scorer}.${key}`, valuesByKey[key]));
      }

      const sampleUsage = usageBySample[index];

      for (const field of usageMeasures) {
        const value = sampleUsage?.[field];

        if (value !== undefined) rows.push({ ...identity, measure: field, value });
      }

      for (const field of timeMeasures) {
        const value = sample[field];

        if (typeof value === "number") rows.push({ ...identity, measure: field, value });
      }
    }
  }

  if (!leafNodes && tasksSeen.size > 1) {
    throw new ImportError(
      `the logs hold ${tasksSeen.size} tasks (${[...tasksSeen].join(", ")}) but the plan has no structure: declare one node per task, or import each task into its own raw file`,
    );
  }

  return { rows, samplesPerCandidate, measures: measuresSeen };
}
