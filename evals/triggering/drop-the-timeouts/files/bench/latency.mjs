// Sends 30 lookups to staging and records each latency in bench/results.json.
const runs = [];
for (let run = 1; run <= 30; run++) {
  const start = performance.now();
  try {
    await fetch("https://staging.example.com/lookup?q=10+Downing+St", { signal: AbortSignal.timeout(2000) });
    runs.push({ run, ms: performance.now() - start });
  } catch {
    runs.push({ run, ms: null, status: "timeout" });
  }
}
console.log(JSON.stringify(runs));
