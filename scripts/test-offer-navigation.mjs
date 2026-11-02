import assert from "node:assert/strict";
import { getOfferNavigationResult, getOfferNeighbors, pluralizeOffers } from "../src/domain/offers/offerListing.js";
import { getListingOffers, parseOfferFilters } from "../src/domain/offers/offerFilters.js";
import { buildOfferListingPath, buildOfferPathWithSearch } from "../src/domain/offers/offerRoutes.js";

for (const [count, expected] of [[0, "ofert"], [1, "oferta"], [2, "oferty"], [4, "oferty"], [5, "ofert"], [12, "ofert"], [21, "ofert"], [22, "oferty"], [112, "ofert"]]) {
  assert.equal(pluralizeOffers(count), expected);
}

function offer(id, { transaction = "sale", type = "apartment", rooms = 3, price = 0, updatedAt = "2026-01-01 00:00:00", createdAt = updatedAt } = {}) {
  return {
    id,
    externalId: id,
    title: `Oferta ${id}`,
    transaction,
    type,
    rooms,
    area: 50,
    price: { amount: price },
    dates: { createdAt, updatedAt },
    flags: {},
    attributes: {},
    location: { country: "Polska", region: "dolnośląskie", county: "Wrocław", municipality: "Wrocław", locality: "Wrocław", street: "Testowa" },
  };
}

const allOffers = [
  offer("A", { type: "house", price: 100, updatedAt: "2026-01-10 10:00:00" }),
  offer("B", { price: 100, updatedAt: "2026-01-11 10:00:00" }),
  offer("C", { rooms: 2, price: 200, updatedAt: "2026-01-12 10:00:00" }),
  offer("D", { price: 300, updatedAt: "2026-01-13 10:00:00" }),
  offer("E", { transaction: "rent", price: 400, updatedAt: "2026-01-14 10:00:00" }),
  offer("F", { price: 500, updatedAt: "2026-01-15 10:00:00" }),
  offer("G", { rooms: 4, price: 600, updatedAt: "2026-01-16 10:00:00" }),
  offer("H", { price: 700, updatedAt: "2026-01-17 10:00:00" }),
  offer("I", { type: "commercial", price: 800, updatedAt: "2026-01-18 10:00:00" }),
  offer("J", { price: 900, updatedAt: "2026-01-19 10:00:00" }),
];

const filteredSearch = "?transaction=sale&type=apartment&rooms=3&sort=price-desc&offersVariant=3";
const filteredFilters = parseOfferFilters(new URLSearchParams(filteredSearch));
const filteredResult = getOfferNavigationResult(allOffers, allOffers.find((item) => item.id === "F"), filteredFilters);
assert.deepEqual(filteredResult.orderedOffers.map((item) => item.id), ["J", "H", "F", "D", "B"]);
assert.equal(filteredResult.analyticsContext, "filtered_listing");
assert.equal(filteredResult.usedFallback, false);
assert.deepEqual(getOfferNeighbors(filteredResult.orderedOffers, allOffers.find((item) => item.id === "F")), {
  previous: allOffers.find((item) => item.id === "H"),
  next: allOffers.find((item) => item.id === "D"),
});

const sortingOffers = [
  offer("A", { price: 200, updatedAt: "2026-04-01 00:00:00" }),
  offer("B", { price: 400, updatedAt: "2026-03-01 00:00:00" }),
  offer("C", { price: 100, updatedAt: "2026-02-01 00:00:00" }),
  offer("D", { price: 300, updatedAt: "2026-01-01 00:00:00" }),
];
const newestOrder = getListingOffers(sortingOffers, parseOfferFilters(new URLSearchParams()));
const priceAscendingOrder = getListingOffers(sortingOffers, parseOfferFilters(new URLSearchParams("sort=price-asc")));
assert.deepEqual(newestOrder.map((item) => item.id), ["A", "B", "C", "D"]);
assert.deepEqual(priceAscendingOrder.map((item) => item.id), ["C", "A", "D", "B"]);
assert.deepEqual(getOfferNeighbors(newestOrder, sortingOffers[0]), { previous: null, next: sortingOffers[1] });
assert.deepEqual(getOfferNeighbors(priceAscendingOrder, sortingOffers[0]), { previous: sortingOffers[2], next: sortingOffers[3] });

const refreshedResult = getOfferNavigationResult(allOffers, allOffers.find((item) => item.id === "F"), parseOfferFilters(new URLSearchParams(filteredSearch)));
assert.deepEqual(refreshedResult.orderedOffers.map((item) => item.id), filteredResult.orderedOffers.map((item) => item.id));

const nextOffer = getOfferNeighbors(filteredResult.orderedOffers, allOffers.find((item) => item.id === "F")).next;
const detailHref = buildOfferPathWithSearch(nextOffer, filteredSearch);
assert.match(detailHref, /\?transaction=sale&type=apartment&rooms=3&sort=price-desc&offersVariant=3$/);
assert.equal(buildOfferListingPath(filteredSearch), "/oferty?transaction=sale&type=apartment&rooms=3&sort=price-desc&offersVariant=3");

const fallback = getOfferNavigationResult(allOffers, allOffers.find((item) => item.id === "F"), parseOfferFilters(new URLSearchParams("type=house")));
assert.equal(fallback.usedFallback, true);
assert.deepEqual(fallback.orderedOffers.map((item) => item.id), getListingOffers(allOffers).map((item) => item.id));

console.log("Offer navigation: filtered context, sorting, URL roundtrip, refresh and fallback passed.");
