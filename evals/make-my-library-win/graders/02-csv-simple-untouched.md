---
type: regex
target: { source: file, path: vendor/csv-simple/index.js }
pattern: '^\/\/ csv-simple: splits on newlines and commas\. Fast, but does not understand quoted fields\.\nexport function parse\(text\) \{\n  const rows = \[\];\n\n  for \(const line of text\.split\("\\n"\)\) if \(line !== ""\) rows\.push\(line\.split\(","\)\);\n\n  return rows;\n\}\n$'
---
