import assert from "node:assert/strict";
import { normalizeDescription } from "../src/domain/offers/normalizeDescription.js";
import { parseOfferDescription } from "../src/domain/offers/parseOfferDescription.js";

function parse(source) {
  return parseOfferDescription(normalizeDescription(source));
}

function assertValidV1(name, source) {
  const model = parse(source);
  assert.equal(model.diagnostics.errors.length, 0, `${name}: expected 0 ERROR, received ${JSON.stringify(model.diagnostics.errors)}`);
  assert.equal(model.diagnostics.sourceMode, "v1", `${name}: expected V1 parsing.`);
  return model;
}

const completeTemplateFixtures = [
  {
    name: "mieszkanie / apartament",
    source: `Jasne mieszkanie po remoncie, gotowe do zamieszkania.

LOKALIZACJA:

Nieruchomość znajduje się blisko parku i komunikacji miejskiej.

ATUTY LOKALIZACJI:

- Komunikacja: szybki dojazd do centrum
- Zieleń: park w sąsiedztwie

MIESZKANIE:

Lokal znajduje się na szóstym piętrze w budynku z windą.

ATUTY MIESZKANIA:

- Balkon: dodatkowa przestrzeń do odpoczynku
- Winda: wygodny dostęp do mieszkania

STANDARD I WYPOSAŻENIE:

- Po remoncie
- Ogrzewanie miejskie

UKŁAD POMIESZCZEŃ:

- Salon: 20,40 m²
- Kuchnia: 8,10 m²
- Sypialnia: 11,20 m²
- Łazienka: 4,00 m²

SUMA: 43,70 m²

DODATKOWE INFORMACJE:

- Piwnica: 3,00 m²

DLA KOGO:

- Dla rodzin
- Dla inwestorów

DLACZEGO WARTO:

- Gotowe do zamieszkania
- Blisko komunikacji

WAŻNE:

- Kupujący nie płaci prowizji

KONTAKT I PREZENTACJA:

Zapraszamy do kontaktu w celu umówienia prezentacji.`,
  },
  {
    name: "dom",
    source: `DOM:

Wolnostojący dom z ogrodem.

LOKALIZACJA:

Spokojna okolica z dostępem do usług.

ATUTY LOKALIZACJI:

- Komunikacja: wygodny dojazd

DZIAŁKA:

Powierzchnia działki: 960,00 m²

NAJWAŻNIEJSZE CECHY DZIAŁKI:

- Ogród
- Teren ogrodzony

ATUTY NIERUCHOMOŚCI:

- Garaż: w bryle budynku

STANDARD I WYPOSAŻENIE:

- Ogrzewanie gazowe

UKŁAD POMIESZCZEŃ:

Parter:

- Wiatrołap: 4,20 m²
- Salon z kuchnią: 32,50 m²
- Łazienka: 4,10 m²

Piętro:

- Sypialnia 1: 12,30 m²
- Sypialnia 2: 11,80 m²
- Łazienka: 7,20 m²

SUMA: 72,10 m²

DODATKOWE INFORMACJE:

- Taras

WAŻNE:

- Oferta na wyłączność

KONTAKT I PREZENTACJA:

Prezentację można umówić telefonicznie.`,
  },
  {
    name: "lokal komercyjny",
    source: `LOKALIZACJA:

Lokal znajduje się przy ulicy o dużym ruchu pieszym.

LOKAL:

Lokal usługowy na parterze z witryną.

ATUTY LOKALU:

- Witryna: ekspozycja od strony ulicy
- Wejście: bezpośrednio z chodnika

UKŁAD POMIESZCZEŃ:

- Sala główna: 40,00 m²
- Zaplecze: 10,00 m²
- Toaleta: 3,00 m²

SUMA: 53,00 m²

MOŻLIWE PRZEZNACZENIE LOKALU:

- Biuro
- Showroom
- Gabinet medyczny

STANDARD I WYPOSAŻENIE:

- Klimatyzacja

KOSZTY:

Czynsz najmu: 8 000 zł netto
Opłata eksploatacyjna: 11 zł netto/m²
Media: według zużycia

DODATKOWE INFORMACJE:

- Dwa niezależne wejścia

WAŻNE:

- Kaucja: dwumiesięczny czynsz

KONTAKT I PREZENTACJA:

Zapraszamy do kontaktu.`,
  },
  {
    name: "inwestycja",
    source: `INWESTYCJA PIWNA 21:

Kameralna inwestycja w zielonym otoczeniu.

LOKALIZACJA:

Blisko komunikacji miejskiej.

CHARAKTERYSTYKA INWESTYCJI:

- Niska zabudowa
- Monitoring części wspólnych

APARTAMENT:

Apartament z balkonem na drugim piętrze.

ATUTY APARTAMENTU:

- Balkon: dodatkowa przestrzeń

UKŁAD POMIESZCZEŃ:

- Salon z aneksem: 28,61 m²
- Sypialnia: 13,97 m²
- Łazienka: 6,10 m²

SUMA: 48,68 m²

STANDARD I WYPOSAŻENIE:

- Ogrzewanie podłogowe

WAŻNE:

- Dostępne od zaraz

KONTAKT I PREZENTACJA:

Zapraszamy do kontaktu.`,
  },
];

