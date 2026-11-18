---
type: regex
target: { source: file, path: tasting.csv }
pattern: '^[A-Z][a-z]+,(classic|overnight),[12],\d+$'
flags: m
match: "count:20"
---
