#!/usr/bin/env bash
# Runs the skill's evaluations (evals/) with `claude plugin eval`.
# Every run is a real model call billed to your Claude account or API key; nothing starts before you confirm.
#
# usage: scripts/run-evals.sh [--quick] [--case <glob>] [--runs <n>] [--model <model>] [--with-skill | --without-skill]
#                             [--parallel <n>] [--max-cost-usd <usd>] [--keep-temp]
#
#   --quick           only the cases tagged "quick" (four short scenarios)
#   --case <glob>     only the cases whose name matches
#   --runs <n>        runs per case and per configuration (default 3)
#   --model <model>   model of the agent under test (default sonnet)
#   --with-skill      only the runs with the skill (compare them with a baseline already run)
#   --without-skill   only the runs without the skill (the baseline; it changes only with the model)
#   --parallel <n>    runs at once, 1 to 8 (default 4); they share your account's rate limit
#   --max-cost-usd    stop starting new runs past this estimated cost (default 25)
#   --keep-temp       keep each run's workspace and trace, to see what the agent did
set -euo pipefail
cd "$(dirname "$0")/.."

runs=3
model=sonnet
max_cost=25
parallel=4
configuration=both
filters=()
extra=()
case_pattern='*'
quick_only=false

while [ $# -gt 0 ]; do
  case "$1" in
    --quick) filters+=(--tag quick); quick_only=true ;;
    --case) filters+=(--case "$2"); case_pattern="$2"; shift ;;
    --runs) runs="$2"; shift ;;
    --model) model="$2"; shift ;;
    --with-skill) configuration=with ;;
    --without-skill) configuration=without ;;
    --parallel) parallel="$2"; shift ;;
    --max-cost-usd) max_cost="$2"; shift ;;
    --keep-temp) extra+=(--keep-temp) ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$configuration" != without ] && [ ! -d skills ]; then
  echo "There is no skill in skills/ yet: only --without-skill can run." >&2
  exit 2
fi

cases=0
for prompt in evals/*/prompt.md; do
  name=$(basename "$(dirname "$prompt")")
  # shellcheck disable=SC2053
  [[ $name == $case_pattern ]] || continue
  if $quick_only && ! grep -q '^tags: \[quick' "$prompt"; then continue; fi
  cases=$((cases + 1))
done
[ "$cases" -gt 0 ] || { echo "No case matches these filters." >&2; exit 2; }

case "$configuration" in
  both) described="with and without the skill"; total=$((cases * runs * 2)) ;;
  with) described="with the skill only"; total=$((cases * runs)) ;;
  without) described="without the skill only"; total=$((cases * runs)) ;;
esac

echo "Building astrolabe, which every case installs into its workspace..."
pnpm -s build >/dev/null 2>&1

echo
echo "About to run: $cases cases × $runs runs, $described ($total runs, $parallel at a time), with $model, judged by sonnet."
echo "Filters: ${filters[*]:-none}. Cost ceiling: $max_cost USD (estimated list price; runs already started may pass it)."
read -r -p "Start? [y/N] " answer
[ "$answer" = "y" ] || { echo "Nothing was run."; exit 0; }

output="$PWD/evals/results/$(date +%Y-%m-%dT%H-%M-%S)"

# claude plugin eval only evaluates a Claude Code plugin. The repository stays agent-neutral, so the
# plugin is a temporary folder: a manifest, a copy of the skills and of the evaluation cases, and the
# path of this repository, where the cases install the astrolabe command from. A run with a single
# configuration loads the plugin once (--ablation none): with the skill copied in, or without it.
plugin="$(mktemp -d)/astrolabe"
mkdir -p "$plugin/.claude-plugin"
printf '{ "name": "astrolabe", "version": "0.0.0-eval" }\n' > "$plugin/.claude-plugin/plugin.json"
rsync -a --exclude /results/ evals/ "$plugin/evals/"
echo "$PWD" > "$plugin/evals/_shared/repository-path"
if [ "$configuration" != without ]; then cp -R skills "$plugin/skills"; fi
if [ "$configuration" != both ]; then extra+=(--ablation none); fi
trap 'rm -rf "$(dirname "$plugin")"' EXIT

claude plugin eval "$plugin" \
  --trust-plugin \
  --scaffold \
  --allow-tools Bash Write Edit \
  --model "$model" \
  --judge-model sonnet \
  --runs "$runs" \
  --concurrency "$parallel" \
  --max-cost-usd "$max_cost" \
  --no-publish \
  --output-dir "$output" \
  ${extra[@]+"${extra[@]}"} \
  ${filters[@]+"${filters[@]}"}

echo
echo "Report: $output/report.html"
