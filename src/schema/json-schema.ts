import { z } from "zod";
import { benchmarkSchema, SCHEMA_VERSION } from "./benchmark.js";

/** Shipped in the npm package; each package version holds the schema of the format version it implements. */
export const JSON_SCHEMA_PATH = "schema/benchmark.schema.json";

/** The copy an agent reads in the skill folder, which is used without the rest of the repository. */
export const SKILL_JSON_SCHEMA_PATH = "skills/astrolabe-benchmark/benchmark.schema.json";

export function jsonSchema(): Record<string, unknown> {
  const { $schema: jsonSchemaDraft, ...definition } = z.toJSONSchema(benchmarkSchema, { unrepresentable: "any" });

  return { $schema: jsonSchemaDraft, title: `benchmark.json, format ${SCHEMA_VERSION}`, ...definition };
}

/** The schema file, byte for byte: generated from the Zod definition, never edited by hand. */
export function jsonSchemaFileContent(): string {
  return `${JSON.stringify(jsonSchema(), null, 2)}\n`;
}
