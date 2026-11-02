import { DEFAULT_OFFER_FILTERS, getListingOffers, getOfferLocationFilterValue, hasOfferListingContext } from "./offerFilters.js";

export const TRANSACTION_OPTIONS = Object.freeze([
  { value: "sale", label: "Sprzedaż" },
  { value: "rent", label: "Wynajem" },
]);

export const TYPE_LABELS = Object.freeze({
  apartment: "Mieszkanie",
  house: "Dom",
  commercial: "Lokal",
  plot: "Działka",
  other: "Nieruchomość",
});

export const ROOM_OPTIONS = Object.freeze([
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5-plus", label: "5+" },
]);

export const SORT_OPTIONS = Object.freeze([
  { value: "newest", label: "Najnowsze" },
  { value: "price-asc", label: "Cena: od najniższej" },
  { value: "price-desc", label: "Cena: od najwyższej" },
  { value: "area-asc", label: "Powierzchnia: od najmniejszej" },
  { value: "area-desc", label: "Powierzchnia: od największej" },
]);

export function pluralizeOffers(count) {
  if (count === 1) return "oferta";
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) return "oferty";
  return "ofert";
}

export function getTransactionLabel(value) {
  return TRANSACTION_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function getTypeLabel(value) {
  return TYPE_LABELS[value] || value;
}

export function getOfferNeighbors(orderedOffers, currentOffer) {
  const currentId = String(currentOffer?.externalId || currentOffer?.id || "");
  const currentIndex = orderedOffers.findIndex((offer) => String(offer.externalId || offer.id || "") === currentId);
  return {
    previous: currentIndex > 0 ? orderedOffers[currentIndex - 1] : null,
    next: currentIndex >= 0 && currentIndex < orderedOffers.length - 1 ? orderedOffers[currentIndex + 1] : null,
  };
}

export function getOfferNavigationResult(offers, currentOffer, filters) {
  const contextualOffers = getListingOffers(offers, filters);
  const currentId = String(currentOffer?.externalId || currentOffer?.id || "");
  const belongsToContext = contextualOffers.some((offer) => String(offer.externalId || offer.id || "") === currentId);

  if (belongsToContext) {
    return {
      orderedOffers: contextualOffers,
      analyticsContext: hasOfferListingContext(filters) ? "filtered_listing" : "default_listing",
      usedFallback: false,
    };
  }

  return {
    orderedOffers: getListingOffers(offers, DEFAULT_OFFER_FILTERS),
    analyticsContext: "default_listing",
    usedFallback: true,
  };
}

export function getListingFacets(offers) {
  const types = [...new Set(offers.map((offer) => offer.type).filter(Boolean))]
    .sort((left, right) => getTypeLabel(left).localeCompare(getTypeLabel(right), "pl"))
    .map((value) => ({ value, label: getTypeLabel(value) }));

  const locations = [...new Map(
    offers
      .filter((offer) => offer.location.locality)
      .map((offer) => [getOfferLocationFilterValue(offer), offer.location.locality]),
  ).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "pl"));

  return { types, locations };
}

export function formatNumber(value) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(value);
}

export function getActiveFilterChips(filters, facets) {
  const selectedTypes = Array.isArray(filters.type) ? filters.type : filters.type ? [filters.type] : [];
  const selectedLocations = Array.isArray(filters.location) ? filters.location : filters.location ? [filters.location] : [];
  const selectedRooms = Array.isArray(filters.rooms) ? filters.rooms : filters.rooms ? [filters.rooms] : [];
  const chips = [
    filters.transaction && { key: "transaction", label: getTransactionLabel(filters.transaction) },
    ...selectedTypes.map((type) => ({ key: `type:${type}`, label: getTypeLabel(type) })),
    ...selectedLocations.map((location) => ({
      key: `location:${location}`,
      label: facets.locations.find((facet) => facet.value === location)?.label || location,
    })),
    filters.priceMin != null && { key: "priceMin", label: `od ${formatNumber(filters.priceMin)} zł` },
    filters.priceMax != null && { key: "priceMax", label: `do ${formatNumber(filters.priceMax)} zł` },
    ...selectedRooms.map((rooms) => ({ key: `rooms:${rooms}`, label: rooms === "5-plus" ? "5+ pokoi" : `${rooms} pokoje` })),
    filters.areaMin != null && { key: "areaMin", label: `od ${formatNumber(filters.areaMin)} m²` },
    filters.areaMax != null && { key: "areaMax", label: `do ${formatNumber(filters.areaMax)} m²` },
  ];

  return chips.filter(Boolean);
}
