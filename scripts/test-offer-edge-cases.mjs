import assert from "node:assert/strict";
import { getOfferAnalyticsParameters } from "../src/analytics/offerTracking.js";
import { normalizeDescription } from "../src/domain/offers/normalizeDescription.js";
import { parseOfferRouteSegment } from "../src/domain/offers/offerRoutes.js";

assert.deepEqual(parseOfferRouteSegment("mieszkanie--%C5%BC"), { slug: "mieszkanie", externalId: "ż" });
assert.equal(parseOfferRouteSegment("mieszkanie--%ZZ"), null);
assert.equal(parseOfferRouteSegment("mieszkanie--%E0%A4"), null);

assert.equal(normalizeDescription("&#65; &#x1F600;").text, "A 😀");
assert.equal(normalizeDescription("&#1114112; &#x110000; &#xD800;").text, "&#1114112; &#x110000; &#xD800;");

const base = { id: "1", price: {}, location: {} };
const missing = getOfferAnalyticsParameters({ ...base, price: { amount: null }, area: " ", rooms: undefined });
assert.equal(missing.price, undefined);
assert.equal(missing.area, undefined);
assert.equal(missing.rooms, undefined);
const values = getOfferAnalyticsParameters({ ...base, price: { amount: 0 }, area: "40.5", rooms: "invalid" });
assert.equal(values.price, 0);
assert.equal(values.area, 40.5);
assert.equal(values.rooms, undefined);

console.log("Offer edge cases: malformed routes and entities, missing analytics values passed.");
