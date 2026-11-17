---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README presents swiftpack as faster than packwise on wall time (about −12%, a better verdict), presents the memory difference as too small to matter or equivalent, and shows the card that the build produced.
FAIL if the README says or implies that swiftpack uses more or less memory as a finding, calls swiftpack better on memory, states a wall-time gain without its size, or drops the card.
