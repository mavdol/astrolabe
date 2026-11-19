import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2] ?? "";

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`usage: pnpm set-version <version>, such as 0.2.0 (got "${version}")`);
  process.exit(2);
}

const placesThatNameTheVersion = [
  { file: "package.json", pattern: /("version": ")[^"]+(")/ },
  { file: ".claude-plugin/plugin.json", pattern: /("version": ")[^"]+(")/ },
  { file: "skills/astrolabe-benchmark/SKILL.md", pattern: /(^compatibility: .*version )\S+( or later)/m },
  { file: "skills/astrolabe-benchmark/SKILL.md", pattern: /(This skill is written for astrolabe )\S+( or later\.)/ },
];

const texts = new Map<string, string>();

for (const { file, pattern } of placesThatNameTheVersion) {
  const text = texts.get(file) ?? readFileSync(file, "utf8");

  if (!pattern.test(text)) {
    console.error(`${file}: the version is no longer where this script looks for it (${pattern}). Nothing was written.`);
    process.exit(1);
  }

  texts.set(file, text.replace(pattern, `$1${version}$2`));
}

for (const [file, text] of texts) writeFileSync(file, text);

console.log(`version ${version} in ${[...texts.keys()].join(", ")}`);
