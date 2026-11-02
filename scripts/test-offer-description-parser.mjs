import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeDescription } from "../src/domain/offers/normalizeDescription.js";
import { parseOfferDescription } from "../src/domain/offers/parseOfferDescription.js";

function parse(lines, agent) {
  return parseOfferDescription(normalizeDescription(lines), { agent });
}

function sectionTypes(model) {
  return model.sections.map((section) => section.type);
}

const escapedHeading = parse([
  "Wprowadzenie do oferty.",
  "&lt;u&gt;&lt;b&gt;LOKALIZACJA:&lt;/b&gt;&lt;/u&gt;",
  "Bliskość parku i komunikacji.",
]);
assert.deepEqual(sectionTypes(escapedHeading), ["location"]);
assert.equal(escapedHeading.sections[0].title, "Lokalizacja");
assert.equal(escapedHeading.sections[0].blocks[0].text, "Bliskość parku i komunikacji.");

const plainHeading = parse(["Lokalizacja:", "Wygodna część miasta."]);
assert.deepEqual(sectionTypes(plainHeading), ["location"]);

const mixedCaseHeading = parse(["Atuty Mieszkania!", "-Balkon: dodatkowa przestrzeń."]);
assert.deepEqual(sectionTypes(mixedCaseHeading), ["propertyBenefits"]);

const headingWithSameLineContent = parse(["<b>LOKALIZACJA:</b> Bliskość zieleni."]);
assert.equal(headingWithSameLineContent.sections[0].blocks[0].text, "Bliskość zieleni.");

const fragmentedHeading = parse(["<u><b>", "LOKALIZACJA:", "</b></u> Spokojna okolica."]);
assert.deepEqual(sectionTypes(fragmentedHeading), ["location"]);
assert.equal(fragmentedHeading.sections[0].blocks[0].text, "Spokojna okolica.");

const benefits = parse(["Atuty lokalizacji:", "-Komunikacja: tramwaj i autobus."]);
assert.equal(benefits.sections[0].items[0].label, "Komunikacja");
assert.equal(benefits.sections[0].items[0].content[0].text, "tramwaj i autobus.");

const realApartmentBenefits = parse([
  "&lt;u&gt;&lt;b&gt;ATUTY APARTAMENTU:&lt;/b&gt;&lt;/u&gt;",
  "&lt;/u&gt;&lt;b&gt;-Przykładowy charakter budynku,&lt;/b&gt;",
  "- Możliwość urządzenia przestrzeni,",
  "- Przykładowy układ,",
  "&lt;b&gt;- Jasne pomieszczenia,&lt;/b&gt;",
  "&lt;b&gt;- Proste wykończenie przestrzeni,&lt;/b&gt;",
  "&lt;b&gt;- Lokalizacja.&lt;/b&gt;",
]);
const apartmentBenefitsBlock = realApartmentBenefits.sections[0].blocks[0];
assert.equal(realApartmentBenefits.sections[0].blocks.length, 1);
assert.equal(apartmentBenefitsBlock.type, "list");
assert.equal(apartmentBenefitsBlock.items.length, 6);
assert.equal(apartmentBenefitsBlock.items[0].label, null);
assert.equal(apartmentBenefitsBlock.items[0].text, "Przykładowy charakter budynku,");
assert.equal(apartmentBenefitsBlock.items[0].content[0].text, "Przykładowy charakter budynku,");
assert.equal(apartmentBenefitsBlock.items[0].content.some((part) => part.strong || part.underline), false);
assert.deepEqual(apartmentBenefitsBlock.items.map((item) => item.content.map((part) => part.text).join(" ")), [
  "Przykładowy charakter budynku,",
  "Możliwość urządzenia przestrzeni,",
  "Przykładowy układ,",
  "Jasne pomieszczenia,",
  "Proste wykończenie przestrzeni,",
  "Lokalizacja.",
]);

