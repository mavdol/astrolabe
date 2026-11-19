// Run after each deploy: looks for a service whose error rate passed 2% in any five-minute window of the last hour.
import { readFileSync } from "node:fs";
import { linesOf, parseLine } from "../lib/parse.mjs";

const WINDOW_MS = 5 * 60 * 1000;
const windows = new Map();

for (const entry of linesOf(readFileSync("logs/last-hour.log", "utf8")).map(parseLine)) {
  const key = `${entry.service} ${Math.floor(entry.time / WINDOW_MS)}`;
  const counts = windows.get(key) ?? { requests: 0, errors: 0 };

  counts.requests += 1;
  if (entry.level === "ERROR") counts.errors += 1;
  windows.set(key, counts);
}

const alerts = [...windows].filter(([, counts]) => counts.requests >= 50 && counts.errors / counts.requests > 0.02).map(([key]) => key.split(" ")[0]);

console.log(alerts.length === 0 ? "no incident" : `error rate above 2%: ${[...new Set(alerts)].sort().join(", ")}`);
