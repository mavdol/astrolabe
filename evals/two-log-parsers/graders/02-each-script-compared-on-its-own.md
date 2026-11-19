---
type: llm
focus: { source: file, path: benchmarks/logline/benchmark.json }
arm: with-only
---

PASS if the plan compares the run time of each script on its own: `analysis.primary` has a run-time entry on the node of each of check-release, incident-scan and daily-report; or the scripts have no common parent node, so that each one is a primary comparison by default; or each script has a run-time metric of its own.
FAIL if a run-time comparison in `analysis.primary` is on a node that groups several scripts, if there is no `analysis.primary` while the scripts sit under a common node, or if one run-time metric covers all the scripts together without a node per script.
