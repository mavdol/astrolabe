# ✪ Astrolabe

Benchmarks authored by agents, verifiable by humans.

The agent writes a plan and the measuring scripts, never numbers. The scripts write raw data, one JSON line per observation. `astrolabe compute` turns the raw data into every value, interval, comparison and verdict, and `astrolabe validate` computes them again to check that nothing was edited by hand.

Status: early development. The schema, `validate`, `compute`, the hyperfine importer, the Markdown output and the README card exist; the Inspect importer, PNG exports and the site do not yet.

## Commands

```bash
astrolabe validate [file]   # check the plan; after compute, recompute everything and compare
astrolabe compute [file]    # write values, intervals, failures, comparisons and verdicts into results
astrolabe import hyperfine <export.json...> --raw <id>   # convert hyperfine --export-json files into a raw file
astrolabe build [file]      # validate, then write dist/benchmark.md and the README card in dist/exports/, light and dark
astrolabe explain <rule>    # print one rule: instruction, pitfall, level, field
astrolabe schema            # print the JSON Schema of benchmark.json
```

Without a file argument, the command looks for `benchmark.json` in the current folder, then under `benchmarks/`.

## Examples

`examples/` holds four benchmarks with invented data: a run-time comparison, two external services, a usability study and an LLM suite. Each folder has its `benchmark.json`, the raw files under `data/` and the built outputs in `dist/`: `benchmark.md` and the README card. The tests compare them with what `build` writes.

`examples/js-runtimes/` is a real benchmark of Node.js and Deno, measured with hyperfine: run `./bench.sh` (it needs hyperfine, Node.js and Deno), then `astrolabe compute` and `astrolabe validate` on its `benchmark.json`.

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

## Licence

The code is under the MIT licence (`LICENSE`).