const realLocationBenefits = parse([
  "&lt;u&gt;&lt;b&gt;ATUTY LOKALIZACJI:&lt;/b&gt;&lt;/u&gt;",
  "- Komunikacja: tramwaj i autobus",
  "- Zieleń: park w sąsiedztwie",
  "- Usługi: sklepy i restauracje",
  "- Edukacja: szkoły oraz przedszkola",
  "- Rekreacja: trasy spacerowe",
  "&lt;u&gt;&lt;b&gt;Centrum miasta&lt;/b&gt; - bliskość usług i terenów zielonych",
]);
const locationBenefitsBlock = realLocationBenefits.sections[0].blocks[0];
assert.equal(realLocationBenefits.sections[0].blocks.length, 1);
assert.equal(locationBenefitsBlock.type, "list");
assert.equal(locationBenefitsBlock.items.length, 6);
assert.equal(locationBenefitsBlock.items.at(-1).label, "Centrum miasta");
assert.equal(locationBenefitsBlock.items.at(-1).content[0].text, "bliskość usług i terenów zielonych");
assert.equal(locationBenefitsBlock.items.at(-1).content.some((part) => part.underline), false);
assert.deepEqual(locationBenefitsBlock.items.map((item) => item.label || item.content[0].text), [
  "Komunikacja", "Zieleń", "Usługi", "Edukacja", "Rekreacja", "Centrum miasta",
]);

[":", "-", "–", "—"].forEach((separator) => {
  const model = parse(["ATUTY LOKALIZACJI:", "", `&lt;u&gt;&lt;b&gt;Centrum miasta&lt;/b&gt; ${separator} bliskość wszystkiego`]);
  const item = model.sections[0].blocks[0].items[0];
  assert.equal(model.sections[0].blocks[0].type, "list");
  assert.equal(item.label, "Centrum miasta");
  assert.equal(item.content[0].text, "bliskość wszystkiego");
});

const listSectionProse = parse([
  "ATUTY APARTAMENTU:",
  "",
  "- Duży balkon",
  "",
  "Apartament znajduje się w spokojnej części miasta. Zapewnia wygodę codziennego życia i łatwy dostęp do usług.",
]);
assert.deepEqual(listSectionProse.sections[0].blocks.map((block) => block.type), ["list", "paragraph"]);

const listProseListOrder = parse([
  "ATUTY APARTAMENTU:",
  "",
  "- Pierwszy atut",
  "",
  "To jest zwykły akapit narracyjny, który nie ma markera ani historycznej dekoracji.",
  "",
  "- Drugi atut",
]);
assert.deepEqual(listProseListOrder.sections[0].blocks.map((block) => block.type), ["list", "paragraph", "list"]);
assert.equal(listProseListOrder.sections[0].blocks[1].text, "To jest zwykły akapit narracyjny, który nie ma markera ani historycznej dekoracji.");

const layout = parse(["Spis pomieszczeń:", "Parter", "-Salon: 15,79 m2", "-Kuchnia: 6,96 m2", "Piętro", "-Sypialnia: 12,5 m2"]);
assert.equal(layout.sections[0].groups.length, 2);
assert.deepEqual(layout.sections[0].groups[0].rows[0], { label: "Salon", value: "15,79 m²", note: null, isSummary: false });
assert.equal(layout.sections[0].groups[1].title, "Piętro");

const layoutFormats = parse([
  "Spis pomieszczeń:",
  "Salon: 15,79m",
  "-Wiatrołap 3,9m",
  "Salon z aneksem kuchennym - 20,40 m",
  "Balkon: ok. 6 m²",
  "-Wiatrołap: <b>9,81m,</b>",
  "Strefa wejściowa 30,8 m2",
  "Dwa gabinety 14,4 m2 i 14,9m2",
  "SUMA: 67,72m",
  "-Miejsce parkingowe na osiedlu zamkniętym",
  "-Komórka lokatorska 3,45m.",
  "Piwnica 6,67m (zakup obligatoryjny 11.000 zł)",
]);
assert.deepEqual(layoutFormats.sections[0].groups[0].rows.map(({ label, value, isSummary }) => ({ label, value, isSummary })), [
  { label: "Salon", value: "15,79 m²", isSummary: false },
  { label: "Wiatrołap", value: "3,9 m²", isSummary: false },
  { label: "Salon z aneksem kuchennym", value: "20,40 m²", isSummary: false },
  { label: "Balkon", value: "ok. 6 m²", isSummary: false },
  { label: "Wiatrołap", value: "9,81 m²", isSummary: false },
  { label: "Strefa wejściowa", value: "30,8 m²", isSummary: false },
  { label: "Dwa gabinety", value: "14,4 m² i 14,9 m²", isSummary: false },
  { label: "SUMA", value: "67,72 m²", isSummary: true },
  { label: "Miejsce parkingowe na osiedlu zamkniętym", value: null, isSummary: false },
  { label: "Komórka lokatorska", value: "3,45 m²", isSummary: false },
  { label: "Piwnica", value: "6,67 m²", isSummary: false },
]);
assert.equal(layoutFormats.sections[0].groups[0].rows.at(-1).note, "zakup obligatoryjny 11.000 zł");

