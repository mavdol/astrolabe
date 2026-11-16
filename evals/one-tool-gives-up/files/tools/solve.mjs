// Solves one scheduling task with the solver named on the command line.
// Exit code 0: solved, the schedule is printed. Exit code 3: the solver gave up.
import { readFileSync } from "node:fs";

const [, , solver, taskPath] = process.argv;
const task = JSON.parse(readFileSync(taskPath, "utf8"));
const busyWait = (seconds) => {
  const until = Date.now() + seconds * 1000;
  let steps = 0;

  while (Date.now() < until) steps += Math.sqrt(steps + 1);

  return steps;
};

if (solver === "stride") {
  busyWait(0.15 + task.difficulty * 0.6 * (0.9 + Math.random() * 0.2));
  console.log(`stride: schedule for ${task.id} with ${task.shifts} shifts`);
} else if (solver === "quickplan") {
  const givesUp = task.difficulty >= 0.7 && Math.random() < 0.35;

  busyWait(givesUp ? 0.2 : 0.12 + task.difficulty * 0.5 * (0.9 + Math.random() * 0.2));

  if (givesUp) {
    console.error(`quickplan: no schedule found for ${task.id} within the search limit, giving up`);
    process.exit(3);
  }

  console.log(`quickplan: schedule for ${task.id} with ${task.shifts} shifts`);
} else {
  console.error("usage: node tools/solve.mjs stride|quickplan tasks/<task>.json");
  process.exit(2);
}
