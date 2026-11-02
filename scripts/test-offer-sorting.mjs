import assert from "node:assert/strict";
import { selectLatestFeaturedOffers } from "../src/domain/offers/featuredOffers.js";
import { sortOffers } from "../src/domain/offers/offerFilters.js";
import { parseOfferIntroductionTimestamp } from "../src/domain/offers/offerSorting.js";

function offer(id, { createdAt, updatedAt = createdAt, price = 100 } = {}) {
  return {
    id,
    externalId: id,
    price: { amount: price },
    area: 50,
    dates: { createdAt, updatedAt },
    flags: { featured: false },
  };
}

const introductionBeforeEdit = [
  offer("A", { createdAt: "2026-08-01 12:00:00", updatedAt: "2026-09-10 12:00:00" }),
  offer("B", { createdAt: "2026-09-05 12:00:00", updatedAt: "2026-09-05 12:00:00" }),
];
assert.deepEqual(sortOffers(introductionBeforeEdit, "newest").map((entry) => entry.id), ["B", "A"], "introduction date must outrank a later edit date");

const tiedDates = [
  offer("B", { createdAt: "2026-09-05 12:00:00" }),
  offer("A", { createdAt: "2026-09-05 12:00:00" }),
];
assert.deepEqual(sortOffers(tiedDates, "newest").map((entry) => entry.id), ["A", "B"], "equal dates use a deterministic ID tie-breaker");

const incompleteDates = [
  offer("missing", { createdAt: null }),
  offer("invalid", { createdAt: "2026-99-40 18:00:00" }),
  offer("valid", { createdAt: "2026-01-02 08:00:00" }),
];
assert.deepEqual(sortOffers(incompleteDates, "newest").map((entry) => entry.id), ["valid", "invalid", "missing"], "missing and invalid introduction dates sort last deterministically");
assert.equal(parseOfferIntroductionTimestamp("2026-02-29 12:00:00"), null, "invalid calendar dates are rejected");

const source = [offer("C", { createdAt: "2026-01-01 00:00:00", price: 300 }), offer("A", { createdAt: "2026-03-01 00:00:00", price: 100 }), offer("B", { createdAt: "2026-02-01 00:00:00", price: 200 })];
const sourceIds = source.map((entry) => entry.id);
assert.deepEqual(sortOffers(source, "newest").map((entry) => entry.id), ["A", "B", "C"]);
assert.deepEqual(source.map((entry) => entry.id), sourceIds, "sorting must not mutate the input list");
assert.deepEqual(sortOffers(source, "price-asc").map((entry) => entry.id), ["A", "B", "C"], "other sort options retain their behavior");

const largerSet = Array.from({ length: 12 }, (_, index) => offer(String(index + 1).padStart(2, "0"), { createdAt: `2026-01-${String(index + 1).padStart(2, "0")} 10:00:00` }));
assert.deepEqual(selectLatestFeaturedOffers(largerSet, 9).map((entry) => entry.id), ["12", "11", "10", "09", "08", "07", "06", "05", "04"], "editorial selects the nine newest offers");
assert.deepEqual(selectLatestFeaturedOffers(largerSet.slice(0, 2), 9).map((entry) => entry.id), ["02", "01"], "editorial shows every offer when fewer than nine exist");
assert.deepEqual(selectLatestFeaturedOffers([...largerSet.slice(0, 9), largerSet[0]], 9).map((entry) => entry.id).length, 9, "editorial never returns duplicate IDs");
assert.equal(selectLatestFeaturedOffers([...largerSet.slice(0, 9), offer("new", { createdAt: "2026-12-01 10:00:00" })], 9)[0].id, "new", "selection updates from the dataset without manual IDs");

console.log("Offer sorting: introduction date, stable fallback and editorial selection checks passed.");
