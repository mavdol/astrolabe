#!/usr/bin/env bash
# Runs the skill's evaluations (evals/) with `claude plugin eval`.
# Every run is a real model call billed to your Claude account or API key; nothing starts before you confirm.
#
# usage: scripts/run-evals.sh [--quick] [--case <glob>] [--runs <n>] [--model <model>] [--with-skill | --without-skill]
#                             [--parallel <n>] [--max-cost-usd <usd>] [--keep-temp]
#                             [--skills <folder>] [--output <folder>] [--yes]
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
#   --skills <folder> the skills to test, instead of skills/ (another version of the skill)
#   --output <folder> where the report is written, instead of evals/results/<date>
#   --yes             start without asking (for a script that has already asked)
#
# claude plugin eval takes no environment variable from a case but EVAL_*. A case that needs others (to
# make the agent compact its context early, for example) lists them in its operator.env, one NAME=value
# per line, and runs in a call of its own with them set; its results are merged into the main ones. The
# cost ceiling applies to each call.
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
skills=skills
output=""
confirmed=false

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
    --skills) skills="$2"; shift ;;
    --output) output="$2"; shift ;;
    --yes) confirmed=true ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$configuration" != without ] && [ ! -d "$skills" ]; then
  echo "There is no skill in $skills: only --without-skill can run." >&2
  exit 2
fi

cases_together=()
cases_apart=()
for prompt in evals/*/prompt.md; do
  name=$(basename "$(dirname "$prompt")")
  # shellcheck disable=SC2053
  [[ $name == $case_pattern ]] || continue
  if $quick_only && ! grep -q '^tags: \[quick' "$prompt"; then continue; fi
  if [ -f "evals/$name/operator.env" ]; then cases_apart+=("$name"); else cases_together+=("$name"); fi
done
cases=$((${#cases_together[@]} + ${#cases_apart[@]}))
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
if [ ${#cases_apart[@]} -gt 0 ]; then
  echo "In a call of their own, each with the same ceiling: ${cases_apart[*]}."
fi
if ! $confirmed; then
  read -r -p "Start? [y/N] " answer
  [ "$answer" = "y" ] || { echo "Nothing was run."; exit 0; }
fi

[ -n "$output" ] || output="$PWD/evals/results/$(date +%Y-%m-%dT%H-%M-%S)"

# claude plugin eval only evaluates a Claude Code plugin. The repository stays agent-neutral, so the
# plugin is a temporary folder: a manifest, a copy of the skills and of the evaluation cases, and the
# path of this repository, where the cases install the astrolabe command from. A run with a single
# configuration loads the plugin once (--ablation none): with the skill copied in, or without it.
workspace="$(mktemp -d)"
trap 'rm -rf "$workspace"' EXIT
if [ "$configuration" != both ]; then extra+=(--ablation none); fi

# make_plugin <folder> <case>...: a plugin whose evals/ runs only the given cases. Every case folder is
# copied, since scaffolds share files across cases; the others lose what makes them a case.
make_plugin() {
  local plugin="$1" folder
  shift
  mkdir -p "$plugin/.claude-plugin"
  printf '{ "name": "astrolabe", "version": "0.0.0-eval" }\n' > "$plugin/.claude-plugin/plugin.json"
  rsync -a --exclude /results/ evals/ "$plugin/evals/"
  for folder in "$plugin"/evals/*/; do
    [[ " $* " == *" $(basename "$folder") "* ]] || rm -rf "$folder/prompt.md" "$folder/case.yaml" "$folder/graders"
  done
  echo "$PWD" > "$plugin/evals/_shared/repository-path"
  if [ "$configuration" != without ]; then cp -R "$skills" "$plugin/skills"; fi
}

# run_suite <plugin> <output> [NAME=value]...: claude plugin eval on that plugin, with those variables set.
run_suite() {
  local plugin="$1" results="$2"
  shift 2
  env "$@" claude plugin eval "$plugin" \
    --trust-plugin \
    --scaffold \
    --allow-tools Bash Write Edit \
    --model "$model" \
    --judge-model sonnet \
    --runs "$runs" \
    --concurrency "$parallel" \
    --max-cost-usd "$max_cost" \
    --no-publish \
    --output-dir "$results" \
    ${extra[@]+"${extra[@]}"} \
    ${filters[@]+"${filters[@]}"} || status=$?
}

status=0
reports=()
if [ ${#cases_together[@]} -gt 0 ]; then
  make_plugin "$workspace/together/astrolabe" "${cases_together[@]}"
  run_suite "$workspace/together/astrolabe" "$output"
  reports+=("$output/report.html")
fi
for name in ${cases_apart[@]+"${cases_apart[@]}"}; do
  make_plugin "$workspace/$name/astrolabe" "$name"
  operator_env=()
  while IFS= read -r line; do [ -n "$line" ] && operator_env+=("$line"); done < "evals/$name/operator.env"
  echo
  echo "$name runs on its own, with ${operator_env[*]}."
  run_suite "$workspace/$name/astrolabe" "$output/$name" "${operator_env[@]}"
  reports+=("$output/$name/report.html")
  if [ -f "$output/$name/aggregate-result.json" ]; then
    node scripts/merge-eval-results.mjs "$output/aggregate-result.json" "$output/$name/aggregate-result.json"
  fi
done

echo
for report in "${reports[@]}"; do if [ -f "$report" ]; then echo "Report: $report"; fi; done
exit "$status"
