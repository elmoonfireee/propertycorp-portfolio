import assert from "node:assert/strict";
import {
  DEFAULT_OFFER_FILTERS,
  findChangedOfferFilter,
  filterOffers,
  getOfferLocationFilterValue,
  parseOfferFilters,
  serializeOfferFilters,
} from "../src/domain/offers/offerFilters.js";

const filters = parseOfferFilters(new URLSearchParams(
  "type=apartment&type=house&location=wroclaw&location=ostrzeszow&rooms=3&rooms=4&offer=17",
));

assert.deepEqual(filters.type, ["apartment", "house"]);
assert.deepEqual(filters.location, ["wroclaw", "ostrzeszow"]);
assert.deepEqual(filters.rooms, ["3", "4"]);
assert.equal("offerId" in filters, false, "offer number must not remain a filter");

const roundTrip = serializeOfferFilters(filters);
assert.deepEqual(roundTrip.getAll("type"), ["apartment", "house"]);
assert.deepEqual(roundTrip.getAll("location"), ["wroclaw", "ostrzeszow"]);
assert.deepEqual(roundTrip.getAll("rooms"), ["3", "4"]);
assert.equal(roundTrip.has("offer"), false);

const reordered = { ...filters, type: [...filters.type].reverse(), location: [...filters.location], rooms: [...filters.rooms], attributes: {} };
assert.equal(findChangedOfferFilter(filters, reordered), undefined);
assert.equal(findChangedOfferFilter(filters, { ...reordered, priceMin: 100000 }), "priceMin");
assert.equal(findChangedOfferFilter(filters, { ...reordered, location: ["wroclaw"] }), "location");
assert.equal(findChangedOfferFilter(filters, { ...reordered, attributes: { parking: "yes" } }), "attributes");

const legacy = parseOfferFilters(new URLSearchParams("type=apartment&location=wroclaw&rooms=3"));
assert.deepEqual(legacy.type, ["apartment"], "single-value links remain supported");
assert.deepEqual(legacy.location, ["wroclaw"]);
assert.deepEqual(legacy.rooms, ["3"]);

const offers = [
  { id: "a", externalId: "a", type: "apartment", rooms: 3, area: 42, price: { amount: 500000 }, location: { locality: "Wrocław" }, attributes: {} },
  { id: "b", externalId: "b", type: "house", rooms: 4, area: 120, price: { amount: 900000 }, location: { locality: "Ostrzeszów" }, attributes: {} },
  { id: "c", externalId: "c", type: "commercial", rooms: 2, area: 80, price: { amount: 700000 }, location: { locality: "Wrocław" }, attributes: {} },
];
const wroclawLocation = getOfferLocationFilterValue(offers[0]);
const ostrzeszowLocation = getOfferLocationFilterValue(offers[1]);

assert.deepEqual(
  filterOffers(offers, { ...DEFAULT_OFFER_FILTERS, type: ["apartment", "house"], location: [wroclawLocation, ostrzeszowLocation], rooms: ["3", "4"] }).map((offer) => offer.id),
  ["a", "b"],
  "multiple selections must be joined with OR within each filter field",
);

console.log("Offer filters: multi-select, URL persistence and legacy query compatibility passed.");
