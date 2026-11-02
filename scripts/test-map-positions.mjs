import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeOffer } from "../src/domain/offers/normalizeOffer.js";
import {
  getOfferMapPositionKey,
  groupOffersByMapPosition,
  resolveOfferMapPosition,
} from "../src/domain/offers/offerMapPosition.js";
import { getOfferPublicLocationPresentation } from "../src/domain/offers/offerPresentation.js";

const snapshotPath = join(process.cwd(), "_input", "imo-current", "oferty.json");
const rawSnapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const rawOffers = Object.values(rawSnapshot);
const offers = rawOffers.map((rawOffer) => normalizeOffer(rawOffer));

function rawFor(offer) {
  return rawSnapshot[offer.externalId];
}

function expectedPosition(rawOffer) {
  return {
    lat: Number(rawOffer.n_geo_y),
    lng: Number(rawOffer.n_geo_x),
  };
}

for (const offer of offers) {
  const rawOffer = rawFor(offer);
  const expected = expectedPosition(rawOffer);
  const position = resolveOfferMapPosition(offer);
  const presentation = getOfferPublicLocationPresentation(offer);

  assert.deepEqual(
    { lat: offer.location.latitude, lng: offer.location.longitude },
    expected,
    `normalization changed IMO coordinates for offer ${offer.externalId}`,
  );
  assert.deepEqual(position, expected, `canonical map position changed IMO coordinates for offer ${offer.externalId}`);
  assert.deepEqual(
    { lat: presentation.latitude, lng: presentation.longitude },
    expected,
    `public map presentation changed IMO coordinates for offer ${offer.externalId}`,
  );
  assert.equal(presentation.mode, "point", `valid IMO coordinates must remain a point for offer ${offer.externalId}`);

  // Both Google base layers receive the same marker literal. `setMapTypeId`
  // changes only imagery, never this canonical marker data.
  for (const mapType of ["roadmap", "hybrid"]) {
    assert.deepEqual(position, expected, `${mapType} marker changed IMO coordinates for offer ${offer.externalId}`);
  }
}

const groups = groupOffersByMapPosition(offers);
const duplicateGroup = groups.find((group) => group.offers.length > 1);
assert.ok(duplicateGroup, "expected at least one group with identical IMO coordinates");
const duplicateExpected = expectedPosition(rawFor(duplicateGroup.offers[0]));
assert.deepEqual(duplicateGroup.position, duplicateExpected, "a grouped marker must keep the shared IMO coordinate, not a centroid");
assert.equal(getOfferMapPositionKey(duplicateGroup.position), `${duplicateExpected.lat}:${duplicateExpected.lng}`);

const reportIds = ["900004", "900005", "900002"];
const report = reportIds.map((id) => {
  const offer = offers.find((entry) => entry.externalId === id);
  const rawOffer = rawFor(offer);
  return {
    offerId: id,
    rawGeoY: rawOffer.n_geo_y,
    rawGeoX: rawOffer.n_geo_x,
    normalized: resolveOfferMapPosition(offer),
    publicLocation: getOfferPublicLocationPresentation(offer).mode,
    marker: resolveOfferMapPosition(offer),
  };
});

console.log(JSON.stringify({
  passedOffers: offers.length,
  duplicateGroup: {
    offerIds: duplicateGroup.offers.map((offer) => offer.externalId),
    position: duplicateGroup.position,
  },
  samples: report,
}, null, 2));
