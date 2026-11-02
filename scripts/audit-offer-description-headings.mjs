import fs from "node:fs";
import { normalizeDescription } from "../src/domain/offers/normalizeDescription.js";
import { parseOfferDescription } from "../src/domain/offers/parseOfferDescription.js";

const rawOffers = JSON.parse(fs.readFileSync(new URL("../_input/imo-current/oferty.json", import.meta.url), "utf8"));

function normalizeHeading(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-–—•]+\s*/, "")
    .replace(/[\s:!?]+$/, "")
    .toLocaleLowerCase("pl-PL");
}

function hasAllCapsLetters(value) {
  const letters = String(value || "").replace(/[^\p{L}]/gu, "");
  return Boolean(letters) && letters === letters.toLocaleUpperCase("pl-PL");
}

function textFromHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const candidates = new Map();
const knownHeadings = new Map();
const structuralAliases = new Set([
  "parter",
  "piętro",
  "spis pomieszczeń",
  "układ pomieszczeń",
  "najważniejsze atuty lokalizacji",
]);
let inspectedLines = 0;

Object.values(rawOffers).forEach((offer) => {
  const description = normalizeDescription(offer.opis);
  const model = parseOfferDescription(description, {
    agent: { name: offer.agent_nazwisko, phone: offer.agent_tel_kom },
  });
  const recognized = new Set(model.sections.map((section) => normalizeHeading(section.title)));
  const sourceLines = description.html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?p\b[^>]*>/gi, "\n")
    .split(/\r?\n/);

  sourceLines.forEach((source, index) => {
    const text = textFromHtml(source);
    const words = text.split(/\s+/).filter(Boolean);
    const decorated = /<\s*(?:b|strong|u)\b/i.test(source);
    const punctuationHeading = /[:?!]$/.test(text);
    const framedBySpace = !textFromHtml(sourceLines[index - 1]) || !textFromHtml(sourceLines[index + 1]);
    const isCandidate = !/^[\-–—+•]/u.test(text)
      && !/\b(zaprasza|kontakt|prezentacj|prowizji)\b/iu.test(text)
      && text.length >= 3
      && text.length <= 82
      && words.length <= 11
      && (hasAllCapsLetters(text) || (punctuationHeading && (decorated || framedBySpace)));
    if (!isCandidate) return;

    inspectedLines += 1;
    const normalized = normalizeHeading(text);
    const headingPrefix = normalizeHeading(text.split(":")[0]);
    if (!normalized) return;
    if (recognized.has(normalized) || recognized.has(headingPrefix) || structuralAliases.has(normalized)) {
      const entry = knownHeadings.get(normalized) || { label: text, offerIds: new Set() };
      entry.offerIds.add(String(offer.id));
      knownHeadings.set(normalized, entry);
      return;
    }
    const entry = candidates.get(normalized) || { label: text, offerIds: new Set() };
    entry.offerIds.add(String(offer.id));
    candidates.set(normalized, entry);
  });
});

console.log(`Offer heading audit: ${Object.keys(rawOffers).length} offers, ${inspectedLines} short heading candidates inspected.`);
console.log(`Recognized heading candidates: ${knownHeadings.size}.`);
console.log(`Unknown heading candidates: ${candidates.size}.`);
[...knownHeadings.values()]
  .sort((left, right) => left.label.localeCompare(right.label, "pl"))
  .forEach(({ label, offerIds }) => console.log(`KNOWN_HEADING offers=${[...offerIds].join(",")}: ${label}`));
[...candidates.values()]
  .sort((left, right) => left.label.localeCompare(right.label, "pl"))
  .forEach(({ label, offerIds }) => console.log(`CANDIDATE_HEADING offers=${[...offerIds].join(",")}: ${label}`));
