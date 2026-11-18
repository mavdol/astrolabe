import { writeFileSync } from "node:fs";
import { JSON_SCHEMA_PATH, jsonSchemaFileContent } from "../src/schema/json-schema.js";

writeFileSync(JSON_SCHEMA_PATH, jsonSchemaFileContent());
console.log(`wrote ${JSON_SCHEMA_PATH}`);
