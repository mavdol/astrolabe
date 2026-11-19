// logline: reads one line of our log format into an object.
//   2026-11-03T14:05:09.123Z ERROR checkout status=502 took=134 request=r-8f3a2c
export function parseLine(line) {
  const [stamp, level, service, ...pairs] = line.split(" ");
  const fields = {};

  for (const pair of pairs) {
    const separator = pair.indexOf("=");

    fields[pair.slice(0, separator)] = pair.slice(separator + 1);
  }

  return { time: Date.parse(stamp), level, service, fields };
}
