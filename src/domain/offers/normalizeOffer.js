import { buildOfferSlug } from "./buildOfferSlug.js";
import { normalizeDescription } from "./normalizeDescription.js";
import { normalizeImages } from "./normalizeImages.js";

const transactionMap = {
  sprzedaz: "sale",
  wynajem: "rent",
};

const typeMap = {
  domy: "house",
  dzialki: "plot",
  lokale: "commercial",
  mieszkania: "apartment",
};

const fallbackTypeLabels = {
  house: "Dom",
  plot: "Działka",
  commercial: "Lokal",
  apartment: "Mieszkanie",
  other: "Nieruchomość",
};

const knownKeys = new Set([
  "id", "typ", "kategoria", "nazwaF", "advertisement_text", "cena", "cena1m", "waluta", "powierzchnia", "liczbapokoi", "pietro", "liczbapieter", "rokbudowy", "n_geo_x", "n_geo_y", "ulica", "numer_budynku", "nr_budynku", "numer_domu", "nr_domu", "kod_pocztowy", "kodpocztowy", "location_level_1", "location_level_2", "location_level_3", "location_level_4", "location_level_5", "superoferta", "wylacznosc", "bezprowizji", "rynek_pierwotny", "opis", "agent_nazwisko", "agent_tel_kom", "agent_email", "numer_licencji_posrednika", "datawprowadzenia", "dataaktualizacji", "zwalnianeod", "zdjecia",
  "forma_wlasnosci", "typ_budynku", "typbudynkumieszk", "stannieruchomosci", "stanbudynku", "ogrzewanie", "balkon", "taras", "typ_balkonuF", "powierzchniadzialki", "liczba_sypialni", "liczba_lazienek", "liczbalazienek", "typ_garazu", "typ_parkingu", "liczba_miejsc_parkingowych", "miejscaparkingowe", "typkuchni", "typ_podlogi", "stolarka_okienna", "kierunekokien", "typlokalu", "przeznaczenie", "liczbapomieszczen", "materialbudowy", "drogadojazdowa", "ogrodzenie", "rodzajlacz",
]);

function parseNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  return value === true || String(value).toLowerCase() === "true" || value === 1 || value === "1";
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function derivedPricePerSquareMeter(amount, area) {
  if (amount == null || area == null || area <= 0) return null;
  // OfertyNET's historical cena1m values are the price/area quotient rounded
  // to two decimals. The full XML export omits that redundant field, while
  // the site still presents it, so retain the same effective value.
  return Number((amount / area).toFixed(2));
}

function textualParkingDescriptor(value, type) {
  const descriptor = text(value);
  if (!descriptor || parseNumber(descriptor) != null) return { garageType: null, parkingType: null };
  // In the observed full XML, miejscaparkingowe is overloaded: houses use
  // "w bryle" for a garage while apartments use "parking podziemny". Keep
  // that existing business meaning instead of exposing a source-schema alias.
  if (type === "house" && !/parking/iu.test(descriptor)) return { garageType: descriptor, parkingType: null };
  return { garageType: null, parkingType: descriptor };
}

function getFallbackTitle(rawOffer, type, transaction) {
  const typeLabel = fallbackTypeLabels[type] || fallbackTypeLabels.other;
  const transactionLabel = transaction === "rent" ? "na wynajem" : transaction === "sale" ? "na sprzedaż" : null;
  const locality = text(rawOffer.location_level_5) || text(rawOffer.location_level_4) || "Wrocław i okolice";
  return [typeLabel, transactionLabel, locality].filter(Boolean).join(" — ");
}

function normalizeAttributes(rawOffer) {
  return Object.fromEntries(
    Object.entries(rawOffer).filter(([key, value]) => (
      !knownKeys.has(key)
      && !/^zdjecie\d+$/i.test(key)
      && value != null
      && value !== ""
    )),
  );
}

/**
 * Converts one IMO-shaped record into the application contract. New sources
 * must adapt to this function's output rather than leaking their own schema
 * into React components.
 */
