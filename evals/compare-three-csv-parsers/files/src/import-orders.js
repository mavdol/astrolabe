import { readFileSync } from "node:fs";
import { parse } from "../vendor/csv-simple/index.js";

const [, , path = "data/orders.csv"] = process.argv;
const [header, ...orders] = parse(readFileSync(path, "utf8"));
const amountColumn = header.indexOf("amount");
const revenue = orders.reduce((sum, order) => sum + Number(order[amountColumn]), 0);

console.log(`${orders.length} orders, revenue ${revenue.toFixed(2)}`);
