// Shared by both encoders: writes an encoded photo whose size follows the quantizer step.
import { readFileSync, writeFileSync } from "node:fs";

export function encode({ encoder, step, bitsPerCoefficient }) {
  const [input, output] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));

  if (!input || !output) {
    console.error(`usage: node encoders/${encoder}.mjs <photo> <output> [--quality=0-100]`);
    process.exit(2);
  }

  const photo = JSON.parse(readFileSync(input, "utf8"));
  const header = JSON.stringify({ encoder, step, source: input });
  const bytes = Math.round(((photo.width * photo.height * photo.detail * 0.25) / step ** 0.9) * bitsPerCoefficient);

  writeFileSync(output, Buffer.concat([Buffer.from(`${header}\n`), Buffer.alloc(Math.max(0, bytes - header.length - 1), 0x5a)]));
}

export function qualityArgument(fallback) {
  const given = process.argv.find((argument) => argument.startsWith("--quality="));
  const quality = given ? Number(given.slice("--quality=".length)) : fallback;

  if (!(quality >= 0 && quality <= 100)) {
    console.error("--quality must be between 0 and 100");
    process.exit(2);
  }

  return quality;
}