const layoutBoundary = parse([
  "Spis pomieszczeń:",
  "Salon z aneksem kuchennym - 20,40 m²,",
  "Sypialnia - 16,13 m²,",
  "Przedpokój - 8,59 m²,",
  "Łazienka - 4,82 m².",
  "",
  "Suma: 49,94 m²",
  "",
  "Balkon: ok. 6 m²",
  "",
  "Do mieszkania przynależy komórka lokatorska (2,72 m²) położona w piwnicy.",
  "",
  "Budynek ma przykładowe ogrzewanie wspólne oraz fikcyjną opłatę za utrzymanie wynoszącą 400 zł.",
  "",
  "To fikcyjny lokal z przykładowym widokiem na park i dobrym dostępem do usług.",
  "",
  "Serdecznie zapraszam na prezentację!",
  "Osoba Demo A",
  "000-000-000",
], { name: "Osoba Demo A", phone: "000000000" });
const boundaryLayout = layoutBoundary.sections[0];
assert.deepEqual(boundaryLayout.groups[0].rows.map(({ label, value }) => ({ label, value })), [
  { label: "Salon z aneksem kuchennym", value: "20,40 m²" },
  { label: "Sypialnia", value: "16,13 m²" },
  { label: "Przedpokój", value: "8,59 m²" },
  { label: "Łazienka", value: "4,82 m²" },
  { label: "Suma", value: "49,94 m²" },
  { label: "Balkon", value: "ok. 6 m²" },
  { label: "Komórka lokatorska", value: "2,72 m²" },
]);
assert.equal(boundaryLayout.groups[0].rows.at(-1).note, "położona w piwnicy");
assert.deepEqual(boundaryLayout.tailBlocks.map((block) => block.text), [
  "Budynek ma przykładowe ogrzewanie wspólne oraz fikcyjną opłatę za utrzymanie wynoszącą 400 zł.",
  "To fikcyjny lokal z przykładowym widokiem na park i dobrym dostępem do usług.",
]);
assert.deepEqual(layoutBoundary.closing.map((block) => block.text), ["Serdecznie zapraszam na prezentację!"]);

const layoutWithoutMeasurements = parse([
  "Układ pomieszczeń:",
  "3 osobne pokoje",
  "Oddzielna kuchnia z oknem",
  "Łazienka i toaleta osobno",
  "Duży korytarz",
]);
assert.deepEqual(layoutWithoutMeasurements.sections[0].groups[0].rows.map(({ label, value }) => ({ label, value })), [
  { label: "3 osobne pokoje", value: null },
  { label: "Oddzielna kuchnia z oknem", value: null },
  { label: "Łazienka i toaleta osobno", value: null },
  { label: "Duży korytarz", value: null },
]);

const mixedLayout = parse([
  "Układ pomieszczeń:",
  "Salon: 20,40 m²",
  "Oddzielna kuchnia z oknem",
  "Łazienka: 5,20 m²",
  "Duży korytarz",
]);
assert.deepEqual(mixedLayout.sections[0].groups[0].rows.map(({ label, value }) => ({ label, value })), [
  { label: "Salon", value: "20,40 m²" },
  { label: "Oddzielna kuchnia z oknem", value: null },
  { label: "Łazienka", value: "5,20 m²" },
  { label: "Duży korytarz", value: null },
]);

