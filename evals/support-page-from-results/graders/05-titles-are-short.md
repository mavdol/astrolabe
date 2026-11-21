---
type: regex
target: { source: file, path: benchmarks/support-models/dist/site/index.html }
pattern: '<h2 id="[^"]+-title"><a href="#[^"]+">[^<]{71,}</a>'
match: not_contains
---
