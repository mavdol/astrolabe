---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README summary compares csv-machine and csv-regex against csv-simple on wall time and memory with the size of each difference and its uncertainty (an interval, or a verdict such as better, equivalent or inconclusive), and tells the reader where the page is or how to build and open it.
FAIL if it names a winner without the size or the uncertainty of the difference, gives a ranking without relating it to csv-simple, or does not mention the page.
