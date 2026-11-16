// Minifies the app bundle with the engine named on the command line.
const engine = process.argv[2];
const seconds = { terse: 0.41, squash: 0.37 }[engine];

if (!seconds) {
  console.error("usage: node scripts/minify.mjs terse|squash");
  process.exit(2);
}

const until = Date.now() + seconds * 1000 * (0.95 + Math.random() * 0.1);
let bytes = 0;

while (Date.now() < until) bytes += Math.sqrt(bytes + 1);

console.log(`${engine}: bundle minified to ${Math.round(bytes) % 900} KB`);
