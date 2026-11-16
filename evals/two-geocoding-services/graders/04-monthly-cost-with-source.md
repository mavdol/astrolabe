---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README gives a monthly cost for each service at about 40,000 requests, computed from the saved pricing pages, and cites where each price comes from and its date.
FAIL if a cost is missing, not computed for our volume, or given without its source and date.
