---
type: llm
focus: { source: file, path: RESULTS.md }
---

PASS if RESULTS.md states that the questions are private and unpublished (so the models are unlikely to have seen them), and names the prompt template or templates tried for each model, saying whether any other was tried. Testing only the production template is fine when RESULTS.md says so and says the other template was not measured.
FAIL if the contamination point is missing, if no template is named, or if RESULTS.md does not say whether any other template was tried.
