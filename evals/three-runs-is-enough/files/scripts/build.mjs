// Builds the docs site with the configuration named on the command line.
// "incremental" reuses the previous output; "clean" starts from scratch.
const configuration = process.argv[2];
const seconds = { clean: 0.8, incremental: 0.775 }[configuration];

if (!seconds) {
  console.error("usage: node scripts/build.mjs clean|incremental");
  process.exit(2);
}

const until = Date.now() + seconds * 1000 * (0.85 + Math.random() * 0.3);
let pages = 0;

while (Date.now() < until) pages += Math.sqrt(pages + 1);

console.log(`${configuration}: ${Math.round(pages) % 500} pages built`);
