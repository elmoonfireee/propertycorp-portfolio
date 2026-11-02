import assert from "node:assert/strict";
import { normalizeOffer } from "../src/domain/offers/normalizeOffer.js";
import { groupOffersByMapPosition, resolveOfferMapPosition } from "../src/domain/offers/offerMapPosition.js";
import { getOfferPublicLocationPresentation } from "../src/domain/offers/offerPresentation.js";

function makeOffer(latitude, longitude) {
  return { location: { locality: "Test locality", latitude, longitude } };
}

function assertUnavailable(offer, message) {
  assert.equal(resolveOfferMapPosition(offer), null, message);
  const presentation = getOfferPublicLocationPresentation(offer);
  assert.equal(presentation.mode, "unavailable", `${message}: use the unavailable presentation`);
  assert.equal(presentation.latitude, null, `${message}: omit latitude`);
  assert.equal(presentation.longitude, null, `${message}: omit longitude`);
  assert.equal(presentation.externalQuery, null, `${message}: omit the map link query`);
  assert.deepEqual(groupOffersByMapPosition([offer]), [], `${message}: do not create a marker group`);
}

const missingValues = [null, undefined, "", " ", "\t\n"];
for (const missing of missingValues) {
  const label = JSON.stringify(missing) ?? "undefined";
  const pairs = [[missing, 17], [51, missing], [missing, missing]];
  for (const [latitude, longitude] of pairs) {
    assertUnavailable(makeOffer(latitude, longitude), `missing coordinate ${label}`);

    const normalized = normalizeOffer({
      id: "coordinate-fixture",
      n_geo_y: latitude,
      n_geo_x: longitude,
    });
    assertUnavailable(normalized, `missing IMO coordinate ${label}`);
  }
}

assertUnavailable({}, "missing location");
assertUnavailable(undefined, "missing offer");

for (const invalid of [false, true, [], [0], {}, "invalid", NaN, Infinity, -Infinity]) {
  assertUnavailable(makeOffer(invalid, 17), "invalid latitude");
  assertUnavailable(makeOffer(51, invalid), "invalid longitude");
}

for (const [latitude, longitude] of [[90.1, 17], [-90.1, 17], [51, 180.1], [51, -180.1]]) {
  assertUnavailable(makeOffer(latitude, longitude), "out-of-range coordinate");
}

for (const [latitude, longitude] of [[0, 0], ["0", "0"], [" 0 ", "\t0\n"], [0, 17], [51, 0], [-90, -180], [90, 180]]) {
  const expected = { lat: Number(latitude), lng: Number(longitude) };
  const direct = makeOffer(latitude, longitude);
  const normalized = normalizeOffer({ id: "valid-coordinate-fixture", n_geo_y: latitude, n_geo_x: longitude });
  for (const offer of [direct, normalized]) {
    assert.deepEqual(resolveOfferMapPosition(offer), expected, "valid coordinates, including zero, remain map points");
    const presentation = getOfferPublicLocationPresentation(offer);
    assert.equal(presentation.mode, "point");
    assert.deepEqual({ lat: presentation.latitude, lng: presentation.longitude }, expected);
    assert.equal(presentation.externalQuery, `${expected.lat},${expected.lng}`);
  }
}

const origin = makeOffer(0, 0);
const stringOrigin = makeOffer("0", "0");
assert.deepEqual(
  groupOffersByMapPosition([origin, makeOffer(null, null), stringOrigin]),
  [{ position: { lat: 0, lng: 0 }, offers: [origin, stringOrigin] }],
  "only genuine zero coordinates belong to the origin marker group",
);

console.log("Map position validation: missing/invalid coordinates, unavailable fallback and valid zero coordinates passed.");
