// logline-fast: the same objects as logline, read without splitting the line or calling Date.parse, and
// with the usual field names reused instead of copied from every line.
// When it loads, it warms its parser up on 40,000 sample lines, so that the first lines of a long log
// are already read at full speed.
const digit = (line, at) => line.charCodeAt(at) - 48;
const twoDigits = (line, at) => digit(line, at) * 10 + digit(line, at + 1);

function daysSinceEpoch(year, month, day) {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;

  return era * 146097 + yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear - 719468;
}

const KNOWN_FIELDS = ["status", "took", "request", "step", "version", "host"];

function fieldNameAt(line, start, end) {
  for (const name of KNOWN_FIELDS) if (name.length === end - start && line.startsWith(name, start)) return name;

  return line.slice(start, end);
}

let lastSecondText = "";
let lastSecondTime = 0;

function timeOf(line) {
  const secondText = line.slice(0, 19);

  if (secondText !== lastSecondText) {
    const year = twoDigits(line, 0) * 100 + twoDigits(line, 2);
    const days = daysSinceEpoch(year, twoDigits(line, 5), twoDigits(line, 8));

    lastSecondTime = days * 86_400_000 + (twoDigits(line, 11) * 3600 + twoDigits(line, 14) * 60 + twoDigits(line, 17)) * 1000;
    lastSecondText = secondText;
  }

  return lastSecondTime + digit(line, 20) * 100 + twoDigits(line, 21);
}

export function parseLine(line) {
  if (line.length < 26 || line[23] !== "Z") {
    const [stamp, level, service, ...pairs] = line.split(" ");

    return { time: Date.parse(stamp), level, service, fields: Object.fromEntries(pairs.map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)])) };
  }

  const afterLevel = line.indexOf(" ", 25);
  let afterService = line.indexOf(" ", afterLevel + 1);
  const fields = {};

  if (afterService === -1) afterService = line.length;

  for (let start = afterService + 1; start < line.length; ) {
    let end = line.indexOf(" ", start);

    if (end === -1) end = line.length;

    const separator = line.indexOf("=", start);

    fields[fieldNameAt(line, start, separator)] = line.slice(separator + 1, end);
    start = end + 1;
  }

  return { time: timeOf(line), level: line.slice(25, afterLevel), service: line.slice(afterLevel + 1, afterService), fields };
}

const sampleLines = Array.from(
  { length: 200 },
  (_, index) => `2020-01-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.${String(index * 7).padStart(3, "0").slice(-3)}Z INFO warmup status=200 took=${index} request=r-000000`,
);

for (let round = 0; round < 200; round++) for (const line of sampleLines) parseLine(line);

lastSecondText = "";
