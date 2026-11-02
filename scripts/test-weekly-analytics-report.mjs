import assert from "node:assert/strict";
import {
  aggregateOfferPerformance,
  aggregateOfferTotals,
  buildHostnameFilter,
  buildReportDimensionFilter,
  buildWeeklyAnalyticsReport,
  calculateMetricDelta,
  fillDailyTraffic,
  getWeeklyAnalyticsConfig,
  getWeeklyReportingPeriods,
  normalizeAcquisition,
  parseRunReportRows,
  renderWeeklyAnalyticsReport,
} from "./analytics/weeklyReport.mjs";

function response(dimensions, metrics, rows) {
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name })),
    rows: rows.map(({ dimensionValues = [], metricValues = [] }) => ({
      dimensionValues: dimensionValues.map((value) => ({ value: String(value) })),
      metricValues: metricValues.map((value) => ({ value: String(value) })),
    })),
  };
}

assert.deepEqual(getWeeklyReportingPeriods("2026-09-17"), {
  timezone: "Europe/Warsaw",
  current: { start: "2026-09-07", end: "2026-09-13" },
  previous: { start: "2026-08-31", end: "2026-09-06" },
});
assert.deepEqual(getWeeklyReportingPeriods("2026-09-14").current, { start: "2026-09-07", end: "2026-09-13" }, "Monday excludes its incomplete week");
assert.deepEqual(getWeeklyReportingPeriods("2026-09-13").current, { start: "2026-08-31", end: "2026-09-06" }, "Sunday excludes its incomplete week");
assert.deepEqual(getWeeklyReportingPeriods("2026-03-02").current, { start: "2026-02-23", end: "2026-03-01" }, "month boundary");
assert.deepEqual(getWeeklyReportingPeriods("2026-01-02").current, { start: "2025-12-22", end: "2025-12-28" }, "year boundary");
assert.doesNotThrow(() => getWeeklyReportingPeriods("2024-02-29"));
for (const date of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-00-01"]) {
  assert.throws(() => getWeeklyReportingPeriods(date), /report_reference_date_invalid/);
}

assert.deepEqual(calculateMetricDelta(120, 100), { current: 120, previous: 100, absoluteDelta: 20, percentDelta: 20 });
assert.deepEqual(calculateMetricDelta(5, 0), { current: 5, previous: 0, absoluteDelta: 5, percentDelta: null });
assert.throws(() => getWeeklyAnalyticsConfig({}), /ga4_report_configuration_missing:GA4_PROPERTY_ID,GOOGLE_ANALYTICS_OAUTH_CLIENT_ID,GOOGLE_ANALYTICS_OAUTH_CLIENT_SECRET,GOOGLE_ANALYTICS_OAUTH_REFRESH_TOKEN/);

assert.deepEqual(buildHostnameFilter(" www.demo.example.test,demo.example.test,demo.example.test "), {
  filter: {
    fieldName: "hostName",
    inListFilter: { values: ["demo.example.test", "www.demo.example.test"], caseSensitive: false },
  },
});
assert.deepEqual(buildReportDimensionFilter({ hostnames: ["demo.example.test"], eventNames: ["view_offer", "click_agent_phone"] }), {
  andGroup: {
    expressions: [
      { filter: { fieldName: "hostName", inListFilter: { values: ["demo.example.test"], caseSensitive: false } } },
      { filter: { fieldName: "eventName", inListFilter: { values: ["click_agent_phone", "view_offer"], caseSensitive: true } } },
    ],
  },
});

const parsedRows = parseRunReportRows(response(["eventName", "customEvent:offer_id"], ["eventCount"], [
  { dimensionValues: ["view_offer", "17"], metricValues: ["8"] },
]));
assert.deepEqual(parsedRows, [{ dimensions: { eventName: "view_offer", "customEvent:offer_id": "17" }, metrics: { eventCount: 8 } }]);

const period = { start: "2026-09-07", end: "2026-09-13" };
assert.deepEqual(fillDailyTraffic([
  { dimensions: { date: "20260907" }, metrics: { activeUsers: 3, sessions: 4, screenPageViews: 5 } },
  { dimensions: { date: "20260909" }, metrics: { activeUsers: 1, sessions: 2, screenPageViews: 3 } },
], period), [
  { date: "2026-09-07", activeUsers: 3, sessions: 4, screenPageViews: 5 },
  { date: "2026-09-08", activeUsers: 0, sessions: 0, screenPageViews: 0 },
  { date: "2026-09-09", activeUsers: 1, sessions: 2, screenPageViews: 3 },
  { date: "2026-09-10", activeUsers: 0, sessions: 0, screenPageViews: 0 },
  { date: "2026-09-11", activeUsers: 0, sessions: 0, screenPageViews: 0 },
  { date: "2026-09-12", activeUsers: 0, sessions: 0, screenPageViews: 0 },
  { date: "2026-09-13", activeUsers: 0, sessions: 0, screenPageViews: 0 },
]);

