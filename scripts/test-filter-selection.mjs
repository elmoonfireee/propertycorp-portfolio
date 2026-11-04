import assert from "node:assert/strict";
import { createServer } from "vite";
import { getActiveFilterChips } from "../src/domain/offers/offerListing.js";

const facets = { locations: [{ value: "miasto", label: "Miasto" }] };
for (const [selection, expected] of [
  [undefined, []],
  [null, []],
  ["", []],
  ["apartment", [{ key: "type:apartment", label: "Mieszkanie" }]],
  [["apartment", "house"], [{ key: "type:apartment", label: "Mieszkanie" }, { key: "type:house", label: "Dom" }]],
]) {
  assert.deepEqual(getActiveFilterChips({ type: selection }, facets), expected);
}
assert.deepEqual(getActiveFilterChips({ location: "miasto", rooms: "5-plus" }, facets), [
  { key: "location:miasto", label: "Miasto" },
  { key: "rooms:5-plus", label: "5+ pokoi" },
]);

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { toggleFilterValue } = await server.ssrLoadModule("/src/components/offers/OffersFilters.jsx");
  assert.deepEqual(toggleFilterValue(null, "house"), ["house"]);
  assert.deepEqual(toggleFilterValue("house", "house"), []);
  assert.deepEqual(toggleFilterValue("house", "apartment"), ["house", "apartment"]);
  const values = ["house", "apartment"];
  assert.deepEqual(toggleFilterValue(values, "house"), ["apartment"]);
  assert.deepEqual(values, ["house", "apartment"]);
} finally {
  await server.close();
}
console.log("Filter selection: chips and toggle compatibility passed.");
