# Time: run time, latency, throughput

Three kinds of metric: `run_time` (how long one job takes), `latency` (how long each request waits) and `throughput` (how much work per unit of time). The traps are the same: warm-up, order effects, failures that look fast, and averages that hide the tail.

## Contents

- Decisions to make
- Run time of a command, with hyperfine
- Your own timing script
- Latency, and services you do not control
- Rules

## Decisions to make

| Decision | Default | Where it goes |
| --- | --- | --- |
| Cold or warm | Ask which one the user lives with: a script started once a night is cold, a server is warm. Never mix the two in one metric | `runs.state` |
| Warm-up | Untimed runs before measuring. For short simple commands a fixed count (3) is fine; for a JIT or a cache-heavy system run a pilot of 20 to 30 iterations, look at the sequence and discard the unstable start | `runs.warmup` |
| What is timed | Say exactly what the interval covers: start-up included or not, input reading included or not | `metrics[].definition` |
| Summary | Median for run times; percentiles for latency: p50, p95 and, with enough requests, p99 | `metrics[].statistic` |
| Order | Interleaved, alternated or shuffled | `runs.order` |
| Failures | Left out of the time, counted beside it | `"failures_count_as": "excluded"`, plus a success metric |
| Several scripts or tasks | One primary comparison per script the decision rests on; `"aggregation": { "groups": "macro" }` so that the parent row reads as one pass through the scripts | `analysis.primary`, `metrics[].aggregation` |

`validate` asks for `runs.warmup` and `runs.state` on every time metric, and for `environment.hardware`, `os` and `software` when the measurement runs on your own machine.

A suite of scripts of different lengths has no single run time. Its parent node combines them in one of two ways, and both mislead: with `"aggregation": { "groups": "micro" }`, the default, it pools the runs of every script, so its median is a run of whichever script falls in the middle; with `"macro"`, it averages the scripts' medians, so the longest scripts decide the change. Either way a short script getting slower hides behind longer ones getting faster. Name each script the decision rests on in `analysis.primary`; without `analysis.primary` the parent is the primary comparison, so declare it whenever there is a structure. Each script, metric and candidate adds a primary comparison, and each one widens the intervals of all of them: keep to what the decision needs. Set `macro` so that the parent row of the tables reads as one pass through every script, a fair overview only when the scripts run equally often. The same holds for memory, CPU and energy.

## Run time of a command, with hyperfine

hyperfine handles warm-up, repetition and the shell's own start-up. Name each command after its candidate id, export JSON, and import it:

```bash
hyperfine --shell=none --warmup 3 --runs 10 --export-json data/hyperfine/round-1.json \
  --command-name csv_a "node parse-a.mjs data/orders.csv" \
  --command-name csv_b "node parse-b.mjs data/orders.csv"
astrolabe import hyperfine data/hyperfine/round-*.json --raw runs
```

The import writes the measures `wall_time`, `cpu_time`, `user_time` and `system_time` in seconds, `peak_rss` in MiB when hyperfine reports it, and turns a non-zero exit code into a failure. hyperfine runs all the runs of one command before the next: do several rounds, each with its own export, and alternate the order of the commands between rounds; the import numbers the runs across exports. Keep the exports in `data/` and put the whole sequence in a script, so that `artifacts.command` reruns it.

```json
{ "id": "wall_time", "label": "Wall time", "unit": "s", "direction": "lower", "kind": "run_time", "statistic": "median",
  "definition": "Elapsed time of one process parsing data/orders.csv, start-up included, measured by hyperfine without a shell",
  "compare_as": "relative", "minimum_meaningful": 10, "failures_count_as": "excluded",
  "from": { "raw": "runs", "measure": "wall_time" } }
```

hyperfine only knows the exit code. If a candidate can finish with a wrong output, check the output in the script as well and record it as its own measure.

## Your own timing script

