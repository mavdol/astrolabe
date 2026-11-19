// Writes the logs the scripts read, the same every time: logs/app.log (yesterday, 400,000 requests),
// logs/last-hour.log (40,000 requests) and logs/deploy.log (the last deploys).
import { mkdirSync, writeFileSync } from "node:fs";

let state = 20261103;
const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(next() * list.length)];
const services = ["checkout", "search", "auth", "billing", "catalog"];
const requestId = () => `r-${Math.floor(next() * 0xffffff).toString(16).padStart(6, "0")}`;

function requestLines(count, from, spanMs) {
  return Array.from({ length: count }, (_, index) => {
    const stamp = new Date(from + Math.floor((index / count) * spanMs)).toISOString();
    const roll = next();
    const level = roll < 0.012 ? "ERROR" : roll < 0.08 ? "WARN" : "INFO";
    const status = level === "ERROR" ? pick([500, 502, 503, 504]) : level === "WARN" ? pick([404, 409, 429]) : 200;

    return `${stamp} ${level} ${pick(services)} status=${status} took=${Math.floor(5 + next() * next() * 900)} request=${requestId()}`;
  });
}

const deploySteps = ["start", "build", "migrate", "warm-cache", "switch-traffic", "smoke-test", "done"];
const deployLines = [];
let deployTime = Date.UTC(2026, 10, 1, 8);

for (const version of ["4.17.0", "4.17.1", "4.18.0", "4.18.1", "4.18.2"]) {
  for (const step of deploySteps) {
    for (let detail = 0; detail < (step === "start" || step === "done" ? 1 : 8); detail++) {
      deployTime += 1000 + Math.floor(next() * 4000);
      deployLines.push(`${new Date(deployTime).toISOString()} INFO deploy step=${step} version=${version} host=web-${1 + Math.floor(next() * 6)}`);
    }
  }
  deployTime += 6 * 3600 * 1000;
}

mkdirSync("logs", { recursive: true });
writeFileSync("logs/app.log", requestLines(400_000, Date.UTC(2026, 10, 2), 86_400_000).join("\n") + "\n");
writeFileSync("logs/last-hour.log", requestLines(40_000, Date.UTC(2026, 10, 3, 13), 3_600_000).join("\n") + "\n");
writeFileSync("logs/deploy.log", deployLines.join("\n") + "\n");
