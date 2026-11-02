import { getTransactionLabel, getTypeLabel } from "./offerListing.js";
import { resolveOfferMapPosition } from "./offerMapPosition.js";

export const PROPERTYCORP_URL = "https://demo.example.test";

export function formatNumber(value, maximumFractionDigits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits }).format(Number(value));
}

export function formatArea(value) {
  const formatted = formatNumber(value, 2);
  return formatted == null ? null : `${formatted} m²`;
}

export function formatPrice(offer) {
  if (offer?.price?.amount == null) return "Cena na zapytanie";
  const price = new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: offer.price.currency || "PLN",
    maximumFractionDigits: 0,
  }).format(offer.price.amount);
  return offer.transaction === "rent" ? `${price} / mies.` : price;
}

export function formatPricePerSquareMeter(value) {
  const formatted = formatNumber(value, 0);
  return formatted == null ? null : `${formatted} zł/m²`;
}

export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 9) return String(value || "");
  return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}

export function formatFloor(floor, floors) {
  if (floor == null) return null;
  const label = floor === 0 ? "Parter" : `${formatNumber(floor, 0)}. piętro`;
  return floors == null ? label : `${label} z ${formatNumber(floors, 0)}`;
}

export function formatRoomCount(value) {
  if (value == null) return null;
  const number = Number(value);
  const unit = number === 1 ? "pokój" : "pokoje";
  return `${formatNumber(number, 0)} ${unit}`;
}

export function formatLocation(location = {}, { includeStreet = true } = {}) {
  const values = [location.locality, location.municipality, includeStreet ? location.street : null];
  return values
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
}

export function getPublicLocation(location = {}) {
  return formatLocation(location, { includeStreet: false });
}

function getPointLocationPresentation(offer) {
  const position = resolveOfferMapPosition(offer);
  if (!position) return null;

  const heading = getPublicLocation(offer?.location) || "Wrocław i okolice";
  const query = `${position.lat},${position.lng}`;

  return {
    mode: "point",
    heading,
    description: "",
    modalDescription: "Punkt na mapie wskazuje najbliższą okolicę nieruchomości.",
    badge: "Lokalizacja przybliżona",
    address: null,
    latitude: position.lat,
    longitude: position.lng,
    embedQuery: null,
    externalQuery: query,
    externalLabel: "Otwórz w Google Maps",
    inlineZoom: 16,
    modalZoom: 17,
  };
}

function getUnavailableLocationPresentation(offer) {
  const heading = getPublicLocation(offer?.location) || "Lokalizacja oferty";

  return {
    mode: "unavailable",
    heading,
    description: "Lokalizacja nie została przekazana w danych źródłowych.",
    modalDescription: "Lokalizacja nie została przekazana w danych źródłowych.",
    badge: "Lokalizacja niedostępna",
    address: null,
    latitude: null,
    longitude: null,
    embedQuery: null,
    externalQuery: null,
    externalLabel: null,
    inlineZoom: null,
    modalZoom: null,
  };
}

/**
 * Prepares the map display from the coordinates supplied by the offer.
 * The permitted precision and public data contract require a separate decision.
 */
export function getOfferPublicLocationPresentation(offer) {
  // A valid n_geo_y / n_geo_x pair from the IMO JSON is always the map point.
  // There is deliberately no address-geocoding or approximate-centre fallback.
  return getPointLocationPresentation(offer) || getUnavailableLocationPresentation(offer);
}

export function getLocationBreadcrumb(offer) {
  return [getTypeLabel(offer.type), offer.location.locality || offer.location.municipality]
    .filter(Boolean);
}

export function getOfferEyebrow(offer) {
  return [getTypeLabel(offer.type), getTransactionLabel(offer.transaction)]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();
}

function item(label, value, icon) {
  return value == null || value === "" ? null : { label, value, icon };
}

function getCompactFloor(offer) {
  if (offer.floor == null) return null;
  const floor = offer.floor === 0 ? "Parter" : formatNumber(offer.floor, 0);
  return offer.floors == null ? floor : `${floor}/${formatNumber(offer.floors, 0)}`;
}

function amenity(label, value, icon) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  const normalizedLabel = label.toLocaleLowerCase("pl-PL");
  return {
    label,
    value: text,
    icon,
    chip: text.toLocaleLowerCase("pl-PL").startsWith(normalizedLabel) ? text : `${label} ${text}`,
  };
}

