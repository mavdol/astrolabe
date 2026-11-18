import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDate } from "../src/dates.js";

test("adds the payment terms", () => {
  assert.equal(dueDate(new Date("2026-01-01"), 30).toISOString().slice(0, 10), "2026-01-31");
});
