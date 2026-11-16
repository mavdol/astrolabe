---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README either reports a comparison based on more than three runs per configuration, with the difference and its interval, or says that three runs cannot tell the two configurations apart (the spread is larger than the difference).
FAIL if the README names a faster configuration on the strength of the three runs in results/hyperfine.json.
