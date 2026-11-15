import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { JSON_SCHEMA_PATH, jsonSchemaFileContent } from "../src/schema/json-schema.js";

mkdirSync(dirname(JSON_SCHEMA_PATH), { recursive: true });
writeFileSync(JSON_SCHEMA_PATH, jsonSchemaFileContent());
console.log(`wrote ${JSON_SCHEMA_PATH}`);