export function getPrimarySpecs(offer) {
  const { details = {} } = offer;
  const byType = {
    apartment: [
      item("Powierzchnia", formatArea(offer.area), "area"),
      item("Pokoje", offer.rooms != null ? formatNumber(offer.rooms, 0) : null, "rooms"),
      item("Piętro", getCompactFloor(offer), "floor"),
      item("Rok budowy", offer.yearBuilt != null ? formatNumber(offer.yearBuilt, 0) : null, "year"),
    ],
    house: [
      item("Powierzchnia", formatArea(offer.area), "area"),
      item("Działka", formatArea(details.plotArea), "plot"),
      item("Pokoje", offer.rooms != null ? formatNumber(offer.rooms, 0) : null, "rooms"),
      item("Rok budowy", offer.yearBuilt != null ? formatNumber(offer.yearBuilt, 0) : null, "year"),
    ],
    commercial: [
      item("Powierzchnia", formatArea(offer.area), "area"),
      item("Piętro", getCompactFloor(offer), "floor"),
      item("Kondygnacje", offer.floors != null ? formatNumber(offer.floors, 0) : null, "floor"),
      item("Pomieszczenia", details.roomCount != null ? formatNumber(details.roomCount, 0) : null, "rooms"),
    ],
  };

  return (byType[offer.type] || [
    item("Powierzchnia", formatArea(offer.area), "area"),
    item("Rok budowy", offer.yearBuilt != null ? formatNumber(offer.yearBuilt, 0) : null, "year"),
  ]).filter(Boolean).slice(0, 4);
}

export function getAmenitySpecs(offer) {
  const { details = {} } = offer;
  const balcony = details.balconyType || (details.balcony ? "Balkon" : null);
  const byType = {
    apartment: [
      amenity("Parking", details.parkingType, "parking"),
      amenity("Balkon", balcony, "balcony"),
      amenity("Ogrzewanie", details.heating, "heating"),
      amenity("Typ budynku", details.buildingType || details.residentialBuildingType, "building"),
    ],
    house: [
      amenity("Garaż", details.garageType, "garage"),
      amenity("Parking", details.parkingType, "parking"),
      amenity("Ogrzewanie", details.heating, "heating"),
      amenity("Sypialnie", details.bedrooms != null ? formatNumber(details.bedrooms, 0) : null, "bedrooms"),
    ],
    commercial: [
      amenity("Typ lokalu", details.commercialType, "commercial"),
      amenity("Przeznaczenie", details.purpose, "purpose"),
      amenity("Parking", details.parkingType, "parking"),
    ],
  };

  return (byType[offer.type] || []).filter(Boolean);
}

// Kept for compact contexts such as related offer cards. The detail view uses
// the dedicated primary and amenity groups above.
export function getQuickSpecs(offer) {
  return [...getPrimarySpecs(offer), ...getAmenitySpecs(offer)];
}

function rows(items) {
  return items.filter((entry) => entry && entry.value != null && entry.value !== "");
}