const layoutWithFollowingProse = parse([
  "Układ pomieszczeń:",
  "3 osobne pokoje",
  "Oddzielna kuchnia",
  "Łazienka i toaleta osobno",
  "",
  "Mieszkanie ma fikcyjny układ pomieszczeń i przykładowe połączenie różnych przestrzeni.",
]);
assert.equal(layoutWithFollowingProse.sections[0].groups[0].rows.length, 3);
assert.deepEqual(layoutWithFollowingProse.sections[0].tailBlocks.map((block) => block.text), [
  "Mieszkanie ma fikcyjny układ pomieszczeń i przykładowe połączenie różnych przestrzeni.",
]);

const structuredSections = parse([
  "Układ pomieszczeń:",
  "3 osobne pokoje (idealny rozkład dla rodziny lub pod wynajem)",
  "Oddzielna kuchnia z oknem",
  "Łazienka i toaleta osobno",
  "Duży korytarz dający wiele możliwości aranżacyjnych",
  "Mieszkanie ma fikcyjny układ pomieszczeń i przykładowe połączenie różnych przestrzeni.",
  "DODATKOWE INFORMACJE:",
  "Ogrzewanie miejskie",
  "Czynsz ok. 1000 zł (w tym zaliczki na media)",
  "Do mieszkania przynależy piwnica",
  "Miejsca parkingowe dostępne przed budynkiem",
  "Dlaczego warto?",
  "Gotowe do zamieszkania lub wynajmu",
  "Świetny rozkład oraz metraż",
  "Przykładowy widok",
  "Bardzo dobra lokalizacja – zarówno do życia, jak i pod inwestycję",
  "Serdecznie zapraszamy na prezentację demonstracyjną.",
]);
assert.deepEqual(sectionTypes(structuredSections), ["layout", "additionalInfo", "audience"]);
assert.equal(structuredSections.sections[0].groups[0].rows.length, 4);
assert.equal(structuredSections.sections[1].items.length, 4);
assert.equal(structuredSections.sections[2].items.length, 4);
assert.equal(structuredSections.closing.length, 1);

const fallback = parse(["Krótki opis bez nagłówków.", "Drugi akapit."]);
assert.equal(fallback.sections.length, 0);
assert.equal(fallback.intro.length, 2);

const legalAndTechnical = parse([
  "Opis oferty.",
  "Treść niniejszego ogłoszenia nie stanowi oferty handlowej.",
  "Opis oferty zawarty na stronie służy wyłącznie jako przykład demonstracyjny i nie stanowi oferty handlowej.",
  "Oferta wysłana z programu IMO dla biur nieruchomości",
]);
assert.match(legalAndTechnical.legal.text, /^Opis oferty zawarty/i);
assert.equal(legalAndTechnical.intro.some((block) => /IMO/i.test(block.text)), false);

const signature = parse(["Serdecznie zapraszam na prezentację.", "Osoba Demo B", "000-000-000", "Property Corp"], { name: "Osoba Demo B", phone: "000000000" });
assert.equal(signature.closing.length, 1);
assert.equal(signature.closing[0].text, "Serdecznie zapraszam na prezentację.");

const rawOffers = JSON.parse(fs.readFileSync(new URL("../_input/imo-current/oferty.json", import.meta.url), "utf8"));
function parseRawOffer(id) {
  const offer = rawOffers[id];
  return parse(offer.opis, { name: offer.agent_nazwisko, phone: offer.agent_tel_kom });
}

const offer17 = parseRawOffer("900004");
assert.deepEqual(sectionTypes(offer17), ["location", "locationBenefits", "property", "propertyBenefits", "layout"]);
assert.equal(offer17.sections[1].items.length, 5);
assert.equal(offer17.closing.length, 1);

const investment = parseRawOffer("900005");
assert.deepEqual(sectionTypes(investment).slice(0, 3), ["location", "locationBenefits", "investment"]);

