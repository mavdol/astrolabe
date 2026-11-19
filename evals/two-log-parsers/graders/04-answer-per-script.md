---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README gives a result for each script and its recommendation takes check-release into account: it keeps logline for check-release, uses logline-fast only where it helps, advises against switching, or weighs how often each script runs.
FAIL if the answer or the recommendation rests on one figure or one verdict for all the scripts together (an average, a total, a pooled median or an overall change), or if the README recommends switching every script without addressing check-release.
