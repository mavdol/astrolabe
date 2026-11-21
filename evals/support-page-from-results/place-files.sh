#!/usr/bin/env bash
# A repository with the finished support-model evaluation: the example's file, computed, with no page declared.
set -eu
here="$(dirname "${BASH_SOURCE[0]}")"
shared="$here/../_shared"

# scripts/run-evals.sh runs the cases from a copy and writes where the repository is.
if [ -f "$shared/repository-path" ]; then repository="$(cat "$shared/repository-path")"; else repository="$(cd "$here/../.." && pwd)"; fi

mkdir -p benchmarks/support-models
cp -R "$repository/examples/support-assistant-eval/data" benchmarks/support-models/
node -e '
const fs = require("fs");
const benchmark = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const section of ["style", "filters", "layout", "blocks", "exports"]) delete benchmark[section];
fs.writeFileSync("benchmarks/support-models/benchmark.json", JSON.stringify(benchmark, null, 2) + "\n");
' "$repository/examples/support-assistant-eval/benchmark.json"
printf '# Support assistant\n\nThe assistant that answers our customers'"'"' support questions.\n' > README.md
rm -f place-files.sh
bash "$shared/install-astrolabe.sh"
