---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README names no faster configuration on the strength of the three runs: it reports a comparison based on more runs with the difference and its interval, says that three runs cannot tell the two configurations apart, or reports no comparison at all.
FAIL if the README names a faster configuration on the strength of the three runs in results/hyperfine.json.
