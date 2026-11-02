import { buildOfferPath } from "../../src/domain/offers/offerRoutes.js";
import { normalizeOffer } from "../../src/domain/offers/normalizeOffer.js";
import { parseOfferIntroductionTimestamp } from "../../src/domain/offers/offerSorting.js";

export class OfferValidationError extends Error {
  constructor(errors, summary) {
    super(`Offer validation failed: ${errors.join("; ")}`);
    this.name = "OfferValidationError";
    this.errors = errors;
    this.summary = summary;
  }
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

/**
 * Validates an IMO snapshot through the application's existing normalized
 * offer contract.  Consumers get both the normalized records and concise,
 * machine-readable operational facts; this is deliberately not a new IMO
 * normalization layer.
 */
export function validateOfferSnapshot(rawSnapshot, { availableFilenames = [] } = {}) {
  const errors = [];
  const snapshotIsObject = rawSnapshot && typeof rawSnapshot === "object" && !Array.isArray(rawSnapshot);
  if (!snapshotIsObject) throw new OfferValidationError(["oferty.json must contain an object keyed by offer ID."], { offers: 0 });

  const rawOffers = Object.values(rawSnapshot);
  const offers = [];
  rawOffers.forEach((rawOffer, index) => {
    try {
      offers.push(normalizeOffer(rawOffer, { availableFilenames }));
    } catch (error) {
      errors.push(`Offer at snapshot index ${index}: ${error.message}`);
    }
  });

  const ids = new Set();
  const paths = new Set();
  const coordinateGroups = new Map();
  for (const offer of offers) {
    addError(errors, !ids.has(offer.externalId), `Duplicate IMO id: ${offer.externalId}`);
    ids.add(offer.externalId);

    const path = buildOfferPath(offer);
    addError(errors, !paths.has(path), `Duplicate public URL: ${path}`);
    paths.add(path);

    addError(errors, offer.price.amount != null, `Invalid price for IMO id: ${offer.externalId}`);
    addError(errors, offer.area != null, `Invalid area for IMO id: ${offer.externalId}`);
    addError(errors, Boolean(offer.agent.name), `Missing agent name for IMO id: ${offer.externalId}`);
    addError(errors, /^\d{9}$/.test(String(offer.agent.phone || "").replace(/\D/g, "")), `Invalid agent phone for IMO id: ${offer.externalId}`);
    addError(errors, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(offer.agent.email || "")), `Invalid agent email for IMO id: ${offer.externalId}`);
    addError(errors, offer.location.latitude != null && offer.location.longitude != null, `Invalid coordinates for IMO id: ${offer.externalId}`);
    addError(errors, offer.location.latitude >= -90 && offer.location.latitude <= 90, `Latitude outside range for IMO id: ${offer.externalId}`);
    addError(errors, offer.location.longitude >= -180 && offer.location.longitude <= 180, `Longitude outside range for IMO id: ${offer.externalId}`);
    addError(errors, offer.images.every((image, index) => image.order === index + 1), `Non-sequential image order for IMO id: ${offer.externalId}`);
    addError(errors, offer.imageIssues.missingFilenames.length === 0, `Missing image files for IMO id: ${offer.externalId}: ${offer.imageIssues.missingFilenames.join(", ")}`);

    const coordinateKey = `${offer.location.latitude},${offer.location.longitude}`;
    coordinateGroups.set(coordinateKey, [...(coordinateGroups.get(coordinateKey) || []), offer.externalId]);
  }

  const duplicateCoordinateGroups = [...coordinateGroups.entries()]
    .filter(([, offerIds]) => offerIds.length > 1)
    .map(([coordinates, offerIds]) => ({ coordinates, offerIds }));
  const offersWithInvalidIntroductionDate = offers
    .filter((offer) => parseOfferIntroductionTimestamp(offer.dates.createdAt) == null)
    .map((offer) => ({ id: offer.externalId, datawprowadzenia: offer.dates.createdAt }));
  const summary = {
    offers: offers.length,
    ids: ids.size,
    urls: paths.size,
    images: offers.reduce((total, offer) => total + offer.images.length, 0),
    validCoordinates: offers.length,
    uniqueCoordinatePairs: coordinateGroups.size,
    duplicateCoordinateGroups,
    offersWithoutImages: offers.filter((offer) => offer.images.length === 0).map((offer) => offer.externalId),
    featuredOffers: offers.filter((offer) => offer.flags.featured).length,
    offersWithInvalidIntroductionDate,
  };
  if (errors.length) throw new OfferValidationError(errors, summary);
  return { offers, summary };
}
