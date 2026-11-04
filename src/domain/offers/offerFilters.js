import { sortOffersByIntroductionDate } from "./offerSorting.js";

export const DEFAULT_OFFER_FILTERS = Object.freeze({
  transaction: null,
  type: [],
  location: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  rooms: [],
  roomsMin: null,
  roomsMax: null,
  attributes: {},
  sort: "newest",
});

const transactions = new Set(["sale", "rent"]);
const sorts = new Set(["featured", "newest", "price-asc", "price-desc", "area-asc", "area-desc"]);
const roomFilters = new Set(["1", "2", "3", "4", "5-plus"]);

function parseNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function get(searchParams, key) {
  return typeof searchParams?.get === "function" ? searchParams.get(key) : null;
}

function getAll(searchParams, key) {
  if (typeof searchParams?.getAll === "function") return searchParams.getAll(key);
  const value = get(searchParams, key);
  return value == null ? [] : [value];
}

function uniqueValues(values, predicate = () => true) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter((value) => value && predicate(value)))];
}

function selection(value, predicate) {
  return uniqueValues(Array.isArray(value) ? value : value == null ? [] : [value], predicate);
}

export function toFilterSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getOfferLocationFilterValue(offer) {
  return toFilterSlug(offer?.location?.locality);
}

export function parseOfferFilters(searchParams) {
  const transaction = get(searchParams, "transaction");
  const sort = get(searchParams, "sort");
  const attributes = Object.fromEntries(
    [...(searchParams?.entries?.() || [])]
      .filter(([key, value]) => key.startsWith("attribute.") && value)
      .map(([key, value]) => [key.slice("attribute.".length), value]),
  );

  return {
    ...DEFAULT_OFFER_FILTERS,
    transaction: transactions.has(transaction) ? transaction : null,
    type: selection(getAll(searchParams, "type")),
    location: selection(getAll(searchParams, "location")),
    priceMin: parseNumber(get(searchParams, "priceMin")),
    priceMax: parseNumber(get(searchParams, "priceMax")),
    areaMin: parseNumber(get(searchParams, "areaMin")),
    areaMax: parseNumber(get(searchParams, "areaMax")),
    rooms: selection(getAll(searchParams, "rooms"), (value) => roomFilters.has(value)),
    roomsMin: parseNumber(get(searchParams, "roomsMin")),
    roomsMax: parseNumber(get(searchParams, "roomsMax")),
    attributes,
    sort: sorts.has(sort) ? sort : DEFAULT_OFFER_FILTERS.sort,
  };
}

export function serializeOfferFilters(filters = {}) {
  const merged = { ...DEFAULT_OFFER_FILTERS, ...filters };
  const params = new URLSearchParams();
  const add = (key, value) => {
    if (value != null && value !== "") params.set(key, String(value));
  };
  const addSelection = (key, value) => {
    selection(value).forEach((entry) => params.append(key, entry));
  };

  add("transaction", merged.transaction);
  addSelection("type", merged.type);
  addSelection("location", merged.location);
  add("priceMin", merged.priceMin);
  add("priceMax", merged.priceMax);
  add("areaMin", merged.areaMin);
  add("areaMax", merged.areaMax);
  addSelection("rooms", merged.rooms);
  add("roomsMin", merged.roomsMin);
  add("roomsMax", merged.roomsMax);
  if (merged.sort && merged.sort !== DEFAULT_OFFER_FILTERS.sort) add("sort", merged.sort);
  Object.entries(merged.attributes || {}).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, value]) => {
    add(`attribute.${key}`, value);
  });
  return params;
}

export function findChangedOfferFilter(previous, next) {
  return Object.keys(next).find((key) => {
    const left = previous[key];
    const right = next[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length !== right.length || left.some((value) => !right.includes(value));
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const keys = Object.keys(left);
      return keys.length !== Object.keys(right).length || keys.some((name) => left[name] !== right[name]);
    }
    return left !== right;
  });
}

function containsLocation(offer, values) {
  const selected = selection(values);
  if (!selected.length) return true;
  return selected.some((value) => {
    if (getOfferLocationFilterValue(offer) === value) return true;

    const needle = value.toLocaleLowerCase("pl");
    return [offer.location.country, offer.location.region, offer.location.county, offer.location.municipality, offer.location.locality, offer.location.street]
      .filter(Boolean)
      .some((part) => part.toLocaleLowerCase("pl").includes(needle));
  });
}

function matchesRooms(offer, values) {
  const selected = selection(values, (value) => roomFilters.has(value));
  if (!selected.length) return true;
  if (offer.rooms == null) return false;
  return selected.some((value) => (value === "5-plus" ? offer.rooms >= 5 : offer.rooms === Number(value)));
}

export function matchesOfferFilters(offer, filters = {}) {
  const current = { ...DEFAULT_OFFER_FILTERS, ...filters };
  const amount = offer.price.amount;
  const selectedTypes = selection(current.type);
  return (!current.transaction || offer.transaction === current.transaction)
    && (!selectedTypes.length || selectedTypes.includes(offer.type))
    && containsLocation(offer, current.location)
    && (current.priceMin == null || (amount != null && amount >= current.priceMin))
    && (current.priceMax == null || (amount != null && amount <= current.priceMax))
    && (current.areaMin == null || (offer.area != null && offer.area >= current.areaMin))
    && (current.areaMax == null || (offer.area != null && offer.area <= current.areaMax))
    && matchesRooms(offer, current.rooms)
    && (current.roomsMin == null || (offer.rooms != null && offer.rooms >= current.roomsMin))
    && (current.roomsMax == null || (offer.rooms != null && offer.rooms <= current.roomsMax))
    && Object.entries(current.attributes || {}).every(([key, value]) => offer.attributes[key] === value);
}

export function filterOffers(offers, filters = {}) {
  return offers.filter((offer) => matchesOfferFilters(offer, filters));
}

export function sortOffers(offers, sort = DEFAULT_OFFER_FILTERS.sort) {
  if (sort === "newest") return sortOffersByIntroductionDate(offers);
  const sorted = [...offers];
  if (sort === "price-asc") return sorted.sort((left, right) => (left.price.amount ?? Infinity) - (right.price.amount ?? Infinity));
  if (sort === "price-desc") return sorted.sort((left, right) => (right.price.amount ?? -Infinity) - (left.price.amount ?? -Infinity));
  if (sort === "area-asc") return sorted.sort((left, right) => (left.area ?? Infinity) - (right.area ?? Infinity));
  if (sort === "area-desc") return sorted.sort((left, right) => (right.area ?? -Infinity) - (left.area ?? -Infinity));
  return sorted.sort((left, right) => Number(right.flags.featured) - Number(left.flags.featured));
}

export function getListingOffers(offers, filters = DEFAULT_OFFER_FILTERS) {
  const current = { ...DEFAULT_OFFER_FILTERS, ...filters };
  return sortOffers(filterOffers(offers, current), current.sort);
}

export function hasOfferListingContext(filters = DEFAULT_OFFER_FILTERS) {
  return Boolean(serializeOfferFilters(filters).toString());
}
