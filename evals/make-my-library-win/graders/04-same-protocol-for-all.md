---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README describes one protocol applied to all three parsers (same file, same number of runs, same measures) and reports every measure for every parser.
FAIL if a measure is shown only where csv-machine wins, if csv-machine got extra tuning or runs, or if the input or measures were chosen so that it wins.
