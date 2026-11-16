import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/schema/benchmark.js";
import { JSON_SCHEMA_PATH, jsonSchemaFileContent, SKILL_JSON_SCHEMA_PATH } from "../src/schema/json-schema.js";

describe("JSON Schema shipped in the package", () => {
  it("matches the Zod definition: run pnpm gen:schema after changing src/schema/", () => {
    expect(readFileSync(JSON_SCHEMA_PATH, "utf8")).toBe(jsonSchemaFileContent());
  });

  it("is copied unchanged into the skill folder: run pnpm gen:schema", () => {
    expect(readFileSync(SKILL_JSON_SCHEMA_PATH, "utf8")).toBe(jsonSchemaFileContent());
  });

  it("names the format version it describes", () => {
    const schema = JSON.parse(jsonSchemaFileContent());

    expect(schema.title).toContain(SCHEMA_VERSION);
    expect(schema.properties.schema_version.const).toBe(SCHEMA_VERSION);
  });
});