const investmentWithBenefits = parseRawOffer("900003");
assert.equal(sectionTypes(investmentWithBenefits).includes("investment"), true);
assert.equal(sectionTypes(investmentWithBenefits).includes("investmentBenefits"), true);

const house = parseRawOffer("900006");
assert.deepEqual(sectionTypes(house).slice(0, 8), ["location", "locationBenefits", "plot", "plotBenefits", "property", "propertyBenefits", "layout", "standard"]);
assert.equal(house.sections.find((section) => section.type === "layout").groups.length, 2);

const commercial = parseRawOffer("900001");
assert.deepEqual(sectionTypes(commercial), ["layout", "propertyBenefits", "businessUses", "costs"]);

const offer33 = parseRawOffer("900008");
const compactAreaLayout = offer33.sections.find((section) => section.type === "layout");
assert.deepEqual(compactAreaLayout.groups[0].rows.slice(0, 3).map(({ label, value }) => ({ label, value })), [
  { label: "Korytarz", value: "4,0 m²" },
  { label: "Salon z kuchnią", value: "22,0 m²" },
  { label: "Łazienka", value: "5,0 m²" },
]);

const offer31 = parseRawOffer("900007");
const noSeparatorLayout = offer31.sections.find((section) => section.type === "layout");
assert.deepEqual(noSeparatorLayout.groups[0].rows.slice(0, 6).map(({ label, value }) => ({ label, value })), [
  { label: "Wiatrołap", value: "4,0 m²" },
  { label: "Korytarz", value: "6,0 m²" },
  { label: "Salon z kuchnią", value: "24,0 m²" },
  { label: "Łazienka", value: "5,0 m²" },
  { label: "Sypialnia", value: "12,0 m²" },
  { label: "Sypialnia główna z garderobą", value: "15,0 m²" },
]);
assert.deepEqual(noSeparatorLayout.groups[0].rows.slice(-3).map(({ label, value }) => ({ label, value })), [
  { label: "Powierzchnia mieszkania", value: "66,0 m²" },
  { label: "Miejsce parkingowe na osiedlu zamkniętym", value: null },
  { label: "Komórka lokatorska", value: "4,0 m²" },
]);

const spec = fs.readFileSync(new URL("../docs/PROPERTYCORP_DESCRIPTION_FORMAT_V1.md", import.meta.url), "utf8");
const examplesSection = spec.slice(spec.indexOf("## 15. Examples"), spec.indexOf("## 16. Ambiguity resolution"));
const v1Examples = [...examplesSection.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1]);
assert.equal(v1Examples.length, 8, "The V1 documentation must expose all eight parser fixtures.");
v1Examples.forEach((fixture, index) => {
  const model = parse(fixture);
  assert.equal(model.diagnostics.errors.length, 0, `V1 documentation fixture ${index + 1} must have 0 ERROR.`);
  assert.equal(model.diagnostics.sourceMode, "v1", `V1 documentation fixture ${index + 1} must use V1 parsing.`);
  assert.ok(model.sections.length || model.intro.length, `V1 documentation fixture ${index + 1} must retain visible content.`);
});

const genericHeading = parse([
  "OTOCZENIE BUDYNKU:",
  "",
  "- Plac zabaw",
  "- Monitoring",
  "- Rowerownia",
]);
assert.equal(genericHeading.sections[0].type, "generic");
assert.equal(genericHeading.sections[0].semanticType, "unknown");
assert.equal(genericHeading.sections[0].title, "Otoczenie budynku");
assert.equal(genericHeading.sections[0].items.length, 3);
assert.deepEqual(genericHeading.diagnostics.infos.map((entry) => entry.code), ["UNKNOWN_SEMANTIC_SECTION"]);

const audienceBoundaryV1 = parse([
  "DLA KOGO:",
  "",
  "- Dla rodzin",
  "- Dla inwestorów",
  "- Dla singli",
  "",
  "WAŻNE:",
  "",
  "- Kupujący nie płaci prowizji",
]);
assert.deepEqual(audienceBoundaryV1.sections.map(({ type, items }) => ({ type, count: items?.length })), [
  { type: "audience", count: 3 },
  { type: "important", count: 1 },
]);

