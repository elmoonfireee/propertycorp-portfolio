import assert from "node:assert/strict";
import { fetchJsonWithTimeout } from "../server/fetchJsonWithTimeout.mjs";
import { createGoogleReviewsService } from "../server/googleReviewsService.mjs";
import { createGoogleAnalyticsDataClient } from "./analytics/weeklyReport.mjs";

for (const stall of ["headers", "body"]) {
  let signal;
  const fakeFetch = async (_url, options) => {
    signal = options.signal;
    if (stall === "headers") return new Promise(() => {});
    return { ok: true, json: () => new Promise(() => {}) };
  };
  await assert.rejects(
    () => fetchJsonWithTimeout(fakeFetch, "https://example.test", {}, { timeoutMs: 20, errorPrefix: "test" }),
    /test:timeout/,
  );
  assert.equal(signal.aborted, true);
}
await assert.rejects(
  () => fetchJsonWithTimeout(async () => ({ ok: false, status: 503 }), "https://example.test", {}, { timeoutMs: 20, errorPrefix: "test" }),
  /test:503/,
);

const stalledBody = async () => ({ ok: true, json: () => new Promise(() => {}) });
const reviews = createGoogleReviewsService({
  environment: {
    GOOGLE_BUSINESS_ACCOUNT_ID: "test", GOOGLE_BUSINESS_CLIENT_ID: "test", GOOGLE_BUSINESS_CLIENT_SECRET: "test",
    GOOGLE_BUSINESS_LOCATION_ID: "test", GOOGLE_BUSINESS_REFRESH_TOKEN: "test",
  },
  fetchImpl: stalledBody,
  requestTimeoutMs: 20,
  logger: { error() {} },
});
assert.equal((await reviews.getResponse()).status, 204);

const analytics = createGoogleAnalyticsDataClient({ clientId: "test", clientSecret: "test", refreshToken: "test", propertyId: "1" }, {
  fetchImplementation: stalledBody,
  requestTimeoutMs: 20,
});
await assert.rejects(() => analytics.runReport({}), /ga4_report_oauth_refresh_failed:timeout/);

console.log("Fetch timeout: stalled headers and bodies, status errors, Reviews and GA4 passed.");
