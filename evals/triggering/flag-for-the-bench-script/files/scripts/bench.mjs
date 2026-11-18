import { performance } from "node:perf_hooks";

const start = performance.now();
for (let index = 0; index < 1000; index++) Math.sqrt(index);
console.log(`done in ${(performance.now() - start).toFixed(1)} ms`);