const roomV1 = parse([
  "UKŁAD POMIESZCZEŃ:",
  "",
  "- Salon: 28,61 m²",
  "- Sypialnia: 13,97 m²",
  "- Balkon: ok. 6,00 m²",
  "",
  "SUMA: 48,58 m²",
]);
assert.deepEqual(roomV1.sections[0].groups[0].rows.map(({ label, value, isSummary }) => ({ label, value, isSummary })), [
  { label: "Salon", value: "28,61 m²", isSummary: false },
  { label: "Sypialnia", value: "13,97 m²", isSummary: false },
  { label: "Balkon", value: "ok. 6,00 m²", isSummary: false },
  { label: "SUMA", value: "48,58 m²", isSummary: true },
]);

const layoutMeasurementNotes = parse([
  "UKŁAD POMIESZCZEŃ:",
  "",
  "- Gabinet 1: 14,40 m²",
  "- Gabinet 2: 14,90 m² | Jako prywatne biuro lub pokój konsultacyjny",
  "- Pokój: ok. 17,80 m² | Dodatkowy opis",
]);
assert.deepEqual(layoutMeasurementNotes.sections[0].groups[0].rows, [
  { label: "Gabinet 1", value: "14,40 m²", note: null, isSummary: false },
  { label: "Gabinet 2", value: "14,90 m²", note: "Jako prywatne biuro lub pokój konsultacyjny", isSummary: false },
  { label: "Pokój", value: "ok. 17,80 m²", note: "Dodatkowy opis", isSummary: false },
]);
assert.equal(layoutMeasurementNotes.sections[0].blocks[0].items[1].measurement, "14,90 m²");
assert.equal(layoutMeasurementNotes.sections[0].blocks[0].items[1].note, "Jako prywatne biuro lub pokój konsultacyjny");
assert.equal(layoutMeasurementNotes.diagnostics.warnings.some((entry) => entry.code === "NON_CANONICAL_MEASUREMENT"), false);

const literalPipeV1 = parse([
  "ATUTY LOKALIZACJI:",
  "",
  "- Komunikacja: tramwaj | autobus",
]);
assert.deepEqual(literalPipeV1.sections[0].items[0], {
  type: "listItem", text: "Komunikacja: tramwaj | autobus", label: "Komunikacja",
  content: [{ text: "tramwaj | autobus", strong: false, emphasis: false }], measurement: null, note: null, approximate: false,
  inline: [{ text: "- Komunikacja: tramwaj | autobus", strong: false, emphasis: false, underline: false }],
});

const invalidMeasurementNote = parse(["UKŁAD POMIESZCZEŃ:", "", "- Pokój: 14,4 m² | opis", "- Schowek: 14,40 m² |"]);
assert.ok(invalidMeasurementNote.diagnostics.warnings.some((entry) => entry.code === "NON_CANONICAL_MEASUREMENT"));
assert.ok(invalidMeasurementNote.diagnostics.warnings.some((entry) => entry.code === "EMPTY_MEASUREMENT_NOTE"));
assert.equal(invalidMeasurementNote.sections[0].blocks[0].items[0].measurement, null);
assert.equal(invalidMeasurementNote.sections[0].blocks[0].items[1].measurement, null);

const plainTextMeasurementNote = parse(["UKŁAD POMIESZCZEŃ:", "", "- Gabinet: 14,40 m² | <b>Bezpieczny opis</b>"]);
assert.equal(plainTextMeasurementNote.sections[0].groups[0].rows[0].note, "Bezpieczny opis");
assert.doesNotMatch(plainTextMeasurementNote.sections[0].groups[0].rows[0].note, /<[^>]+>/u);

