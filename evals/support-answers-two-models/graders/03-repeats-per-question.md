---
type: llm
focus: { source: file, path: RESULTS.md }
---

PASS if RESULTS.md says that each question was asked several times per model (more than once) because answers vary, and that results were averaged per question or that the interval accounts for it.
FAIL if each question was asked once, or repeats are pooled as if independent questions.
