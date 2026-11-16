---
type: llm
focus: { source: file, path: README.md }
---

PASS if the recommendation rests on a small number of comparisons stated in the README (for example overall accuracy), not on which model leads the most categories or a single category.
FAIL if the README recommends a model because it wins some categories, or headlines a category win.