export function normalizeOffer(rawOffer, options = {}) {
  const externalId = String(rawOffer?.id || "").trim();
  if (!externalId) throw new Error("Cannot normalize an offer without an IMO id.");

  const transaction = transactionMap[rawOffer.typ] || "unknown";
  const type = typeMap[rawOffer.kategoria] || "other";
  const title = String(rawOffer.nazwaF || rawOffer.advertisement_text || "").trim() || getFallbackTitle(rawOffer, type, transaction);
  const priceAmount = parseNumber(rawOffer.cena);
  const area = parseNumber(rawOffer.powierzchnia);
  const pricePerSquareMeter = firstNumber(rawOffer.cena1m) ?? derivedPricePerSquareMeter(priceAmount, area);
  const textualParking = textualParkingDescriptor(rawOffer.miejscaparkingowe, type);
  const hasTerrace = parseBoolean(rawOffer.taras);
  const imageResult = normalizeImages(rawOffer, options);

  return {
    id: externalId,
    externalId,
    slug: buildOfferSlug(title),
    transaction,
    type,
    source: {
      transaction: rawOffer.typ || null,
      category: rawOffer.kategoria || null,
    },
    title,
    price: {
      amount: priceAmount,
      currency: rawOffer.waluta || "PLN",
      pricePerSquareMeter,
    },
    area,
    rooms: parseNumber(rawOffer.liczbapokoi),
    floor: parseNumber(rawOffer.pietro),
    floors: parseNumber(rawOffer.liczbapieter),
    yearBuilt: parseNumber(rawOffer.rokbudowy),
    location: {
      country: rawOffer.location_level_1 || null,
      region: rawOffer.location_level_2 || null,
      county: rawOffer.location_level_3 || null,
      municipality: rawOffer.location_level_4 || null,
      locality: rawOffer.location_level_5 || null,
      street: rawOffer.ulica || null,
      buildingNumber: text(rawOffer.numer_budynku || rawOffer.nr_budynku || rawOffer.numer_domu || rawOffer.nr_domu),
      postalCode: text(rawOffer.kod_pocztowy || rawOffer.kodpocztowy),
      latitude: parseNumber(text(rawOffer.n_geo_y)),
      longitude: parseNumber(text(rawOffer.n_geo_x)),
    },
    flags: {
      featured: parseBoolean(rawOffer.superoferta),
      exclusive: parseBoolean(rawOffer.wylacznosc),
      noCommission: parseBoolean(rawOffer.bezprowizji),
      primaryMarket: parseBoolean(rawOffer.rynek_pierwotny),
    },
    images: imageResult.images,
    imageIssues: {
      missingFilenames: imageResult.missingFilenames,
    },
    description: normalizeDescription(rawOffer.opis),
    agent: {
      name: rawOffer.agent_nazwisko || null,
      phone: rawOffer.agent_tel_kom || null,
      email: rawOffer.agent_email || null,
      licenseNumber: rawOffer.numer_licencji_posrednika || null,
    },
    details: {
      ownership: text(rawOffer.forma_wlasnosci),
      buildingType: text(rawOffer.typ_budynku || rawOffer.typbudynkumieszk),
      residentialBuildingType: text(rawOffer.typbudynkumieszk),
      propertyCondition: text(rawOffer.stannieruchomosci),
      buildingCondition: text(rawOffer.stanbudynku),
      heating: text(rawOffer.ogrzewanie),
      balcony: parseBoolean(rawOffer.balkon) || hasTerrace,
      balconyType: text(rawOffer.typ_balkonuF) || (hasTerrace ? "taras" : null),
      plotArea: parseNumber(rawOffer.powierzchniadzialki),
      bedrooms: parseNumber(rawOffer.liczba_sypialni),
      bathrooms: firstNumber(rawOffer.liczba_lazienek, rawOffer.liczbalazienek),
      garageType: text(rawOffer.typ_garazu) || textualParking.garageType,
      parkingType: text(rawOffer.typ_parkingu) || textualParking.parkingType,
      parkingSpaces: firstNumber(rawOffer.liczba_miejsc_parkingowych, rawOffer.miejscaparkingowe),
      kitchenType: text(rawOffer.typkuchni),
      floorType: text(rawOffer.typ_podlogi),
      windowJoinery: text(rawOffer.stolarka_okienna),
      windowDirection: text(rawOffer.kierunekokien),
      commercialType: text(rawOffer.typlokalu),
      purpose: text(rawOffer.przeznaczenie),
      roomCount: parseNumber(rawOffer.liczbapomieszczen),
      constructionMaterial: text(rawOffer.materialbudowy),
      driveway: text(rawOffer.drogadojazdowa),
      fence: text(rawOffer.ogrodzenie),
      internetConnection: text(rawOffer.rodzajlacz),
    },
    attributes: normalizeAttributes(rawOffer),
    dates: {
      createdAt: rawOffer.datawprowadzenia || null,
      updatedAt: rawOffer.dataaktualizacji || null,
      availableFrom: rawOffer.zwalnianeod || null,
    },
  };
}
