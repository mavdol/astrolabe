// Bundles src/ with the bundler named on the command line. Both bundlers are stand-ins with the
// timing profile of the real ones on this project; swiftpack sometimes crashes on a cold cache.
const bundler = process.argv[2];
const seconds = { packwise: 2.4, swiftpack: 2.1 }[bundler];

if (!seconds) {
  console.error("usage: node scripts/build-with.mjs packwise|swiftpack");
  process.exit(2);
}

const until = Date.now() + seconds * 1000 * (0.97 + Math.random() * 0.06);
let work = 0;

while (Date.now() < until) work += Math.sqrt(work + 1);

if (bundler === "swiftpack" && Math.random() < 0.07) {
  console.error("swiftpack: internal error: cache entry corrupted");
  process.exit(1);
}

console.log(`${bundler}: bundle written (${Math.round(work) % 1000} modules)`);
