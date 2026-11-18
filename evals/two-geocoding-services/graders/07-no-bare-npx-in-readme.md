---
type: regex
target: { source: file, path: README.md }
pattern: 'npx (?:-y |--yes )?astrolabe(?![-\w])'
match: not_contains
---
