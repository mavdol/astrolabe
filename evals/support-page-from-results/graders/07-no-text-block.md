---
type: regex
target: { source: file, path: benchmarks/support-models/benchmark.json }
pattern: '"type"\s*:\s*"text"'
match: not_contains
---
