#!/usr/bin/env bash
# Reviews a pull request that changes the skill: runs the evaluations with the PR's skill and with main's,
# and writes a comparison to paste on the PR.
#
# Only the PR's skills/ folder is used. The tool, the tests, the cases and the graders are main's, so no
# code from the PR runs on your computer: the skill is text that the sandboxed agent reads.
# Every run is a real model call billed to your Claude account or API key; nothing starts before you confirm.
#
# usage: scripts/review-skill-pr.sh <pr-number> [--full] [--runs <n>] [--model <model>] [--parallel <n>] [--max-cost-usd <usd>]
#
#   --full            every case instead of the quick set (before a release)
#   --runs <n>        runs per case and per side (default 3)
#   --model <model>   model of the agent under test (default sonnet)
#   --parallel <n>    runs at once (default 4)
#   --max-cost-usd    cost ceiling of each side (default 15)
set -euo pipefail
cd "$(dirname "$0")/.."

# Measured on Sonnet with the skill: the agent writes a plan and scripts, measures, computes and builds.
approximate_usd_per_run=0.30

pull_request=""
case_set=quick
runs=3
model=sonnet
parallel=4
max_cost=15

while [ $# -gt 0 ]; do
  case "$1" in
    --full) case_set=full ;;
    --runs) runs="$2"; shift ;;
    --model) model="$2"; shift ;;
    --parallel) parallel="$2"; shift ;;
    --max-cost-usd) max_cost="$2"; shift ;;
    [0-9]*) pull_request="$1" ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$pull_request" ] || { echo "usage: scripts/review-skill-pr.sh <pr-number> [--full]" >&2; exit 2; }

git fetch --quiet origin main
main_commit=$(git rev-parse FETCH_HEAD)
git fetch --quiet origin "pull/$pull_request/head"
pr_commit=$(git rev-parse FETCH_HEAD)

changed_files=$(git diff --name-only "$main_commit...$pr_commit")
changed_in_skill=$(echo "$changed_files" | grep -c '^skills/' || true)
changed_in_evals=$(echo "$changed_files" | grep -c '^evals/' || true)
changed_elsewhere=$(echo "$changed_files" | grep -v -e '^skills/' -e '^evals/' -e '^$' | wc -l | tr -d ' ')

if [ "$changed_in_skill" -eq 0 ]; then
  echo "PR #$pull_request does not change skills/: there is nothing to evaluate."
  exit 0
fi

echo "PR #$pull_request changes $changed_in_skill files in skills/:"
echo
git --no-pager diff --stat "$main_commit...$pr_commit" -- skills
echo
echo "Read the changes before any run: git diff $main_commit...$pr_commit -- skills"

if [ "$changed_in_evals" -gt 0 ]; then
  echo
  echo "Warning: it also changes $changed_in_evals files in evals/. Cases and graders change in their own pull request,"
  echo "never with the skill they test. This review uses main's cases and graders."
fi

if [ "$changed_elsewhere" -gt 0 ]; then
  echo
  echo "Note: it also changes $changed_elsewhere files outside skills/ and evals/. They are not used here: the evaluation"
  echo "runs main's tool. If the skill depends on those changes, merge them first or review this PR by hand."
fi

workspace=$(mktemp -d)
main_with_pr_skill="$workspace/main-with-pr-skill"
main_skill="$workspace/main-skill"

remove_workspace() {
  git worktree remove --force "$main_with_pr_skill" 2>/dev/null || true
  rm -rf "$workspace"
}
trap remove_workspace EXIT

git worktree add --quiet --detach "$main_with_pr_skill" "$main_commit"
git -C "$main_with_pr_skill" restore --source "$pr_commit" --worktree -- skills
mkdir -p "$main_skill"
git archive "$main_commit" skills | tar -x -C "$main_skill"

echo
echo "Free checks: main's tests with the PR's skill..."
(cd "$main_with_pr_skill" && pnpm install --silent --frozen-lockfile --prefer-offline && pnpm --silent test) || {
  echo
  echo "The tests fail with the PR's skill: no model run was started." >&2
  exit 1
}
echo "The tests pass."

case_filter=()
[ "$case_set" = quick ] && case_filter=(--quick)

cases=0
for prompt in "$main_with_pr_skill"/evals/*/prompt.md; do
  if [ "$case_set" = quick ] && ! grep -q '^tags: \[quick' "$prompt"; then continue; fi
  cases=$((cases + 1))
done

results="$PWD/evals/results"
main_results="$results/main-skill/$main_commit-$model-$case_set-$runs"
pr_results="$results/pr-$pull_request/$(date +%Y-%m-%dT%H-%M-%S)"

sides=2
main_side="to run"
if [ -f "$main_results/aggregate-result.json" ]; then
  sides=1
  main_side="already run at this commit, reused"
fi

total=$((cases * runs * sides))
estimate=$(awk "BEGIN { printf \"%.0f\", $total * $approximate_usd_per_run }")

echo
echo "About to run: $cases cases ($case_set set) × $runs runs with $model, $parallel at a time."
echo "  The PR's skill: to run. Main's skill: $main_side."
echo "  $total runs, about \$$estimate on Sonnet (more on a larger model). Cost ceiling: $max_cost USD for each side."
read -r -p "Start? [y/N] " answer
[ "$answer" = "y" ] || { echo "Nothing was run."; exit 0; }

run_evals() {
  local skills_folder="$1" output="$2"

  (cd "$main_with_pr_skill" && scripts/run-evals.sh --with-skill --yes \
    --skills "$skills_folder" --output "$output" \
    --runs "$runs" --model "$model" --parallel "$parallel" --max-cost-usd "$max_cost" \
    ${case_filter[@]+"${case_filter[@]}"})
}

if [ "$sides" -eq 2 ]; then
  echo
  echo "Main's skill:"
  run_evals "$main_skill/skills" "$main_results"
fi

echo
echo "The PR's skill:"
run_evals skills "$pr_results"

summary="$pr_results/summary.md"
(cd "$main_with_pr_skill" && pnpm --silent tsx scripts/compare-eval-results.ts \
  "$main_results/aggregate-result.json" "$pr_results/aggregate-result.json") > "$summary"

echo
cat "$summary"
echo
echo "Summary to paste on the PR: $summary"
echo "Reports with every transcript: $pr_results/report.html and $main_results/report.html"
