import fs from "node:fs";
import { normalizeDescription } from "../src/domain/offers/normalizeDescription.js";
import { parseOfferDescription } from "../src/domain/offers/parseOfferDescription.js";

const rawOffers = JSON.parse(fs.readFileSync(new URL("../_input/imo-current/oferty.json", import.meta.url), "utf8"));
const areaToken = /\b(?:ok\.?|około)?\s*\d+(?:[,.]\d+)?\s*m(?:²|2)?\b/iu;
const narrativeSignal = /[.!?]\s+|\b(który|która|które|ponieważ|zapewnia|idealn|komfort|propozycj|miesięczn)\b/iu;
const suspiciousRows = [];
const unextractedAreas = [];
let layoutSections = 0;

Object.values(rawOffers).forEach((offer) => {
  const model = parseOfferDescription(normalizeDescription(offer.opis), {
    agent: { name: offer.agent_nazwisko, phone: offer.agent_tel_kom },
  });

  model.sections.filter((section) => section.type === "layout").forEach((section) => {
    layoutSections += 1;
    section.groups.flatMap((group) => group.rows).forEach((row) => {
      const text = String(row.label || "");
      if (!row.value && areaToken.test(text)) unextractedAreas.push({ offerId: offer.id, section: section.title, text });
      if (text.length > 140 || (!row.value && text.split(/\s+/).length > 12 && narrativeSignal.test(text))) {
        suspiciousRows.push({ offerId: offer.id, section: section.title, text });
      }
    });
  });
});

console.log(`Offer layout audit: ${Object.keys(rawOffers).length} offers, ${layoutSections} structured layout sections.`);
console.log(`Unextracted area rows: ${unextractedAreas.length}.`);
console.log(`Suspicious layout rows: ${suspiciousRows.length}.`);

[...unextractedAreas, ...suspiciousRows].forEach((entry) => {
  console.log(`SUSPICIOUS_LAYOUT_ROW offer=${entry.offerId} section=${entry.section}: ${entry.text}`);
});

if (unextractedAreas.length || suspiciousRows.length) process.exitCode = 1;