completeTemplateFixtures.forEach(({ name, source }) => assertValidV1(`Szablon: ${name}`, source));

const genericHeadingModel = assertValidV1("Nagłówek własny", `OTOCZENIE BUDYNKU:

- Plac zabaw
- Monitoring
- Rowerownia`);
assert.equal(genericHeadingModel.sections[0].type, "generic");
assert.equal(genericHeadingModel.sections[0].items.length, 3);

const measurementModel = parse(completeTemplateFixtures[0].source);
const apartmentLayout = measurementModel.sections.find((section) => section.rawTitle === "UKŁAD POMIESZCZEŃ");
assert.ok(apartmentLayout, "Szablon mieszkania powinien zawierać UKŁAD POMIESZCZEŃ.");
assert.deepEqual(apartmentLayout.groups[0].rows.map(({ label, value, isSummary }) => ({ label, value, isSummary })), [
  { label: "Salon", value: "20,40 m²", isSummary: false },
  { label: "Kuchnia", value: "8,10 m²", isSummary: false },
  { label: "Sypialnia", value: "11,20 m²", isSummary: false },
  { label: "Łazienka", value: "4,00 m²", isSummary: false },
  { label: "SUMA", value: "43,70 m²", isSummary: true },
]);

const houseModel = parse(completeTemplateFixtures[1].source);
const houseLayout = houseModel.sections.find((section) => section.rawTitle === "UKŁAD POMIESZCZEŃ");
assert.deepEqual(houseLayout.groups.map(({ title }) => title), ["Parter", "Piętro"]);

const rawMessyDescription = `Dla kogo?
dla rodzin i singli
dla inwestorów

Lokal dostępny od zaraz
Kupujący nie płaci prowizji !!

Wiatrołap 3,9m, Korytarz 5,09m, Salon z kuchnią 28,61m

Osoba Demo A
000 000 000`;

const expectedFormattedDescription = `DLA KOGO:

- Dla rodzin i singli
- Dla inwestorów

WAŻNE:

- Lokal dostępny od zaraz
- Kupujący nie płaci prowizji

UKŁAD POMIESZCZEŃ:

- Wiatrołap: 3,90 m²
- Korytarz: 5,09 m²
- Salon z kuchnią: 28,61 m²

KONTAKT I PREZENTACJA:

Osoba Demo A
000 000 000`;

assert.match(rawMessyDescription, /Dla kogo\?/u, "Fixture wejściowa powinna odzwierciedlać nieuporządkowany opis.");
const formattedFixtureModel = assertValidV1("Fixture uporządkowanego opisu", expectedFormattedDescription);
assert.deepEqual(formattedFixtureModel.sections.map(({ rawTitle }) => rawTitle), ["DLA KOGO", "WAŻNE", "UKŁAD POMIESZCZEŃ", "KONTAKT I PREZENTACJA"]);
assert.equal(formattedFixtureModel.sections[0].items.length, 2);

console.log(`Description authoring kit: ${completeTemplateFixtures.length} complete template fixtures and 1 formatting fixture passed with 0 ERROR.`);
console.log("Description authoring kit: generic heading, lists, canonical measurements, SUMA, and house subheadings passed through the production parser.");
