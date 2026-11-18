// Adds the cases of one claude plugin eval result to another, creating it when it does not exist yet.
// usage: node scripts/merge-eval-results.mjs <aggregate-result.json to add to> <aggregate-result.json to add>
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [targetPath, addedPath] = process.argv.slice(2);
const added = JSON.parse(readFileSync(addedPath, "utf8"));

if (!existsSync(targetPath)) {
  writeFileSync(targetPath, JSON.stringify(added, null, 2));
  process.exit(0);
}

const target = JSON.parse(readFileSync(targetPath, "utf8"));

target.cases.push(...added.cases);
target.costUsd += added.costUsd;
target.durationSeconds += added.durationSeconds;
target.partial = target.partial || added.partial;
target.partialReason ??= added.partialReason;

writeFileSync(targetPath, JSON.stringify(target, null, 2));
