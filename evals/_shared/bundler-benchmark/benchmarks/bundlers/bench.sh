#!/usr/bin/env bash
# Measures both bundlers with hyperfine, then converts the export into data/runs.jsonl.
set -euo pipefail
cd "$(dirname "$0")"

hyperfine --shell=none --warmup 2 --runs 30 --ignore-failure --export-json data/hyperfine.json \
  --command-name packwise "node ../../scripts/build-with.mjs packwise" \
  --command-name swiftpack "node ../../scripts/build-with.mjs swiftpack"

npx astrolabe import hyperfine data/hyperfine.json --raw runs --benchmark benchmark.json
