// Operational Node scripts intentionally use the accepted local snapshot;
// the Vite-only repository alias belongs to browser builds.
import { getAllOffers } from "../../src/services/offers/localSnapshotRepository.js";
import { getTransactionLabel, getTypeLabel } from "../../src/domain/offers/offerListing.js";
import { getPublicLocation } from "../../src/domain/offers/offerPresentation.js";
import { buildOfferPath } from "../../src/domain/offers/offerRoutes.js";

function text(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function offerIdOf(offer) {
  return text(offer?.externalId || offer?.id);
}

/**
 * Delivery links are server-configured: the report can point at production or
 * a preview deployment without changing the offer route contract.
 */
export function normalizeWeeklyReportSiteUrl(value) {
  const configuredUrl = text(value);
  if (!configuredUrl) throw new Error("weekly_report_site_url_missing");
  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("weekly_report_site_url_invalid");
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("weekly_report_site_url_invalid");
  }
  return url.href.replace(/\/+$/, "");
}

/** Builds an index from the application's normalized offer contract. */
export function createOfferEnrichmentIndex(offers = []) {
  const index = new Map();
  offers.forEach((offer) => {
    const offerId = offerIdOf(offer);
    if (offerId) index.set(offerId, offer);
  });
  return index;
}

export function enrichOfferPerformance(offerPerformance = [], offerIndex = new Map(), { siteUrl } = {}) {
  const siteBaseUrl = normalizeWeeklyReportSiteUrl(siteUrl);
  return offerPerformance.map((performance) => {
    const offerId = text(performance?.offerId) || "";
    const offer = offerIndex.get(offerId);
    if (!offer) {
      return {
        ...performance,
        offerId,
        knownOffer: false,
        title: null,
        location: null,
        transactionType: null,
        offerType: null,
        price: null,
        area: null,
        rooms: null,
        url: null,
      };
    }

    return {
      ...performance,
      offerId,
      knownOffer: true,
      title: text(offer.title),
      location: text(getPublicLocation(offer.location)),
      transactionType: text(getTransactionLabel(offer.transaction)),
      offerType: text(getTypeLabel(offer.type)),
      price: offer.price?.amount ?? null,
      area: offer.area ?? null,
      rooms: offer.rooms ?? null,
      // Keep public links coupled to the production route helper used by the
      // website instead of recreating a slug in the reporting code.
      url: `${siteBaseUrl}${buildOfferPath(offer)}`,
    };
  });
}

/**
 * Adds display-only offer data to a PC-09 report. The raw PC-09 builder stays
 * independent of the offer repository so its diagnostic behaviour is intact.
 */
export function enrichWeeklyAnalyticsReport(report, { offers = [], siteUrl } = {}) {
  return {
    ...report,
    offers: enrichOfferPerformance(report?.offers, createOfferEnrichmentIndex(offers), { siteUrl }),
  };
}

export async function enrichWeeklyAnalyticsReportFromPropertyCorp(report, { loadOffers = getAllOffers, siteUrl } = {}) {
  return enrichWeeklyAnalyticsReport(report, { offers: await loadOffers(), siteUrl });
}
