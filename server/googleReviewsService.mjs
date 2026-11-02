import { fetchJsonWithTimeout } from "./fetchJsonWithTimeout.mjs";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVIEWS_API_ROOT = "https://mybusiness.googleapis.com/v4";
export const GOOGLE_REVIEWS_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=21600";
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REVIEW_PAGES = 100;

const GOOGLE_RATINGS = Object.freeze({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 });

function getConfig(environment) {
  return {
    accountId: environment.GOOGLE_BUSINESS_ACCOUNT_ID?.trim(),
    clientId: environment.GOOGLE_BUSINESS_CLIENT_ID?.trim(),
    clientSecret: environment.GOOGLE_BUSINESS_CLIENT_SECRET?.trim(),
    locationId: environment.GOOGLE_BUSINESS_LOCATION_ID?.trim(),
    refreshToken: environment.GOOGLE_BUSINESS_REFRESH_TOKEN?.trim(),
    reviewsUrl: environment.GOOGLE_BUSINESS_REVIEWS_URL?.trim() || null,
  };
}

function hasCredentials(config) {
  return Boolean(config.accountId && config.clientId && config.clientSecret && config.locationId && config.refreshToken);
}

function isProduction(environment) {
  return environment.VERCEL_ENV === "production" || environment.NODE_ENV === "production";
}

function logServerError(logger, message, metadata = {}) {
  // Never include tokens, secrets, authorization headers or raw OAuth payloads.
  logger?.error?.(`[google-reviews] ${message}`, metadata);
}

function normalizeRating(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5) return value;
  return GOOGLE_RATINGS[String(value || "").toUpperCase()] || null;
}

export function cleanGoogleReviewText(value) {
  if (typeof value !== "string") return "";
  const translationMarkerIndex = value.search(/\(translated by google\)/i);
  return translationMarkerIndex === -1 ? value : value.slice(0, translationMarkerIndex).trimEnd();
}

export function normalizeGoogleReview(review) {
  const text = cleanGoogleReviewText(review?.comment);
  const rating = normalizeRating(review?.starRating);
  if (!text.trim() || !rating) return null;
  return {
    id: String(review.reviewId || review.name || "").trim(),
    author: String(review.reviewer?.displayName || "Użytkownik Google").trim() || "Użytkownik Google",
    rating,
    text,
    createdAt: review.createTime || null,
    updatedAt: review.updateTime || null,
  };
}

async function getAccessToken(fetchImpl, config, timeoutMs) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  });
  const payload = await fetchJsonWithTimeout(fetchImpl, GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, { timeoutMs, errorPrefix: "oauth_refresh_failed" });
  if (!payload?.access_token) throw new Error("oauth_refresh_missing_access_token");
  return payload.access_token;
}

async function getAllReviews(fetchImpl, config, accessToken, timeoutMs) {
  const reviews = [];
  let pageToken = null;
  let averageRating = null;
  let totalReviewCount = null;
  for (let page = 0; page < MAX_REVIEW_PAGES; page += 1) {
    const params = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) params.set("pageToken", pageToken);
    const endpoint = `${GOOGLE_REVIEWS_API_ROOT}/accounts/${encodeURIComponent(config.accountId)}/locations/${encodeURIComponent(config.locationId)}/reviews?${params}`;
    const payload = await fetchJsonWithTimeout(fetchImpl, endpoint, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs, errorPrefix: "reviews_request_failed" });
    if (averageRating == null && Number.isFinite(Number(payload.averageRating))) averageRating = Number(payload.averageRating);
    if (totalReviewCount == null && Number.isFinite(Number(payload.totalReviewCount))) totalReviewCount = Number(payload.totalReviewCount);
    reviews.push(...(payload.reviews || []).map(normalizeGoogleReview).filter(Boolean));
    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }
  return { averageRating, totalReviewCount, reviews };
}

/** Shared Vercel/Node-runtime Google Business Profile service. */
export function createGoogleReviewsService({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = () => Date.now(),
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  let cached = null;
  return {
    async getResponse() {
      const config = getConfig(environment);
      if (!hasCredentials(config)) {
        if (!isProduction(environment)) logServerError(logger, "Business Profile credentials are not configured.");
        return { status: 204, headers: { "Cache-Control": "no-store" }, body: null };
      }
      if (cached && cached.expiresAt > now()) return cached.response;
      if (typeof fetchImpl !== "function") return { status: 204, headers: { "Cache-Control": "no-store" }, body: null };
      try {
        const accessToken = await getAccessToken(fetchImpl, config, requestTimeoutMs);
        const data = await getAllReviews(fetchImpl, config, accessToken, requestTimeoutMs);
        const response = {
          status: 200,
          headers: { "Cache-Control": GOOGLE_REVIEWS_CACHE_CONTROL },
          body: { averageRating: data.averageRating, totalReviewCount: data.totalReviewCount, reviews: data.reviews, reviewsUrl: config.reviewsUrl },
        };
        cached = { expiresAt: now() + CACHE_TTL_MS, response };
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        logServerError(logger, "Google Business Profile request failed.", { message });
        return { status: 204, headers: { "Cache-Control": "no-store" }, body: null };
      }
    },
  };
}
