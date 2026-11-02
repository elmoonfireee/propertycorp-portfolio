import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchJsonWithTimeout } from "../../server/fetchJsonWithTimeout.mjs";

export const REPORT_TIMEZONE = "Europe/Warsaw";
export const DEFAULT_ACQUISITION_LIMIT = 10;

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_DATA_API_ROOT = "https://analyticsdata.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 15_000;

export const OFFER_EVENTS = Object.freeze({
  view_offer: "views",
  view_offer_gallery: "galleryOpens",
  view_full_description: "fullDescriptionOpens",
  view_offer_map: "mapOpens",
  click_agent_phone: "phoneClicks",
  click_agent_email: "emailClicks",
});

export const INTERACTION_EVENTS = Object.freeze([
  "view_offer",
  "view_offer_gallery",
  "view_full_description",
  "view_offer_map",
  "open_full_offers_map",
  "filter_offers",
  "click_agent_phone",
  "click_agent_email",
  "click_instagram",
]);

const REQUIRED_ENVIRONMENT_NAMES = Object.freeze([
  "GA4_PROPERTY_ID",
  "GOOGLE_ANALYTICS_OAUTH_CLIENT_ID",
  "GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET",
  "GOOGLE_ANALYTICS_OAUTH_REFRESH_TOKEN",
]);

