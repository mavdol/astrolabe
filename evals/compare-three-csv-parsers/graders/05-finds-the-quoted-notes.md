---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README says that csv-simple parses some rows of data/orders.csv incorrectly (quoted fields with commas, such as the notes, are split), so correctness was checked on the actual file.
FAIL if correctness is not mentioned, or if all three parsers are said to give the same result.
