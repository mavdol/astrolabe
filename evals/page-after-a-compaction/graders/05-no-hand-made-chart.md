---
type: regex
target: files
pattern: '^(?!(\S*/)?dist/)\S*\.(svg|png|html)$'
flags: m
match: not_contains
---
