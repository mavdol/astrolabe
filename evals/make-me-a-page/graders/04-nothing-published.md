---
type: regex
target: files
pattern: '(^|/)(\.github/workflows/|\.gitlab-ci\.yml$|netlify\.toml$|vercel\.json$|wrangler\.(jsonc|toml)$)'
flags: m
match: not_contains
---
