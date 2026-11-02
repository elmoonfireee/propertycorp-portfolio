export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE_NAME = "pc_portfolio_demo_consent";
export const CONSENT_MAX_AGE_DAYS = 180;
export const CONSENT_MAX_AGE_SECONDS = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;

export const DEFAULT_CONSENT = Object.freeze({
  necessary: true,
  analytics: false,
  externalMedia: false,
  marketing: false,
});

function asBoolean(value) {
  return value === true;
}

export function normalizeConsent(value = {}) {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: asBoolean(value.analytics),
    externalMedia: asBoolean(value.externalMedia),
    marketing: false,
    timestamp: typeof value.timestamp === "string" && value.timestamp ? value.timestamp : new Date().toISOString(),
  };
}

export function serializeConsent(value) {
  return encodeURIComponent(JSON.stringify(normalizeConsent(value)));
}

export function parseConsentCookie(cookieString = "") {
  const prefix = `${CONSENT_COOKIE_NAME}=`;
  const entry = String(cookieString)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(entry.slice(prefix.length)));
    if (!parsed || Number(parsed.version) !== CONSENT_VERSION || parsed.necessary !== true) return null;
    return normalizeConsent(parsed);
  } catch {
    return null;
  }
}

export function readConsentCookie() {
  if (typeof document === "undefined") return null;
  return parseConsentCookie(document.cookie);
}

export function consentCookieString(value, { secure = false } = {}) {
  const attributes = [
    `${CONSENT_COOKIE_NAME}=${serializeConsent(value)}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function writeConsentCookie(value) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:";
  document.cookie = consentCookieString(value, { secure });
}

export function clearConsentCookie() {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export function sameConsent(left, right) {
  return Boolean(left)
    && Boolean(right)
    && left.analytics === right.analytics
    && left.externalMedia === right.externalMedia
    && left.marketing === right.marketing
    && left.necessary === right.necessary;
}