const realImoTransport = parse([
  "UKŁAD POMIESZCZEŃ:",
  "",
  "- Strefa wejściowa/recepcyjna: 30,80 m",
  "- Strefa sprzedażowa/prezentacyjna: 169,50 m | Możliwość dowolnej aranżacji, np. jako przestrzeń ekspozycyjna lub handlowa",
  "- Strefa open space: 63,70 m | Sprawdzi się jako miejsce na pracę biurową",
  "- Gabinet 1: 14,40 m | Jako prywatne biuro lub pokój konsultacyjny",
  "- Gabinet 2: 14,90 m | Jako prywatne biuro lub pokój konsultacyjny",
  "- Sala konferencyjna: 21,50 m | Na spotkania biznesowe i prezentacje",
  "- Kuchnia: 33,20 m | Przestronna, w pełni wyposażona",
  "- Toaleta 1: 6,10 m | Komfortowa i nowoczesna",
  "- Toaleta 2: 10,00 m | Komfortowa i nowoczesna",
  "- Pomieszczenie gospodarcze/magazynowe: 18,10 m",
  "- Pomieszczenie gospodarcze/magazynowe: 8,20 m",
  "- Serwerownia: 2,90 m",
  "- Schowek: 1,30 m",
  "- Komunikacja: 7,90 m",
  "",
  "MOŻLIWE PRZEZNACZENIE:",
  "",
  "- Nowoczesne biuro: dla firm...",
]);
const realTransportRows = realImoTransport.sections[0].groups[0].rows;
assert.equal(realImoTransport.diagnostics.sourceMode, "v1");
assert.equal(realTransportRows.length, 14);
assert.ok(realTransportRows.every((row) => row.value?.endsWith("m²")));
assert.deepEqual(realTransportRows[1], {
  label: "Strefa sprzedażowa/prezentacyjna", value: "169,50 m²",
  note: "Możliwość dowolnej aranżacji, np. jako przestrzeń ekspozycyjna lub handlowa", isSummary: false,
});
assert.deepEqual(realTransportRows[3], {
  label: "Gabinet 1", value: "14,40 m²", note: "Jako prywatne biuro lub pokój konsultacyjny", isSummary: false,
});
assert.ok(realTransportRows.every((row) => !row.label.includes("|") && !row.value?.includes("|")));
assert.equal(realImoTransport.diagnostics.warnings.some((entry) => entry.code === "NON_CANONICAL_MEASUREMENT"), false);
assert.equal(realImoTransport.sections[1].type, "businessUses");
assert.equal(realImoTransport.sections[1].semanticType, "businessUses");
assert.equal(realImoTransport.sections[1].title, "Możliwe przeznaczenie");
assert.equal(realImoTransport.diagnostics.unknownSemanticSections.includes("Możliwe przeznaczenie"), false);

[
  "MOŻLIWE PRZEZNACZENIE:",
  "MOŻLIWE PRZEZNACZENIE LOKALU:",
  "PRZYKŁADOWE PRZEZNACZENIE:",
  "PRZYKŁADOWE PRZEZNACZENIE LOKALU:",
].forEach((heading) => {
  const model = parse([heading, "", "- Nowoczesne biuro"]);
  assert.equal(model.sections[0].type, "businessUses");
  assert.equal(model.sections[0].semanticType, "businessUses");
  assert.equal(model.diagnostics.unknownSemanticSections.length, 0);
});

const transportMeasurementVariants = parse(["UKŁAD POMIESZCZEŃ:", "", "- Serwerownia: 2,90 m2", "- Pokój: ok. 17,80 m"]);
assert.deepEqual(transportMeasurementVariants.sections[0].groups[0].rows.map(({ label, value, note }) => ({ label, value, note })), [
  { label: "Serwerownia", value: "2,90 m²", note: null },
  { label: "Pokój", value: "ok. 17,80 m²", note: null },
]);
const malformedTransportMeasurements = parse(["UKŁAD POMIESZCZEŃ:", "", "- A: 14,4 m", "- B: 14.40 m", "- C: 14 m"]);
assert.equal(malformedTransportMeasurements.sections[0].blocks[0].items.every((item) => item.measurement === null), true);
assert.equal(malformedTransportMeasurements.diagnostics.warnings.filter((entry) => entry.code === "NON_CANONICAL_MEASUREMENT").length, 3);

