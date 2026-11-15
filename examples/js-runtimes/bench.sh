#!/usr/bin/env bash
# Measures the same workload on each runtime with hyperfine, then converts the exports into data/runs.jsonl.
# hyperfine runs every run of one command before the next, so the order of the runtimes alternates between rounds.
set -euo pipefail
cd "$(dirname "$0")"

ROUNDS=3
RUNS_PER_ROUND=10
ASTROLABE="${ASTROLABE:-npx tsx ../../src/cli/index.ts}"

rm -rf data/hyperfine
mkdir -p data/hyperfine

for round in $(seq 1 "$ROUNDS"); do
  node_command=(--command-name node "node workload.mjs")
  deno_command=(--command-name deno "deno run --quiet workload.mjs")

  if (( round % 2 == 1 )); then
    commands=("${node_command[@]}" "${deno_command[@]}")
  else
    commands=("${deno_command[@]}" "${node_command[@]}")
  fi

  hyperfine --shell=none --warmup 3 --runs "$RUNS_PER_ROUND" --export-json "data/hyperfine/round-$round.json" "${commands[@]}"
done

$ASTROLABE import hyperfine data/hyperfine/round-*.json --raw runs --benchmark benchmark.json
