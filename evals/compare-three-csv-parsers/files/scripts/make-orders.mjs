// Writes data/orders.csv: the same 200,000 orders every time.
import { mkdirSync, writeFileSync } from "node:fs";

let state = 42;
const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(next() * list.length)];
const names = ["Jane Doe", "Martin", "Anh Nguyen", "Okafor", "Ana Silva", "Kowalski", "Omar Haddad", "Tanaka"];
const cities = ["Lyon", "Porto", "Osaka", "Lagos", "Montréal", "Kraków"];
const notes = ["", "", "", 'gift wrap, "fragile"', "leave at door", 'call before, ask for "Sam"'];
const quoteIfNeeded = (field) => (/[",\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field);
const lines = ["id,customer,city,amount,note"];

for (let id = 1; id <= 200000; id++) {
  lines.push([id, pick(names), pick(cities), (5 + next() * 495).toFixed(2), pick(notes)].map(String).map(quoteIfNeeded).join(","));
}

mkdirSync("data", { recursive: true });
writeFileSync("data/orders.csv", lines.join("\n") + "\n");
