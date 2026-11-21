---
type: regex
target: { source: file, path: benchmarks/support-models/dist/site/index.html }
pattern: '<span class="reading">(?:[^<\s]+\s+){24,}[^<\s]+'
match: not_contains
---
