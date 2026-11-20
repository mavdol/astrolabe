# Resources: memory, CPU, energy

Kinds `memory`, `cpu` and `energy`. The main trap is comparing numbers that do not measure the same thing: peak against average, one process against a whole process tree, a language heap against what the operating system sees.

## How to declare a resource metric

```json
{ "id": "peak_rss", "label": "Peak memory", "unit": "MiB", "direction": "lower", "kind": "memory", "statistic": "median",
  "definition": "Peak resident set size of the process over one run, as reported by the operating system",
  "scope": "The parser's process only; no child process",
  "compare_as": "relative", "minimum_meaningful": 20, "failures_count_as": "excluded",
  "from": { "raw": "runs", "measure": "peak_rss" } }
```

- `definition` names the quantity exactly: peak, steady state or what remains after the operation; resident set size of the process or heap of the language. The same definition for every candidate.
- `scope` says what the counter covers, and is required: the process alone, its children too, a service it calls. Work pushed to another process or core still costs something. For energy, name the domain of the counter (package, cores, DRAM) and say that it is not the power of the whole machine.
- `unit` is unambiguous: MiB or MB, not "megs".
- A usage expressed in percent (CPU share) is compared as `relative`: from 6% to 13% is more than double, not "7 points". `validate` refuses `difference` there.

## How to measure

- Peak memory of a command: hyperfine reports it and `astrolabe import hyperfine` writes it as `peak_rss` (MiB). Otherwise `/usr/bin/time -v` on Linux or `/usr/bin/time -l` on macOS (mind the units: kilobytes on Linux, bytes on macOS), or `process.resourceUsage().maxRSS` inside Node.js; the script converts and writes the row.
- One snapshot at the end misses the peak. To see growth or a leak, sample during the run and write the samples as rows of a raw file declared with `"kind": "timeseries"`.
- Start from a quiet machine and say what else was running in `environment.background`. A laptop with a browser open is a limitation to write down.
- Runtimes with a garbage collector or a JIT (JVM, Node.js, Go, .NET, Python): heap size and collector settings change both memory and time, sometimes the ranking. Declare the condition `managed_runtime` in `benchmark.conditions`, record the settings in `environment.runtime_settings`, and when memory matters compare at more than one heap size.
- Check the result against what is possible: a process cannot use more memory than the machine has, or more CPU than its cores. A number beyond a hard limit is a measurement error.

## Rules

| Rule | Level | Instruction | Pitfall it prevents | Proved by |
| --- | --- | --- | --- | --- |
| R1 | Must | Measure total resource use, including work offloaded to other cores, processes or services. | Hiding cost on a "free" core | metrics[].scope |
| R2 | Must | Express changes in usage as relative increases, not percentage-point differences (6% to 13% is more than double, not +7%). | Downplayed overhead | enforced by the generator |
| R3 | Should | Start from a quiescent system and verify it stays quiet; record background load. | Noise from other activity | environment.background |
| R4 | Must | For energy, state which domain the counter covers (e.g. RAPL package, cores or DRAM) and that it is not whole-machine power. | Partial energy reported as total | metrics[].scope |
| R5 | Should | For energy, control and report frequency scaling and thread affinity, and report the average frequency actually reached. | Results driven by clock behaviour rather than the code | environment.cpu_frequency |
| R6 | Should | Do not rely only on an automated script for energy: form an expected result first and check the measurements against it. | Undetected counter or tooling errors | — |
| R7 | Should | Check results against theoretical limits (hardware maximums); a result beyond them is an error. | Impossible numbers published | enforced by the generator against a ceiling declared in metrics[].reference_points |
| R8 | Must | Name the memory metric exactly: peak, steady state or residual after the operation; process RSS (includes runtime overhead and memory not returned to the OS) or language heap. Never compare different definitions. | Comparing numbers that measure different things | metrics[].definition |
| R9 | Should | Sample memory repeatedly during the run instead of taking one snapshot; report peak, steady state and growth. | Missing transient peaks or slow leaks | raw_data[] (kind: timeseries) |
| R10 | Must | For garbage-collected runtimes, treat heap size and GC settings as a factor: record them, and compare at several heap sizes when memory matters. | Rankings that flip with heap size | environment.runtime_settings |
| R11 | Should | For managed runtimes, account for JIT warm-up and adaptive-optimization nondeterminism (see T1 and S4). | Measuring the warm-up instead of the steady state | runs.warmup |
