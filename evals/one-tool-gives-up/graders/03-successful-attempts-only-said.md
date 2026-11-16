---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README says that quickplan times leave out the tasks it gave up on (or compares both solvers on the weeks both solved), and warns that this favours quickplan because the hard weeks are the ones it drops.
FAIL if the README compares times without saying whether failed runs are included, or does not mention the bias.