function stringValue(value) {
  return String(value || "").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function compareText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 100) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function isoWeekday(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function dateInTimeZone(date, timeZone) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const parts = Object.fromEntries(values.map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeReferenceDate(referenceDate, timeZone) {
  if (typeof referenceDate === "string") {
    if (!isIsoDate(referenceDate)) throw new Error("report_reference_date_invalid");
    return referenceDate;
  }
  if (referenceDate instanceof Date && !Number.isNaN(referenceDate.valueOf())) return dateInTimeZone(referenceDate, timeZone);
  throw new Error("report_reference_date_invalid");
}

export function getWeeklyReportingPeriods(referenceDate = new Date(), timeZone = REPORT_TIMEZONE) {
  const reference = normalizeReferenceDate(referenceDate, timeZone);
  // A report always ends on the Sunday before the execution calendar day. On
  // Sunday itself the active week is still incomplete until the day is over.
  const currentEnd = addDays(reference, -isoWeekday(reference));
  const currentStart = addDays(currentEnd, -6);
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -6);

  return {
    timezone: timeZone,
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}

export function calculateMetricDelta(currentValue, previousValue) {
  const current = finiteNumber(currentValue);
  const previous = finiteNumber(previousValue);
  const absoluteDelta = current - previous;
  return {
    current,
    previous,
    absoluteDelta,
    // A percentage has no meaningful finite denominator when the baseline is
    // zero. The renderer presents null as an unavailable comparison.
    percentDelta: previous === 0 ? null : Number(((absoluteDelta / previous) * 100).toFixed(2)),
  };
}

export function parseHostnameAllowlist(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(entries.map((entry) => stringValue(entry).toLowerCase()).filter(Boolean))].sort(compareText);
}

export function buildHostnameFilter(hostnames) {
  const values = parseHostnameAllowlist(hostnames);
  if (!values.length) return null;
  return {
    filter: {
      fieldName: "hostName",
      inListFilter: { values, caseSensitive: false },
    },
  };
}

export function buildReportDimensionFilter({ hostnames, eventNames } = {}) {
  const expressions = [];
  const hostnameFilter = buildHostnameFilter(hostnames);
  const events = [...new Set((eventNames || []).map(stringValue).filter(Boolean))].sort(compareText);
  if (hostnameFilter) expressions.push(hostnameFilter);
  if (events.length) {
    expressions.push({
      filter: {
        fieldName: "eventName",
        inListFilter: { values: events, caseSensitive: true },
      },
    });
  }
  if (!expressions.length) return null;
  return expressions.length === 1 ? expressions[0] : { andGroup: { expressions } };
}

export function createRunReportRequest({ period, dimensions = [], metrics, hostnames, eventNames, limit, keepEmptyRows = false }) {
  const dimensionFilter = buildReportDimensionFilter({ hostnames, eventNames });
  return {
    dateRanges: [{ startDate: period.start, endDate: period.end }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    ...(dimensionFilter ? { dimensionFilter } : {}),
    ...(limit ? { limit: String(limit) } : {}),
    ...(keepEmptyRows ? { keepEmptyRows: true } : {}),
  };
}

export function parseRunReportRows(response = {}) {
  const dimensions = (response.dimensionHeaders || []).map((header) => header.name);
  const metrics = (response.metricHeaders || []).map((header) => header.name);
  return (response.rows || []).map((row) => ({
    dimensions: Object.fromEntries(dimensions.map((name, index) => [name, row.dimensionValues?.[index]?.value || ""])),
    metrics: Object.fromEntries(metrics.map((name, index) => [name, finiteNumber(row.metricValues?.[index]?.value)])),
  }));
}

function firstMetricValues(response) {
  return parseRunReportRows(response)[0]?.metrics || {};
}

function normalizedDate(value) {
  const compact = String(value || "");
  return /^\d{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` : compact;
}

export function fillDailyTraffic(rows, period) {
  const valuesByDate = new Map(rows.map((row) => [normalizedDate(row.dimensions.date), row.metrics]));
  const daily = [];
  for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
    const metrics = valuesByDate.get(date) || {};
    daily.push({
      date,
      activeUsers: finiteNumber(metrics.activeUsers),
      sessions: finiteNumber(metrics.sessions),
      screenPageViews: finiteNumber(metrics.screenPageViews),
    });
  }
  return daily;
}

export function normalizeAcquisition(rows, topN = DEFAULT_ACQUISITION_LIMIT) {
  return rows
    .map((row) => ({
      channel: row.dimensions.sessionDefaultChannelGroup || "(not set)",
      source: row.dimensions.sessionSource || "(not set)",
      medium: row.dimensions.sessionMedium || "(not set)",
      activeUsers: finiteNumber(row.metrics.activeUsers),
      sessions: finiteNumber(row.metrics.sessions),
      screenPageViews: finiteNumber(row.metrics.screenPageViews),
    }))
    .sort((left, right) => (
      right.sessions - left.sessions
      || right.activeUsers - left.activeUsers
      || right.screenPageViews - left.screenPageViews
      || compareText(left.channel, right.channel)
      || compareText(left.source, right.source)
      || compareText(left.medium, right.medium)
    ))
    .slice(0, topN);
}

export function aggregateInteractionTotals(rows) {
  const totals = Object.fromEntries(INTERACTION_EVENTS.map((eventName) => [eventName, 0]));
  rows.forEach((row) => {
    const eventName = row.dimensions.eventName;
    if (Object.hasOwn(totals, eventName)) totals[eventName] += finiteNumber(row.metrics.eventCount);
  });
  return totals;
}

export function aggregateOfferPerformance(rows) {
  const offers = new Map();
  rows.forEach((row) => {
    const eventName = row.dimensions.eventName;
    const metricKey = OFFER_EVENTS[eventName];
    const offerId = stringValue(row.dimensions["customEvent:offer_id"] || row.dimensions.offer_id);
    if (!metricKey || !offerId || offerId === "(not set)") return;
    const offer = offers.get(offerId) || {
      offerId,
      views: 0,
      galleryOpens: 0,
      fullDescriptionOpens: 0,
      mapOpens: 0,
      phoneClicks: 0,
      emailClicks: 0,
    };
    offer[metricKey] += finiteNumber(row.metrics.eventCount);
    offers.set(offerId, offer);
  });

  return [...offers.values()].sort((left, right) => right.views - left.views || compareText(left.offerId, right.offerId));
}

/**
 * GA4 can return offer-related events without a registered offer id (most
 * commonly `(not set)`). Keep those events out of synthetic offer rows while
 * preserving the difference between all offer views and views attributable to
 * a concrete offer.
 */
export function aggregateOfferTotals(rows) {
  let totalOfferViews = 0;
  let assignedOfferViews = 0;

  rows.forEach((row) => {
    if (row.dimensions.eventName !== "view_offer") return;
    const views = finiteNumber(row.metrics.eventCount);
    totalOfferViews += views;
    const offerId = stringValue(row.dimensions["customEvent:offer_id"] || row.dimensions.offer_id);
    if (offerId && offerId.toLowerCase() !== "(not set)") assignedOfferViews += views;
  });

  return {
    totalOfferViews,
    assignedOfferViews,
    unassignedOfferViews: Math.max(0, totalOfferViews - assignedOfferViews),
  };
}

export function getWeeklyAnalyticsConfig(environment = process.env) {
  const values = Object.fromEntries(REQUIRED_ENVIRONMENT_NAMES.map((name) => [name, stringValue(environment?.[name])]));
  const missing = REQUIRED_ENVIRONMENT_NAMES.filter((name) => !values[name]);
  if (missing.length) throw new Error(`ga4_report_configuration_missing:${missing.join(",")}`);
  if (!/^\d+$/.test(values.GA4_PROPERTY_ID)) throw new Error("ga4_report_property_id_invalid");
  return {
    propertyId: values.GA4_PROPERTY_ID,
    clientId: values.GOOGLE_ANALYTICS_OAUTH_CLIENT_ID,
    clientSecret: values.GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET,
    refreshToken: values.GOOGLE_ANALYTICS_OAUTH_REFRESH_TOKEN,
    hostnames: parseHostnameAllowlist(environment?.GA4_REPORT_HOSTNAMES),
  };
}

export function createGoogleAnalyticsDataClient(config, { fetchImplementation = globalThis.fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImplementation !== "function") throw new Error("ga4_report_fetch_unavailable");
  let token = null;
  let tokenExpiresAt = 0;

  const getAccessToken = async () => {
    if (token && Date.now() < tokenExpiresAt) return token;
    const payload = await fetchJsonWithTimeout(fetchImplementation, OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }),
    }, { timeoutMs: requestTimeoutMs, errorPrefix: "ga4_report_oauth_refresh_failed" });
    if (!stringValue(payload?.access_token)) throw new Error("ga4_report_oauth_access_token_missing");
    token = payload.access_token;
    tokenExpiresAt = Date.now() + Math.max(60, finiteNumber(payload.expires_in) - 30) * 1000;
    return token;
  };

  return {
    async runReport(request) {
      const accessToken = await getAccessToken();
      const endpoint = `${GA4_DATA_API_ROOT}/properties/${encodeURIComponent(config.propertyId)}:runReport`;
      return fetchJsonWithTimeout(fetchImplementation, endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }, { timeoutMs: requestTimeoutMs, errorPrefix: "ga4_report_request_failed" });
    },
  };
}

export async function buildWeeklyAnalyticsReport({
  runReport,
  referenceDate = new Date(),
  timezone = REPORT_TIMEZONE,
  hostnames = [],
  acquisitionLimit = DEFAULT_ACQUISITION_LIMIT,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof runReport !== "function") throw new Error("ga4_report_runner_missing");
  const period = getWeeklyReportingPeriods(referenceDate, timezone);
  const shared = { hostnames };
  const trafficMetrics = ["activeUsers", "sessions", "screenPageViews", "eventCount"];
  const [currentTrafficResponse, previousTrafficResponse] = await Promise.all([
    runReport(createRunReportRequest({ ...shared, period: period.current, metrics: trafficMetrics })),
    runReport(createRunReportRequest({ ...shared, period: period.previous, metrics: trafficMetrics })),
  ]);
  const [acquisitionResponse, dailyResponse, interactionResponse, offerResponse] = await Promise.all([
    runReport(createRunReportRequest({
      ...shared,
      period: period.current,
      dimensions: ["sessionDefaultChannelGroup", "sessionSource", "sessionMedium"],
      metrics: ["activeUsers", "sessions", "screenPageViews"],
      limit: 1_000,
    })),
    runReport(createRunReportRequest({
      ...shared,
      period: period.current,
      dimensions: ["date"],
      metrics: ["activeUsers", "sessions", "screenPageViews"],
      keepEmptyRows: true,
    })),
    runReport(createRunReportRequest({
      ...shared,
      period: period.current,
      dimensions: ["eventName"],
      metrics: ["eventCount"],
      eventNames: INTERACTION_EVENTS,
      limit: INTERACTION_EVENTS.length,
    })),
    runReport(createRunReportRequest({
      ...shared,
      period: period.current,
      dimensions: ["eventName", "customEvent:offer_id"],
      metrics: ["eventCount"],
      eventNames: Object.keys(OFFER_EVENTS),
      limit: 10_000,
    })),
  ]);

  const currentTraffic = firstMetricValues(currentTrafficResponse);
  const previousTraffic = firstMetricValues(previousTrafficResponse);
  const offerRows = parseRunReportRows(offerResponse);
  return {
    generatedAt,
    period,
    filtering: { hostnames: parseHostnameAllowlist(hostnames) },
    traffic: Object.fromEntries(trafficMetrics.map((metric) => [metric, calculateMetricDelta(currentTraffic[metric], previousTraffic[metric])])),
    acquisition: normalizeAcquisition(parseRunReportRows(acquisitionResponse), acquisitionLimit),
    daily: fillDailyTraffic(parseRunReportRows(dailyResponse), period.current),
    interactions: aggregateInteractionTotals(parseRunReportRows(interactionResponse)),
    offers: aggregateOfferPerformance(offerRows),
    offerTotals: aggregateOfferTotals(offerRows),
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(finiteNumber(value));
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDate(date) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

export function formatDateRange(period) {
  const [startYear, startMonth, startDay] = period.start.split("-");
  const [endYear, endMonth, endDay] = period.end.split("-");
  if (startYear === endYear) return `${startDay}.${startMonth}–${endDay}.${endMonth}.${endYear}`;
  return `${formatDate(period.start)}–${formatDate(period.end)}`;
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function metricLine(label, metric) {
  const delta = metric.absoluteDelta > 0 ? `+${formatNumber(metric.absoluteDelta)}` : formatNumber(metric.absoluteDelta);
  const percentage = metric.percentDelta == null ? "brak porównywalnej bazy" : formatPercent(metric.percentDelta);
  return `- ${label}: **${formatNumber(metric.current)}** (poprzednio: ${formatNumber(metric.previous)}; ${delta}; ${percentage})`;
}

export const INTERACTION_LABELS = Object.freeze({
  view_offer: "Wyświetlenia ofert",
  view_offer_gallery: "Otwarcia galerii",
  view_full_description: "Otwarcia pełnego opisu",
  view_offer_map: "Otwarcia mapy",
  open_full_offers_map: "Otwarcia pełnej mapy ofert",
  filter_offers: "Użycia filtrów",
  click_agent_phone: "Kliknięcia numeru telefonu",
  click_agent_email: "Kliknięcia adresu e-mail",
  click_instagram: "Kliknięcia Instagrama",
});

export function renderWeeklyAnalyticsReport(report) {
  const hostnameNote = report.filtering?.hostnames?.length
    ? `Aktywny filtr hostname: ${report.filtering.hostnames.join(", ")}.`
    : "Filtr hostname nie jest aktywny (tryb diagnostyczny).";
  const acquisitionRows = report.acquisition.length
    ? report.acquisition.map((row) => `| ${markdownCell(row.channel)} | ${markdownCell(`${row.source} / ${row.medium}`)} | ${formatNumber(row.activeUsers)} | ${formatNumber(row.sessions)} | ${formatNumber(row.screenPageViews)} |`).join("\n")
    : "| Brak danych | — | 0 | 0 | 0 |";
  const dailyRows = report.daily.map((row) => `| ${formatDate(row.date)} | ${formatNumber(row.activeUsers)} | ${formatNumber(row.sessions)} | ${formatNumber(row.screenPageViews)} |`).join("\n");
  const interactionRows = INTERACTION_EVENTS.map((eventName) => `| ${INTERACTION_LABELS[eventName]} | ${formatNumber(report.interactions[eventName])} |`).join("\n");
  const offerRows = report.offers.length
    ? report.offers.map((offer) => `| ${markdownCell(offer.offerId)} | ${formatNumber(offer.views)} | ${formatNumber(offer.galleryOpens)} | ${formatNumber(offer.fullDescriptionOpens)} | ${formatNumber(offer.mapOpens)} | ${formatNumber(offer.phoneClicks)} | ${formatNumber(offer.emailClicks)} |`).join("\n")
    : "| Brak danych | 0 | 0 | 0 | 0 | 0 | 0 |";
  const offerTotals = report.offerTotals || {
    totalOfferViews: report.offers.reduce((total, offer) => total + finiteNumber(offer.views), 0),
    assignedOfferViews: report.offers.reduce((total, offer) => total + finiteNumber(offer.views), 0),
    unassignedOfferViews: 0,
  };

  return [
    "# PropertyCorp — raport tygodniowy",
    "",
    "## Okres",
    formatDateRange(report.period.current),
    `Porównanie: ${formatDateRange(report.period.previous)}`,
    `${hostnameNote} Strefa czasowa: ${report.period.timezone}.`,
    "",
    "## Ruch",
    metricLine("Użytkownicy aktywni", report.traffic.activeUsers),
    metricLine("Sesje", report.traffic.sessions),
    metricLine("Odsłony", report.traffic.screenPageViews),
    metricLine("Zdarzenia", report.traffic.eventCount),
    "",
    "## Źródła ruchu",
    "| Kanał | Źródło / medium | Użytkownicy | Sesje | Odsłony |",
    "| --- | --- | ---: | ---: | ---: |",
    acquisitionRows,
    "",
    "## Aktywność dzień po dniu",
    "| Data | Użytkownicy | Sesje | Odsłony |",
    "| --- | ---: | ---: | ---: |",
    dailyRows,
    "",
    "## Zaangażowanie",
    "| Interakcja | Liczba |",
    "| --- | ---: |",
    interactionRows,
    "",
    "## Oferty",
    "| Offer ID | Wyświetlenia | Galeria | Pełny opis | Mapa | Kliknięcia telefonu | Kliknięcia e-mail |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    offerRows,
    "",
    `Wyświetlenia ofert: ${formatNumber(offerTotals.totalOfferViews)}; przypisane do konkretnych ofert: ${formatNumber(offerTotals.assignedOfferViews)}; nieprzypisane: ${formatNumber(offerTotals.unassignedOfferViews)}.`,
    "",
    "## Uwagi pomiarowe",
    "Dane obejmują ruch zmierzony przez Google Analytics po uzyskaniu wymaganej zgody użytkownika.",
    "",
    "`activeUsers` to użytkownicy zmierzeni przez GA4, nie unikalne możliwe do zidentyfikowania osoby ani adresy IP.",
    "",
    "Kliknięcia numeru telefonu i adresu e-mail są interakcjami w interfejsie, a nie potwierdzonymi połączeniami ani wysłanymi wiadomościami e-mail.",
    "",
  ].join("\n");
}

export function parseDotEnv(text) {
  const result = {};
  String(text || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const separator = normalized.indexOf("=");
    if (separator <= 0) return;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key) result[key] = value;
  });
  return result;
}

export async function loadServerEnvironment({ cwd = process.cwd(), environment = process.env, files = [".env", ".env.local"] } = {}) {
  const inherited = new Set(Object.keys(environment));
  const loaded = [];
  for (const file of files) {
    try {
      const values = parseDotEnv(await readFile(resolve(cwd, file), "utf8"));
      Object.entries(values).forEach(([key, value]) => {
        if (!inherited.has(key)) environment[key] = value;
      });
      loaded.push(file);
    } catch (error) {
      if (error?.code !== "ENOENT") throw new Error(`ga4_report_environment_file_unreadable:${file}`);
    }
  }
  return loaded;
}
