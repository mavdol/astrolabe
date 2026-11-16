// csv-regex: one regular expression per field, RFC 4180 quoting.
const FIELD = /(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g;

export function parse(text) {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => [...line.matchAll(FIELD)].map((match) => (match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2])));
}
