import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { JSON_SCHEMA_PATH, jsonSchemaFileContent, SKILL_JSON_SCHEMA_PATH } from "../src/schema/json-schema.js";

for (const path of [JSON_SCHEMA_PATH, SKILL_JSON_SCHEMA_PATH]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, jsonSchemaFileContent());
  console.log(`wrote ${path}`);
}
