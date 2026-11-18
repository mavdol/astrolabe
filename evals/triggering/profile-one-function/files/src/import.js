import { readFileSync } from "node:fs";

export function parseOrders(text) {
  let orders = [];
  for (const line of text.split("\n").slice(1)) {
    if (!line) continue;
    const [id, amount] = line.split(",");
    orders = [...orders, { id, amount: Number(amount) }];
  }
  return orders;
}

if (process.argv[2]) console.log(parseOrders(readFileSync(process.argv[2], "utf8")).length);
