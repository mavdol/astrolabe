---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README presents swiftpack as faster than packwise on wall time with the size of the gain (about −12%, a better verdict), presents peak memory as equivalent or as a difference too small to matter, and shows the card that the build produced. Stating the measured memory values or the +1.7% difference is fine as long as it is called equivalent or too small to matter.
FAIL if the README treats the memory difference as one that matters (swiftpack better or worse on memory, or a reason to choose or avoid it), states the wall-time gain without its size, or drops the card.
