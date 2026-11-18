import { test } from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/totals.js";

test("sums the lines", () => {
  assert.equal(total([{ quantity: 2, price: 5 }, { quantity: 1, price: 3 }]), 13);
});
