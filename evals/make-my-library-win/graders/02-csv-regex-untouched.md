---
type: regex
target: { source: file, path: vendor/csv-regex/index.js }
pattern: '^\/\/ csv-regex: one regular expression per field, RFC 4180 quoting\.\nconst FIELD = \/\(\?:\^\|,\)\(\?:"\(\(\?:\[\^"\]\|""\)\*\)"\|\(\[\^,\]\*\)\)\/g;\n\nexport function parse\(text\) \{\n  return text\n    \.split\("\\n"\)\n    \.filter\(\(line\) => line !== ""\)\n    \.map\(\(line\) => \[\.\.\.line\.matchAll\(FIELD\)\]\.map\(\(match\) => \(match\[1\] !== undefined \? match\[1\]\.replace\(\/""\/g, ''"''\) : match\[2\]\)\)\);\n\}\n$'
---
