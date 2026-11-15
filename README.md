# Astrolabe

Benchmarks authored by agents, verifiable by humans.

The agent writes a plan and the measuring scripts, never numbers. The scripts write raw data, one JSON line per observation. `astrolabe compute` turns the raw data into every value, interval, comparison and verdict, and `astrolabe validate` computes them again to check that nothing was edited by hand.

Status: early development. The schema, `validate` and `compute` exist; importers, the Markdown table, the README card and the site do not yet.

## Commands

```bash
astrolabe validate [file]   # check the plan; after compute, recompute everything and compare
astrolabe compute [file]    # write values, intervals, failures, comparisons and verdicts into results
astrolabe explain <rule>    # print one rule: instruction, pitfall, level, field
astrolabe schema            # print the JSON Schema of benchmark.json
```

Without a file argument, the command looks for `benchmark.json` in the current folder, then under `benchmarks/`.

## Examples

`examples/` holds four benchmarks with invented data: a run-time comparison, two external services, a usability study and an LLM suite. Each folder has its `benchmark.json` and the raw files under `data/`.

```bash
pnpm astrolabe validate examples/json-cli-parse/benchmark.json
```

## Development

```bash
pnpm install
pnpm test                 # statistics against scipy reference values, compute, validate
pnpm typecheck
pnpm build
pnpm gen:example-data     # rewrite the synthetic raw files of the examples
```

Requires Node 22 or later.
