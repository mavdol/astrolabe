import type { RawRow } from "../compute/raw-data.js";

export class ImportError extends Error {}

export interface Candidate {
  id: string;
  name: string;
}

const FIELD_ORDER = ["candidate", "node", "item", "repeat", "measure", "value", "run", "status", "ts"] as const;
const NUMBERED_FIELDS = new Set(["repeat", "run"]);

/** One JSON object per line, keys in a fixed order, so that the same exports always give the same bytes. */
export function rawFileContent(rows: RawRow[]): string {
  return rows
    .map((row) => {
      const ordered: Record<string, unknown> = {};

      for (const field of FIELD_ORDER) {
        const value = row[field];

        if (value === undefined) continue;

        ordered[field] = NUMBERED_FIELDS.has(field) && /^\d+$/.test(String(value)) ? Number(value) : value;
      }

      return JSON.stringify(ordered);
    })
    .join("\n")
    .concat("\n");
}
