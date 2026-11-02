import { buildOfferSlug } from "./buildOfferSlug.js";

export const OFFER_LIST_PATH = "/oferty";
export const LEGACY_OFFER_LIST_PATH = "/oferty-nieruchomosci";

export function buildOfferPath(offer) {
  if (!offer?.externalId) return OFFER_LIST_PATH;
  const slug = offer.slug || buildOfferSlug(offer.title);
  return `${OFFER_LIST_PATH}/${slug}--${encodeURIComponent(String(offer.externalId))}`;
}

function serializeSearch(search) {
  if (search instanceof URLSearchParams) return search.toString();
  return new URLSearchParams(String(search || "").replace(/^\?/, "")).toString();
}

export function buildOfferPathWithSearch(offer, search) {
  const query = serializeSearch(search);
  const path = buildOfferPath(offer);
  return query ? `${path}?${query}` : path;
}

export function buildOfferListingPath(search) {
  const query = serializeSearch(search);
  return query ? `${OFFER_LIST_PATH}?${query}` : OFFER_LIST_PATH;
}

export function parseOfferRouteSegment(segment) {
  const value = String(segment || "");
  const separator = value.lastIndexOf("--");
  if (separator < 1 || separator === value.length - 2) return null;
  try {
    return {
      slug: value.slice(0, separator),
      externalId: decodeURIComponent(value.slice(separator + 2)),
    };
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}
