/**
 * Canonical Google Maps position for an IMO offer.
 *
 * IMO's coordinate convention is explicit: n_geo_y is latitude and n_geo_x
 * is longitude. `normalizeOffer` preserves those values on `location`; this
 * helper is the only place map renderers may turn them into a Google LatLng
 * literal. Do not geocode, round, offset or derive a centre here.
 */
export function resolveOfferMapPosition(offer) {
  const latitude = offer?.location?.latitude;
  const longitude = offer?.location?.longitude;
  if ([latitude, longitude].some((value) => (
    (typeof value !== "number" && typeof value !== "string")
    || (typeof value === "string" && value.trim() === "")
  ))) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}

/** A grouping key for offers that share the exact same IMO coordinate pair. */
export function getOfferMapPositionKey(position) {
  if (!position) return null;
  return `${position.lat}:${position.lng}`;
}

/**
 * Groups only byte-for-byte equivalent numeric positions. It intentionally
 * does not calculate a centroid: nearby offers remain separate markers.
 */
export function groupOffersByMapPosition(offers) {
  const groups = new Map();

  offers.forEach((offer) => {
    const position = resolveOfferMapPosition(offer);
    const key = getOfferMapPositionKey(position);
    if (!key) return;

    const group = groups.get(key) || { position, offers: [] };
    group.offers.push(offer);
    groups.set(key, group);
  });

  return [...groups.values()];
}