const houseV1 = parse([
  "UKŁAD POMIESZCZEŃ:",
  "",
  "Parter:",
  "",
  "- Wiatrołap: 4,20 m²",
  "- Salon: 30,00 m²",
  "",
  "Piętro:",
  "",
  "- Sypialnia: 12,00 m²",
  "",
  "SUMA: 46,20 m²",
]);
assert.deepEqual(houseV1.sections[0].groups.map((group) => group.title), ["Parter", "Piętro"]);
assert.equal(houseV1.sections[0].groups[0].rows.length, 2);
assert.equal(houseV1.sections[0].groups[1].rows.length, 2);

const proseAndListV1 = parse([
  "LOKALIZACJA:",
  "",
  "Nieruchomość znajduje się blisko parku.",
  "",
  "ATUTY LOKALIZACJI:",
  "",
  "- Komunikacja: szybki dojazd do centrum",
  "- Zieleń: park tuż obok",
]);
assert.equal(proseAndListV1.sections[0].blocks[0].type, "paragraph");
assert.equal(proseAndListV1.sections[1].blocks[0].type, "list");
assert.equal(proseAndListV1.sections[1].items.length, 2);

const suspiciousV1 = parse(["DLA KOGO:", "", "Dla rodzin", "", "Dla inwestorów", "", "Dla singli"]);
assert.ok(suspiciousV1.diagnostics.warnings.some((entry) => entry.code === "SUSPICIOUS_MULTI_VALUE_PROSE"));
const nonCanonicalV1 = parse(["UKŁAD POMIESZCZEŃ:", "", "- Salon: 20m"]);
assert.ok(nonCanonicalV1.diagnostics.warnings.some((entry) => entry.code === "NON_CANONICAL_MEASUREMENT"));

function modelText(model) {
  return [
    ...model.intro.map((block) => block.text),
    ...model.closing.map((block) => block.text),
    ...model.sections.flatMap((section) => section.blocks.flatMap((block) => [
      block.text,
      block.title,
      block.label,
      block.value,
      block.measurement,
      ...(block.items || []).flatMap((item) => [item.text, item.label, item.measurement, ...item.content.map((part) => part.text)]),
    ])),
    model.legal?.text,
  ].filter(Boolean).join(" ");
}

const untrustedMarkup = parse(["<script>alert('x')</script><iframe src='https://example.test'></iframe><b onclick='bad()'>Bezpieczny tekst</b>"]);
assert.doesNotMatch(modelText(untrustedMarkup), /<\/?(?:script|iframe|b)\b|onclick=|&lt;|&gt;/iu);
const rendererSource = fs.readFileSync(new URL("../src/components/offers/RichOfferDescription.jsx", import.meta.url), "utf8");
assert.doesNotMatch(rendererSource, /dangerouslySetInnerHTML/u);

const datasetAudit = Object.values(rawOffers)
  .sort((left, right) => Number(left.id) - Number(right.id))
  .map((offer) => {
    const model = parseRawOffer(String(offer.id));
    assert.doesNotThrow(() => parseRawOffer(String(offer.id)), `Offer ${offer.id} must not crash the parser.`);
    const visibleBlocks = model.intro.length + model.closing.length + model.sections.reduce((count, section) => count + section.blocks.length, 0) + (model.legal ? 1 : 0);
    const sourceText = normalizeDescription(offer.opis).text;
    assert.ok(!sourceText || visibleBlocks > 0, `Offer ${offer.id} must retain meaningful description content.`);
    assert.doesNotMatch(modelText(model), /&lt;|&gt;|<\/?(?:script|iframe|style)\b/iu, `Offer ${offer.id} must not expose raw source markup.`);
    return {
      id: offer.id,
      mode: model.diagnostics.sourceMode,
      sections: model.sections.length,
      warnings: model.diagnostics.warnings.length,
      errors: model.diagnostics.errors.length,
    };
  });
console.table(datasetAudit);
assert.equal(datasetAudit.reduce((count, entry) => count + entry.errors, 0), 0, "Dataset audit must have 0 parser ERROR.");

console.log("Description parser: V1 fixtures, generic headings, diagnostics, legacy regressions, and the full offer dataset passed.");
