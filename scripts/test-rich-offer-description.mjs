import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { RichOfferDescription } = await server.ssrLoadModule("/src/components/offers/RichOfferDescription.jsx");
  const model = {
    intro: [], closing: [], legal: null,
    sections: [{ type: "keyFacts", title: "Atuty", blocks: [], legacyList: true, items: [{ label: "Parking", content: [{ text: "Miejsce" }] }] }],
  };
  const html = renderToStaticMarkup(React.createElement(RichOfferDescription, { model }));
  assert.equal(html, '<article class="offer-description-rich"><section class="offer-description-rich__section offer-description-rich__section--keyFacts"><header class="offer-description-rich__section-heading"><span aria-hidden="true"></span><h3>Atuty</h3><span aria-hidden="true"></span></header><ul class="offer-description-rich__list offer-description-rich__list--facts"><li><i aria-hidden="true"></i><div><strong>Parking</strong> Miejsce</div></li></ul></section></article>');
} finally {
  await server.close();
}
console.log("Rich offer description: legacy list markup passed.");
