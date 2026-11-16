---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README reports a high percentile of latency (p95, p99 or the distribution) for each service, not only a mean or median.
FAIL if latency is summarised by a mean or median alone.
