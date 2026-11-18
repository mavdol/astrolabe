---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README shows the card that the build produced, and anything it says about the results in its own words follows the verdicts: swiftpack faster on wall time with the size of the gain (about −12%, a better verdict), peak memory equivalent or a difference too small to matter. A README that adds no sentence about the results passes when the card is there, since the card states both ("−12%, better", "+1.7%, equivalent"). Stating the measured memory values or the +1.7% difference is fine as long as it is called equivalent or too small to matter.
FAIL if the README treats the memory difference as one that matters (swiftpack better or worse on memory, or a reason to choose or avoid it), says in its own words that swiftpack is faster without the size of the gain, or drops the card.
