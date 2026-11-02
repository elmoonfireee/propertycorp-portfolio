import { filterOffers, sortOffers } from "../../domain/offers/offerFilters.js";

export class RuntimeOffersRepositoryError extends Error {
  constructor(message = "Nie można pobrać aktualnych ofert. Odśwież stronę i spróbuj ponownie.") {
    super(message);
    this.name = "RuntimeOffersRepositoryError";
  }
}

function validatePayload(payload) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.offers)) {
    throw new RuntimeOffersRepositoryError();
  }
  return payload.offers;
}

/** Same-origin browser adapter for the VPS runtime snapshot. */
export function createRuntimeOfferRepository({ fetchImpl = globalThis.fetch } = {}) {
  async function loadOffers() {
    if (typeof fetchImpl !== "function") throw new RuntimeOffersRepositoryError();
    let response;
    try {
      response = await fetchImpl("/api/offers", {
        headers: { Accept: "application/json" },
        cache: "no-cache",
      });
    } catch {
      throw new RuntimeOffersRepositoryError();
    }
    if (!response?.ok) throw new RuntimeOffersRepositoryError();
    try {
      return validatePayload(await response.json());
    } catch (error) {
      if (error instanceof RuntimeOffersRepositoryError) throw error;
      throw new RuntimeOffersRepositoryError();
    }
  }

  return {
    async getAllOffers(filters) {
      const offers = await loadOffers();
      return sortOffers(filterOffers(offers, filters), filters?.sort);
    },
    async getOfferById(id) {
      return (await loadOffers()).find((offer) => offer.id === String(id)) || null;
    },
    async getOfferBySlug(slug) {
      return (await loadOffers()).find((offer) => offer.slug === slug) || null;
    },
    async getFeaturedOffers() {
      return (await loadOffers()).filter((offer) => offer.flags.featured);
    },
  };
}

const repository = createRuntimeOfferRepository();
export const getAllOffers = (...argumentsList) => repository.getAllOffers(...argumentsList);
export const getOfferById = (...argumentsList) => repository.getOfferById(...argumentsList);
export const getOfferBySlug = (...argumentsList) => repository.getOfferBySlug(...argumentsList);
export const getFeaturedOffers = (...argumentsList) => repository.getFeaturedOffers(...argumentsList);
