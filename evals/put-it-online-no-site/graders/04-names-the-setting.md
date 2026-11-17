---
type: llm
focus: last_message
---

PASS if the reply tells the user the step only they can take to publish: in the repository's settings, under Pages, set the source to GitHub Actions (then push or run the workflow).
FAIL if the reply says the page is already online, says it changed the setting itself, or gives no instruction on how Pages gets turned on.
