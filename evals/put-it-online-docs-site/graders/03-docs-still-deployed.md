---
type: regex
target: { source: file, path: .github/workflows/docs.yml }
pattern: 'mkdocs build[\s\S]*actions/deploy-pages@'
---
