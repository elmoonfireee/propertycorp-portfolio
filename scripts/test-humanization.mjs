import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getOfferDescriptionPreview } from "../src/components/offers/offerCardContent.js";
import { sortOffers } from "../src/domain/offers/offerFilters.js";

const fallback = "Poznaj układ, lokalizację i szczegóły tej wyjątkowej nieruchomości.";
assert.equal(getOfferDescriptionPreview(null), fallback);
assert.equal(getOfferDescriptionPreview({ text: "   " }), fallback);
assert.equal(getOfferDescriptionPreview({ text: "Niniejsze ogłoszenie ma charakter informacyjny." }), fallback);
assert.equal(getOfferDescriptionPreview({ text: "Nie stanowi oferty. Jasny salon. Kolejne zdanie." }), "Jasny salon.");

const offers = [
  { id: "2", dates: { createdAt: null } },
  { id: "1", dates: { createdAt: "2026-01-01" } },
];
assert.deepEqual(sortOffers(offers, "newest").map((offer) => offer.id), ["1", "2"]);
assert.deepEqual(offers.map((offer) => offer.id), ["2", "1"]);

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { BrandMark } = await server.ssrLoadModule("/src/components/layout/BrandMark.jsx");
  assert.equal(renderToStaticMarkup(React.createElement(BrandMark, { tone: "light" })), '<span class="brand-mark "><span class="brand-mark__fallback" aria-label="PropertyCorp Nieruchomości">PropertyCorp<small>Nieruchomości</small></span></span>');
  assert.equal(renderToStaticMarkup(React.createElement(BrandMark, { tone: "dark" })), '<span class="brand-mark "><img alt="" class="brand-mark__asset" src="/media/brand/logo-propertycorp-dark.png"/></span>');
} finally {
  await server.close();
}

console.log("Humanization: offer preview, sorting and brand rendering passed.");
