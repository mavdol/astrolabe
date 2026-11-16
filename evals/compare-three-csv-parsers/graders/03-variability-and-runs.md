---
type: llm
focus: { source: file, path: README.md }
---

PASS if, for each parser, the README gives the number of runs and a measure of variability (standard deviation, interval, min and max, or percentiles) next to the time, and does the same for memory.
FAIL if it gives a single number per parser without any spread, or does not say how many runs were made.