When no tool fits (a function call, a step inside a process), time each event with a monotonic clock (`performance.now()`, `process.hrtime.bigint()`, `time.perf_counter_ns()`), one process per run, and write one row per run. Keep the timer honest: the timed interval should be at least a few hundred times the clock's resolution, and the script's own work (reading inputs, writing the row) stays outside it.

A micro-benchmark of one function says little about the application around it: time the user's real job end to end, or say in `benchmark.scope` what the number covers.

## Latency, and services you do not control

```json
{ "id": "latency_p95", "label": "95th percentile latency", "unit": "ms", "direction": "lower", "kind": "latency", "statistic": "p95",
  "definition": "Time from the scheduled send to the full response, successful requests only",
  "compare_as": "relative", "minimum_meaningful": 10, "failures_count_as": "excluded",
  "from": { "raw": "requests", "measure": "latency_ms" } }
```

- Declare one metric per percentile that matters (`p50`, `p95`, `p99`), all reading the same measure: one service can win at the median and lose in the tail. A p95 needs about 72 requests per candidate for an interval, a p99 several hundred.
- Write one row per request; compute takes percentiles over all requests together. Never average percentiles from several workers or windows.
- A failed request (error, timeout, empty answer) is a row with `value: null` and a `status`. A fast error is not a fast answer. Add a success metric: a share that reads a measure written 1 or 0.
- A load test sends requests at a fixed rate and measures each one from the moment it was scheduled, not from the moment it was sent, so a slow response does not hide the wait behind it. Declare the condition `load_test` in `benchmark.conditions` and describe the rate in `workload.arrival_model`.
- For an API, a SaaS or anything else you do not run: write `ts` on every row, give each candidate its `service` (`region`, `plan`, `api_version`), and spread the measurement over at least two times of day and two days when the budget allows. When it does not, say in `limitations` that the result is one session, at one time, from one place. A sandbox endpoint is not production: say that too.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| T1 | Must | Run untimed warm-up iterations, and decide explicitly whether the user cares about cold or warm performance (use a prepare step to reset caches for cold runs). | Mixing cold and warm states | runs.warmup, runs.state (cold/warm) |
| T5 | Should | Randomize or vary incidental setup (run order, environment, layout) and interleave configurations rather than running them in blocks. | Measurement bias from "innocuous" setup choices | runs.order |
| T6 | Must | For latency, report percentiles or the full distribution, not only the mean; never average percentiles across workers or windows, merge histograms instead (histograms add up, percentiles do not). Compare at the percentiles that matter: one system can win at the median and lose at p99 (Hoefler & Belli, rule 8). | Hidden tail latency, mathematically wrong aggregates | values[].percentiles |
| T7 | Must | For load tests, use an open model (fixed arrival rate) and measure each request from the time it was scheduled to be sent, so slow responses do not reduce the load or hide the wait. | Coordinated omission hiding the worst latencies | workload.arrival_model |
| T8 | Must | Separate successful and failed requests before reading latency; check that runs did not error out. | Fast failures counted as fast results | failures[] |
| T9 | Should | Pair throughput with resource usage (CPU per request or per byte); a throughput drop of x% is not an overhead of x%. | Understated overhead | — |
| T10 | Should | Do not present micro-benchmarks as overall performance; add a realistic end-to-end workload. | Kernel results sold as application results | — |
| T11 | Should | Keep timer overhead under 5% of the measured interval and timer resolution at least 10 times finer (Hoefler & Belli); time single events when the timer allows, since batching loses percentiles and per-event CIs, and remove harness overhead. | Timer and harness noise in the result | — |
| T12 | Should | Prefer established tools that handle warm-up, repetition and outlier detection (e.g. hyperfine for commands, wrk2 for HTTP load). | Hand-rolled timing mistakes | environment.tools[] |
| T13 | Should | Compare the run time, memory, CPU or energy of a suite script by script. One figure for scripts of different sizes either pools their runs, so its median belongs to none of them, or averages them, so the longest decide the change: either way a slower script can hide behind faster ones. | A suite figure that hides one script getting slower behind others getting faster | analysis.primary[] |
