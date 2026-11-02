import { sortOffersByIntroductionDate } from "./offerSorting.js";

/**
 * The local snapshot is the same active/public collection used by the listing.
 * Keep the limit here so homepage selection can never rely on manually-curated
 * IDs or image availability.
 */
export function selectLatestFeaturedOffers(offers, limit) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 0;
  const selectedIds = new Set();
  return sortOffersByIntroductionDate(offers)
    .filter((offer) => {
      const id = String(offer?.externalId ?? offer?.id ?? "");
      if (selectedIds.has(id)) return false;
      selectedIds.add(id);
      return true;
    })
    .slice(0, normalizedLimit);
}
