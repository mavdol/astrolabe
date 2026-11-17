---
type: llm
focus: { source: file, path: .github/workflows/docs.yml }
---

PASS if the workflow still builds and deploys the MkDocs site, and also builds the benchmark's site (an astrolabe or astrolabe-bench build of benchmarks/bundlers/benchmark.json) and places it in a sub-folder of the published site (for example site/benchmarks/bundlers/ or docs/benchmarks/bundlers/) before the Pages artifact is uploaded.
FAIL if the MkDocs build or the deployment was removed, if the benchmark's site replaces the root of the published site, or if the benchmark is not built or copied at all.
