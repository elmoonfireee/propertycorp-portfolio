import rawSnapshot from "../../../_input/imo-current/oferty.json" with { type: "json" };
import { filterOffers, sortOffers } from "../../domain/offers/offerFilters.js";
import { normalizeOffer } from "../../domain/offers/normalizeOffer.js";

const offers = Object.freeze(
  Object.values(rawSnapshot)
    .map((rawOffer) => normalizeOffer(rawOffer))
    .sort((left, right) => Number(left.externalId) - Number(right.externalId)),
);

export async function getAllOffers(filters) {
  return sortOffers(filterOffers(offers, filters), filters?.sort);
}

export async function getOfferById(id) {
  return offers.find((offer) => offer.id === String(id)) || null;
}

export async function getOfferBySlug(slug) {
  return offers.find((offer) => offer.slug === slug) || null;
}

export async function getFeaturedOffers() {
  return offers.filter((offer) => offer.flags.featured);
}
