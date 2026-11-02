import assert from "node:assert/strict";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  consentCookieString,
  normalizeConsent,
  parseConsentCookie,
  sameConsent,
} from "../src/consent/consentModel.js";
import { analyticsEventParameters } from "../src/analytics/googleAnalytics.js";

const granted = normalizeConsent({ analytics: true, externalMedia: true });
assert.equal(granted.version, CONSENT_VERSION);
assert.equal(granted.necessary, true);
assert.equal(granted.analytics, true);
assert.equal(granted.externalMedia, true);
assert.equal(granted.marketing, false);

const cookie = consentCookieString(granted, { secure: true });
assert.match(cookie, new RegExp(`^${CONSENT_COOKIE_NAME}=`));
assert.match(cookie, new RegExp(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`));
assert.match(cookie, /Path=\//);
assert.match(cookie, /SameSite=Lax/);
assert.match(cookie, /Secure/);
assert.deepEqual(parseConsentCookie(cookie), granted);
assert.equal(parseConsentCookie(`${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ necessary: true }))}`), null);
assert.equal(sameConsent(DEFAULT_CONSENT, normalizeConsent(DEFAULT_CONSENT)), true);
assert.equal(sameConsent(DEFAULT_CONSENT, granted), false);

assert.deepEqual(analyticsEventParameters.view_offer, ["offer_id", "offer_type", "transaction_type", "offer_location", "price", "area", "rooms", "agent_id"]);
assert.deepEqual(analyticsEventParameters.click_agent_phone, ["offer_id", "agent_id"]);
assert.ok(!Object.values(analyticsEventParameters).flat().some((key) => /name|email|phone|message|address|latitude|longitude|ip/i.test(key)));

console.log("Consent model and analytics schema checks passed.");
