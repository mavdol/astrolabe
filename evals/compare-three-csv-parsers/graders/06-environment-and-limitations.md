---
type: llm
focus: { source: file, path: README.md }
---

PASS if the README records the environment of the measurements (at least the Node.js version and the machine or OS) and lists at least one limitation, such as measuring on a laptop rather than the build server.
FAIL if either the environment or any limitation is missing.
