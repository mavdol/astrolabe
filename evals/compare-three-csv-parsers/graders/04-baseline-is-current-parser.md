---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README compares csv-machine and csv-regex against csv-simple, the parser in use today, for example as changes relative to it.
FAIL if it only ranks the three parsers without relating them to the one in use, or uses another parser as the reference.
