import { z } from "zod";
import { benchmarkSchema, SCHEMA_VERSION } from "./benchmark.js";

/**
 * The one generated file, in the skill folder that agents read without the rest of the repository.
 * The npm package ships it, so each package version holds the schema of the format version it implements.
 */
export const JSON_SCHEMA_PATH = "plugin/skills/astrolabe-benchmark/benchmark.schema.json";

export function jsonSchema(): Record<string, unknown> {
  const { $schema: jsonSchemaDraft, ...definition } = z.toJSONSchema(benchmarkSchema, { unrepresentable: "any" });

  return { $schema: jsonSchemaDraft, title: `benchmark.json, format ${SCHEMA_VERSION}`, ...definition };
}

/** The schema file, byte for byte: generated from the Zod definition, never edited by hand. */
export function jsonSchemaFileContent(): string {
  return `${JSON.stringify(jsonSchema(), null, 2)}\n`;
}
