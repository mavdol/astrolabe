#!/usr/bin/env node
// Structural similarity of an encoded photo to its original: 1 means identical.
import { readFileSync } from "node:fs";

const [original, encoded] = process.argv.slice(2);

if (!original || !encoded) {
  console.error("usage: node tools/ssim.mjs <original photo> <encoded file>");
  process.exit(2);
}

const photo = JSON.parse(readFileSync(original, "utf8"));
const { step } = JSON.parse(readFileSync(encoded, "utf8").split("\n")[0]);

console.log((1 - 0.004 * Math.sqrt(photo.detail) * (step - 1) ** 1.2).toFixed(4));
