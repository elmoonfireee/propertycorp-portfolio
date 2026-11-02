import assert from "node:assert/strict";
import { calculateFaqExtraRunway } from "../src/components/home/faqRunway.js";

assert.equal(calculateFaqExtraRunway(700, 700), 0);
assert.equal(calculateFaqExtraRunway(700, 900), 200);
assert.equal(calculateFaqExtraRunway(700, 1200), 500);
assert.equal(calculateFaqExtraRunway(900, 700), 0);
assert.equal(calculateFaqExtraRunway(NaN, 900), 0);

console.log("PC-03 FAQ dynamic runway checks passed.");
