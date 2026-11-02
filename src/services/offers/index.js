// Vite maps this alias to exactly one adapter from VITE_OFFERS_REPOSITORY
// before scanning imports. VPS builds therefore never resolve or bundle the
// local accepted snapshot.
export {
  getAllOffers,
  getFeaturedOffers,
  getOfferById,
  getOfferBySlug,
} from "@propertycorp-offer-repository";
