// Run at the start of every CI job: refuses to go on when the last deploy did not finish cleanly.
import { readFileSync } from "node:fs";
import { linesOf, parseLine } from "../lib/parse.mjs";

const entries = linesOf(readFileSync("logs/deploy.log", "utf8")).map(parseLine);
const start = entries.findLastIndex((entry) => entry.fields.step === "start");
const lastDeploy = entries.slice(start);
const errors = lastDeploy.filter((entry) => entry.level === "ERROR");
const finished = lastDeploy.some((entry) => entry.fields.step === "done");
const version = lastDeploy[0].fields.version;

if (!finished || errors.length > 0) {
  console.error(`release ${version}: ${finished ? `${errors.length} errors` : "did not finish"}`);
  process.exit(1);
}

console.log(`release ${version} ok, ${lastDeploy.length} steps`);
