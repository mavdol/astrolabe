---
type: regex
target: files
pattern: '(^|/)(netlify\.toml|vercel\.json|wrangler\.(jsonc|toml))$'
flags: m
match: not_contains
---