assert.deepEqual(aggregateOfferPerformance([
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "18" }, metrics: { eventCount: 3 } },
  { dimensions: { eventName: "click_agent_phone", "customEvent:offer_id": "17" }, metrics: { eventCount: 2 } },
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "17" }, metrics: { eventCount: 3 } },
  { dimensions: { eventName: "view_offer_gallery", "customEvent:offer_id": "17" }, metrics: { eventCount: 1 } },
]), [
  { offerId: "17", views: 3, galleryOpens: 1, fullDescriptionOpens: 0, mapOpens: 0, phoneClicks: 2, emailClicks: 0 },
  { offerId: "18", views: 3, galleryOpens: 0, fullDescriptionOpens: 0, mapOpens: 0, phoneClicks: 0, emailClicks: 0 },
], "views desc, then offer_id ascending");

assert.deepEqual(aggregateOfferTotals([
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "17" }, metrics: { eventCount: 7 } },
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "(not set)" }, metrics: { eventCount: 3 } },
  { dimensions: { eventName: "view_offer", "customEvent:offer_id": "" }, metrics: { eventCount: 2 } },
  { dimensions: { eventName: "view_offer_gallery", "customEvent:offer_id": "17" }, metrics: { eventCount: 99 } },
]), { totalOfferViews: 12, assignedOfferViews: 7, unassignedOfferViews: 5 }, "unassigned offer views stay visible without fake offer rows");

assert.deepEqual(normalizeAcquisition([
  { dimensions: { sessionDefaultChannelGroup: "Referral", sessionSource: "z", sessionMedium: "referral" }, metrics: { activeUsers: 2, sessions: 4, screenPageViews: 3 } },
  { dimensions: { sessionDefaultChannelGroup: "Organic Search", sessionSource: "a", sessionMedium: "organic" }, metrics: { activeUsers: 2, sessions: 4, screenPageViews: 3 } },
]), [
  { channel: "Organic Search", source: "a", medium: "organic", activeUsers: 2, sessions: 4, screenPageViews: 3 },
  { channel: "Referral", source: "z", medium: "referral", activeUsers: 2, sessions: 4, screenPageViews: 3 },
], "source ordering is deterministic after metric ties");

const requests = [];
const report = await buildWeeklyAnalyticsReport({
  referenceDate: "2026-09-17",
  hostnames: ["demo.example.test"],
  generatedAt: "2026-09-17T12:00:00.000Z",
  runReport: async (request) => {
    requests.push(request);
    const dimensionNames = request.dimensions.map(({ name }) => name);
    if (!dimensionNames.length && request.dateRanges[0].startDate === "2026-09-07") return response([], ["activeUsers", "sessions", "screenPageViews", "eventCount"], [{ metricValues: ["12", "14", "22", "35"] }]);
    if (!dimensionNames.length) return response([], ["activeUsers", "sessions", "screenPageViews", "eventCount"], [{ metricValues: ["0", "10", "20", "25"] }]);
    if (dimensionNames[0] === "sessionDefaultChannelGroup") return response(dimensionNames, ["activeUsers", "sessions", "screenPageViews"], [{ dimensionValues: ["Organic Search", "google", "organic"], metricValues: ["8", "9", "12"] }]);
    if (dimensionNames[0] === "date") return response(dimensionNames, ["activeUsers", "sessions", "screenPageViews"], [{ dimensionValues: ["20260907"], metricValues: ["2", "3", "4"] }]);
    if (dimensionNames.length === 1) return response(dimensionNames, ["eventCount"], [{ dimensionValues: ["view_offer"], metricValues: ["5"] }]);
    return response(dimensionNames, ["eventCount"], [{ dimensionValues: ["view_offer", "17"], metricValues: ["5"] }]);
  },
});

assert.equal(requests.length, 6);
assert.ok(requests.every((request) => JSON.stringify(request.dimensionFilter).includes("hostName")), "every GA4 request uses the centralized hostname filter");
assert.equal(report.daily.length, 7);
assert.equal(report.traffic.activeUsers.percentDelta, null);
assert.deepEqual(report.offers[0], { offerId: "17", views: 5, galleryOpens: 0, fullDescriptionOpens: 0, mapOpens: 0, phoneClicks: 0, emailClicks: 0 });
assert.deepEqual(report.offerTotals, { totalOfferViews: 5, assignedOfferViews: 5, unassignedOfferViews: 0 });
const markdown = renderWeeklyAnalyticsReport(report);
assert.match(markdown, /# PropertyCorp — raport tygodniowy/);
assert.match(markdown, /brak porównywalnej bazy/);
assert.doesNotMatch(markdown, /NaN|Infinity/);

console.log("PC-09 weekly analytics report: dates, filters, parsing, aggregation, rendering and mocked GA4 queries passed.");
