// csv-simple: splits on newlines and commas. Fast, but does not understand quoted fields.
export function parse(text) {
  const rows = [];

  for (const line of text.split("\n")) if (line !== "") rows.push(line.split(","));

  return rows;
}