export function getDetailGroups(offer) {
  const { details } = offer;
  const groups = [
    {
      title: "Budynek",
      items: rows([
        item("Typ budynku", details.buildingType || details.residentialBuildingType),
        item("Rok budowy", offer.yearBuilt != null ? formatNumber(offer.yearBuilt, 0) : null),
        item("Liczba pięter", offer.floors != null ? formatNumber(offer.floors, 0) : null),
        item("Ogrzewanie", details.heating),
        item("Stan budynku", details.buildingCondition),
        item("Materiał budowy", details.constructionMaterial),
      ]),
    },
    {
      title: "Nieruchomość",
      items: rows([
        item("Forma własności", details.ownership),
        item("Stan", details.propertyCondition),
        item("Piętro", formatFloor(offer.floor, offer.floors)),
        item("Balkon", details.balconyType || (details.balcony ? "Tak" : null)),
        item("Typ kuchni", details.kitchenType),
        item("Stolarka okienna", details.windowJoinery),
        item("Kierunek okien", details.windowDirection),
      ]),
    },
    {
      title: "Parking",
      items: rows([
        item("Typ parkingu", details.parkingType),
        item("Garaż", details.garageType),
        item("Liczba miejsc", details.parkingSpaces != null ? formatNumber(details.parkingSpaces, 0) : null),
      ]),
    },
    {
      title: "Dom i działka",
      items: rows([
        item("Powierzchnia działki", formatArea(details.plotArea)),
        item("Sypialnie", details.bedrooms != null ? formatNumber(details.bedrooms, 0) : null),
        item("Łazienki", details.bathrooms != null ? formatNumber(details.bathrooms, 0) : null),
        item("Dojazd", details.driveway),
        item("Ogrodzenie", details.fence),
      ]),
    },
    {
      title: "Lokal",
      items: rows([
        item("Typ lokalu", details.commercialType),
        item("Przeznaczenie", details.purpose),
        item("Liczba pomieszczeń", details.roomCount != null ? formatNumber(details.roomCount, 0) : null),
        item("Internet", details.internetConnection),
      ]),
    },
  ];

  const byType = {
    apartment: [groups[0], groups[1], groups[2]],
    house: [groups[0], groups[1], groups[3], groups[2]],
    commercial: [groups[0], groups[4], groups[2]],
  };

  return (byType[offer.type] || [groups[0], groups[1], groups[2]]).filter((group) => group.items.length > 0);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function getDescriptionParagraphs(description) {
  return String(description?.text || "")
    .split(/\n\s*\n|\r?\n/)
    .map(normalizeText)
    .filter(Boolean);
}

function getSentences(paragraph) {
  return paragraph.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [paragraph];
}

function isLegalOrSourceParagraph(paragraph) {
  return /^(treść niniejszego|niniejsze ogłoszenie|ogłoszenie nie stanowi|oferta wysłana z programu imo|opis oferty zawarty na stronie|property\s*corp\.?$)/i.test(normalizeText(paragraph));
}

function removeBoilerplateIntroduction(paragraph) {
  const normalized = normalizeText(paragraph);
  if (!/^mam przyjemność(?:\s|$)/i.test(normalized)) return normalized;

  const introductionWithAbbreviation = normalized.match(/^mam przyjemność[\s\S]*?(?<!\bul)[.!?](?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/i)?.[0];
  if (introductionWithAbbreviation && introductionWithAbbreviation.length <= 280) {
    return normalized.slice(introductionWithAbbreviation.length).trim();
  }

  const [introduction, ...remainingSentences] = getSentences(normalized);
  // The first sentence is a sales introduction. Keep the rest of the same
  // paragraph: this is where IMO exports usually put actual property details.
  if (remainingSentences.length && introduction.length <= 280) return remainingSentences.join(" ");
  return normalized;
}

export function isBoilerplateParagraph(paragraph) {
  return isLegalOrSourceParagraph(paragraph);
}

export function getReadableDescriptionParagraphs(description) {
  return getDescriptionParagraphs(description)
    .filter((paragraph) => !isLegalOrSourceParagraph(paragraph))
    .map(removeBoilerplateIntroduction)
    .filter(Boolean);
}

export function getOfferDescriptionParagraphs(offer) {
  const readable = getReadableDescriptionParagraphs(offer?.description);
  if (readable.length) return readable;

  return [
    "Chcesz poznać szczegóły tej nieruchomości? Dostępny jest u opiekuna oferty.",
    "Skontaktuj się z nami — chętnie przekażemy wszystkie informacje i odpowiemy na Twoje pytania.",
  ];
}

export function getDescriptionPreview(paragraphs, maximumCharacters = 650, maximumParagraphs = 3) {
  const preview = [];
  let count = 0;
  for (const paragraph of paragraphs.slice(0, maximumParagraphs)) {
    if (preview.length && count + paragraph.length > maximumCharacters) break;
    if (count + paragraph.length <= maximumCharacters) {
      preview.push(paragraph);
      count += paragraph.length;
      continue;
    }

    const sentences = getSentences(paragraph);
    const excerpt = [];
    for (const sentence of sentences) {
      if (excerpt.length && count + sentence.length > maximumCharacters) break;
      excerpt.push(sentence);
      count += sentence.length;
      if (count >= maximumCharacters) break;
    }
    if (excerpt.length) preview.push(excerpt.join(" "));
    if (count >= maximumCharacters) break;
  }
  return preview.length ? preview : paragraphs.slice(0, 1);
}

export function getRelatedOffers(currentOffer, offers, count = 3) {
  const score = (candidate) => {
    const sameTransaction = candidate.transaction === currentOffer.transaction ? 1 : 0;
    const sameType = candidate.type === currentOffer.type ? 1 : 0;
    const sameLocality = candidate.location.locality && candidate.location.locality === currentOffer.location.locality ? 1 : 0;
    const priceDistance = currentOffer.price.amount && candidate.price.amount
      ? Math.abs(candidate.price.amount - currentOffer.price.amount) / Math.max(currentOffer.price.amount, 1)
      : 1;
    const areaDistance = currentOffer.area && candidate.area
      ? Math.abs(candidate.area - currentOffer.area) / Math.max(currentOffer.area, 1)
      : 1;
    return { candidate, sameTransaction, sameType, sameLocality, priceDistance, areaDistance };
  };

  return offers
    .filter((candidate) => candidate.id !== currentOffer.id)
    .map(score)
    .sort((left, right) => (
      right.sameTransaction - left.sameTransaction
      || right.sameType - left.sameType
      || right.sameLocality - left.sameLocality
      || left.priceDistance - right.priceDistance
      || left.areaDistance - right.areaDistance
      || String(right.candidate.dates.updatedAt || "").localeCompare(String(left.candidate.dates.updatedAt || ""))
    ))
    .slice(0, count)
    .map(({ candidate }) => candidate);
}

export function getOfferSeoDescription(offer) {
  const parts = [
    `${getTypeLabel(offer.type)} ${offer.transaction === "rent" ? "na wynajem" : "na sprzedaż"}`,
    getPublicLocation(offer.location),
    formatArea(offer.area),
    formatRoomCount(offer.rooms),
    formatPrice(offer),
  ].filter(Boolean);
  return parts.join(" · ");
}
