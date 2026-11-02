import { getPublicLocation } from "../domain/offers/offerPresentation.js";

const AGENT_IDS = Object.freeze({
  "Osoba Demo A": "osoba-demo-a",
  "Osoba Demo B": "osoba-demo-b",
});

export function getAgentAnalyticsId(agent) {
  return AGENT_IDS[agent?.name] || "propertycorp";
}

function optionalNumber(value) {
  if (value == null || (typeof value === "string" && !value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function getOfferAnalyticsParameters(offer) {
  if (!offer) return {};
  return {
    offer_id: String(offer.id),
    offer_type: String(offer.type || "unknown"),
    transaction_type: String(offer.transaction || "unknown"),
    offer_location: getPublicLocation(offer.location) || "Wrocław i okolice",
    price: optionalNumber(offer.price?.amount),
    area: optionalNumber(offer.area),
    rooms: optionalNumber(offer.rooms),
    agent_id: getAgentAnalyticsId(offer.agent),
  };
}
