import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeDescription } from "../src/domain/offers/normalizeDescription.js";
import { parseOfferDescription } from "../src/domain/offers/parseOfferDescription.js";

const css = fs.readFileSync(new URL("../src/styles/offer-detail.css", import.meta.url), "utf8");
const component = fs.readFileSync(new URL("../src/components/offers/RichOfferDescription.jsx", import.meta.url), "utf8");

// These fixtures protect the typography contract: the first prose paragraph
// owns the two-line drop cap, while every following paragraph remains a normal
// full-width block.
const oneLineIntro = parseOfferDescription(normalizeDescription([
  "Krótki opis nieruchomości w dobrej lokalizacji.",
  "Drugi akapit zaczyna się normalnie pod pierwszym.",
]));
assert.equal(oneLineIntro.intro.length, 2);

const twoLineIntro = parseOfferDescription(normalizeDescription([
  "Do wynajęcia funkcjonalny lokal użytkowy w dobrze skomunikowanej części miasta, gotowy do rozpoczęcia działalności.",
  "Drugi akapit opisuje standard lokalu bez opływania dekoracyjnej litery.",
]));
assert.equal(twoLineIntro.intro.length, 2);

const fourLineIntro = parseOfferDescription(normalizeDescription([
  "Do wynajęcia lokal użytkowy o przeznaczeniu biurowo-usługowym, położony w nowoczesnym budynku przy ulicy Legnickiej. Przestrzeń jest klimatyzowana, dobrze doświetlona i przygotowana do elastycznej aranżacji zespołu.",
]));
assert.equal(fourLineIntro.intro.length, 1);

assert.match(component, /dropCap\s*\/?>/u);
assert.match(component, /isDropCapCandidate/u);
assert.match(css, /offer-description-rich__prose--drop-cap\s*>\s*p:first-child\s*\{\s*display:\s*flow-root/u);
assert.match(css, /font-size:\s*2\.45em/u);
assert.match(css, /height:\s*\.99em/u);
assert.match(css, /@supports\s*\(initial-letter:\s*2\)/u);
assert.match(css, /initial-letter:\s*2\s+2/u);
assert.match(css, /offer-description-rich__list--additional li\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/u);
assert.doesNotMatch(css, /offer-description-rich__list--additional li\s*\{\s*grid-template-columns:\s*0\s+minmax/u);

console.log("Offer description typography: one-, two- and four-line intro fixtures plus two-line drop-cap fallback passed.");
