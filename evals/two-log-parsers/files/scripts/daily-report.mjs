// Run every night: requests, error rate and 95th percentile time per service over yesterday's log.
import { readFileSync } from "node:fs";
import { linesOf, parseLine } from "../lib/parse.mjs";

const services = new Map();

for (const entry of linesOf(readFileSync("logs/app.log", "utf8")).map(parseLine)) {
  const service = services.get(entry.service) ?? { requests: 0, errors: 0, times: [] };

  service.requests += 1;
  if (entry.level === "ERROR") service.errors += 1;
  service.times.push(Number(entry.fields.took));
  services.set(entry.service, service);
}

for (const [name, { requests, errors, times }] of [...services].sort()) {
  const sorted = Float64Array.from(times).sort();

  console.log(`${name.padEnd(10)} ${String(requests).padStart(7)} requests  ${((errors / requests) * 100).toFixed(2)}% errors  p95 ${sorted[Math.floor(sorted.length * 0.95)]} ms`);
}
