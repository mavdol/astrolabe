---
type: llm
focus: { source: file, path: RESULTS.md }
---

PASS if RESULTS.md says how answers were graded and, if a judge model was used, that it is judge-wren because judge-corvid is from the same family as model-a (or grading was done against the references without a judge).
FAIL if judge-corvid graded the answers, or the grading method is not stated.
