import { createHash } from "node:crypto";

/** An error of compute, tied to the rule it enforces and the field to fix. */
export class ComputeError extends Error {
  constructor(
    public rule: string,
    public path: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RawRow {
  candidate: string;
  measure: string;
  value: number | null;
  status?: string;
  item?: string;
  repeat?: string;
  run?: string;
  node?: string;
  cluster?: string;
  ts?: string;
}

export interface RawFile {
  rows: RawRow[];
  sha256: string;
}

const textOrUndefined = (field: unknown): string | undefined => (field === undefined || field === null ? undefined : String(field));

export function parseRaw(rawFileId: string, content: Buffer | string): RawFile {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const rows: RawRow[] = [];

  bytes
    .toString("utf8")
    .split("\n")
    .forEach((line, lineIndex) => {
      if (line.trim() === "") return;

      const location = `raw_data[${rawFileId}] line ${lineIndex + 1}`;
      let observation: Record<string, unknown>;

      try {
        observation = JSON.parse(line);
      } catch {
        throw new ComputeError("F18", location, "not a JSON object: a raw file holds one JSON object per line");
      }

      if (typeof observation !== "object" || observation === null || Array.isArray(observation))
        throw new ComputeError("F18", location, "not a JSON object");

      if (typeof observation.candidate !== "string") throw new ComputeError("F18", location, "missing field: candidate");

      if (typeof observation.measure !== "string") throw new ComputeError("F18", location, "missing field: measure");

      const valueIsNumberOrNull =
        observation.value === null || (typeof observation.value === "number" && Number.isFinite(observation.value));

      if (!valueIsNumberOrNull) throw new ComputeError("F18", location, "value must be a number, or null when the observation failed");

      rows.push({
        candidate: observation.candidate,
        measure: observation.measure,
        value: observation.value as number | null,
        status: textOrUndefined(observation.status),
        item: textOrUndefined(observation.item),
        repeat: textOrUndefined(observation.repeat),
        run: textOrUndefined(observation.run),
        node: textOrUndefined(observation.node),
        cluster: textOrUndefined(observation.cluster),
        ts: textOrUndefined(observation.ts),
      });
    });

  return { rows, sha256: createHash("sha256").update(bytes).digest("hex") };
}
