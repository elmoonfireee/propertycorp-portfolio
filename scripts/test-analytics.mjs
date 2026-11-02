import assert from "node:assert/strict";
import {
  analyticsEventParameters,
  createGoogleAnalyticsClient,
  sanitizeAnalyticsEventParameters,
} from "../src/analytics/googleAnalytics.js";

const EVENT_CONTRACT = {
  page_view: ["page_title", "page_location", "page_path"],
  view_offer: ["offer_id", "offer_type", "transaction_type", "offer_location", "price", "area", "rooms", "agent_id"],
  view_offer_gallery: ["offer_id", "image_count"],
  view_full_description: ["offer_id"],
  view_offer_map: ["offer_id", "location_mode"],
  click_agent_phone: ["offer_id", "agent_id"],
  click_agent_email: ["offer_id", "agent_id"],
  submit_offer_inquiry: ["offer_id", "agent_id"],
  map_offer_select: ["offer_id", "map_context"],
  open_full_offers_map: [],
  filter_offers: ["context", "changed_filter", "transaction", "property_type", "location", "rooms"],
  click_similar_offer: ["source_offer_id", "target_offer_id"],
  navigate_offer: ["direction", "source_offer_id", "target_offer_id", "context"],
  click_featured_offer: ["offer_id", "carousel_variant"],
  click_instagram: ["context"],
};

class FakeScript {
  constructor() {
    this.dataset = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

function createFakeBrowser({ pathname = "/", hostname = "demo.example.test" } = {}) {
  const scripts = [];
  const cookies = new Map();
  const location = {
    protocol: "https:",
    hostname,
    pathname,
    search: "",
    get href() { return `https://${hostname}${this.pathname}${this.search}`; },
  };
  const browserDocument = {
    title: "PropertyCorp",
    head: { appendChild: (script) => {
      scripts.push(script);
      script.remove = () => {
        const index = scripts.indexOf(script);
        if (index >= 0) scripts.splice(index, 1);
      };
    } },
    createElement: () => new FakeScript(),
    querySelector: (selector) => selector === 'script[data-propertycorp-analytics="true"]'
      ? scripts.find((script) => script.dataset.propertycorpAnalytics === "true") || null
      : null,
  };
  Object.defineProperty(browserDocument, "cookie", {
    get: () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
    set: (value) => {
      const [first, ...attributes] = String(value).split(";").map((part) => part.trim());
      const separator = first.indexOf("=");
      const name = first.slice(0, separator);
      const cookieValue = first.slice(separator + 1);
      if (attributes.some((attribute) => /^Max-Age=0$/i.test(attribute))) cookies.delete(name);
      else cookies.set(name, cookieValue);
    },
  });
  return { browserDocument, browserWindow: { location }, cookies, scripts };
}

function createClient({
  environment = { VITE_GA_MEASUREMENT_ID: "G-TEST123", DEV: true, VITE_GA_DEBUG: "true" },
  siteEdition = { siteEdition: "client", analyticsEnabled: true },
  ...browserOptions
} = {}) {
  const browser = createFakeBrowser(browserOptions);
  const client = createGoogleAnalyticsClient({
    environment,
    siteEdition,
    ...browser,
  });
  return { ...browser, client };
}

function gaEvents(browserWindow) {
  return (browserWindow.dataLayer || []).filter((entry) => entry[0] === "event");
}

function commandEntries(browserWindow, command) {
  return (browserWindow.dataLayer || []).filter((entry) => entry[0] === command);
}

async function configure(context) {
  const pending = context.client.loadGoogleAnalytics();
  assert.equal(context.scripts.length, 1, "loader appends one central script");
  context.scripts[0].dispatch("load");
  assert.equal(await pending, true, "loader configures GA after the script load event");
}

// PC-08R3 — DebugView is an explicit build-time opt-in, not an implicit
// consequence of Vite development mode. Vercel Preview has DEV=false.
async function configParametersFor(environment) {
  const context = createClient({ environment });
  await configure(context);
  return commandEntries(context.browserWindow, "config")[0][2];
}

const DEBUG_TEST_MEASUREMENT_ID = "G-TEST123";
assert.equal((await configParametersFor({ VITE_GA_MEASUREMENT_ID: DEBUG_TEST_MEASUREMENT_ID, DEV: true, VITE_GA_DEBUG: "true" })).debug_mode, true);
assert.equal((await configParametersFor({ VITE_GA_MEASUREMENT_ID: DEBUG_TEST_MEASUREMENT_ID, DEV: false, VITE_GA_DEBUG: "true" })).debug_mode, true, "Vercel Preview enables DebugView through its explicit build flag");
const previewWithoutDebug = await configParametersFor({ VITE_GA_MEASUREMENT_ID: DEBUG_TEST_MEASUREMENT_ID, DEV: false });
const previewWithDebugFalse = await configParametersFor({ VITE_GA_MEASUREMENT_ID: DEBUG_TEST_MEASUREMENT_ID, DEV: false, VITE_GA_DEBUG: "false" });
const developmentWithoutDebug = await configParametersFor({ VITE_GA_MEASUREMENT_ID: DEBUG_TEST_MEASUREMENT_ID, DEV: true });
assert.equal(Object.hasOwn(previewWithoutDebug, "debug_mode"), false);
assert.equal(Object.hasOwn(previewWithDebugFalse, "debug_mode"), false);
assert.equal(Object.hasOwn(developmentWithoutDebug, "debug_mode"), false);
assert.equal((await configParametersFor({ VITE_GA_MEASUREMENT_ID: DEBUG_TEST_MEASUREMENT_ID, DEV: false, VITE_GA_DEBUG: "1" })).debug_mode, true);

assert.deepEqual(analyticsEventParameters, EVENT_CONTRACT, "event names and allowed parameters are a stable contract");

// A / G — no consent means no loader, transport, event queue or dataLayer.
{
  const context = createClient();
  assert.equal(context.client.trackEvent("view_offer", { offer_id: "17" }), false);
  assert.equal(context.client.trackPageView(), false);
  assert.equal(context.scripts.length, 0);
  assert.equal(context.browserWindow.dataLayer, undefined);
}

// B / D / PC-08R — StrictMode shares one tag, queues Consent Mode v2 in its
// required order, and uses the exact native Arguments queue format from the
// official gtag.js snippet. This deliberately fails if the wrapper is changed
// to (...args) => dataLayer.push(args).
{
  const context = createClient();
  const first = context.client.loadGoogleAnalytics();
  const second = context.client.loadGoogleAnalytics();
  assert.equal(context.scripts.length, 1);
  assert.deepEqual(context.browserWindow.dataLayer.map((entry) => entry[0]), ["consent", "consent", "js", "config"]);
  context.browserWindow.dataLayer.forEach((entry) => {
    assert.equal(Object.prototype.toString.call(entry), "[object Arguments]");
    assert.equal(Array.isArray(entry), false);
  });
  assert.deepEqual(commandEntries(context.browserWindow, "consent")[0][2], {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.equal(commandEntries(context.browserWindow, "consent")[0][1], "default");
  assert.deepEqual(commandEntries(context.browserWindow, "consent")[1][2], {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.equal(commandEntries(context.browserWindow, "consent")[1][1], "update");
  context.scripts[0].dispatch("load");
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(commandEntries(context.browserWindow, "config").length, 1);
  assert.deepEqual(commandEntries(context.browserWindow, "config")[0][2], {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    debug_mode: true,
  });
  assert.equal(context.client.trackPageView(), true);
  assert.deepEqual(
    context.browserWindow.dataLayer.map((entry) => entry[0]),
    ["consent", "consent", "js", "config", "event"],
    "fresh/returning granted users always queue default < update < config < first measurement",
  );
}

// A failed tag can be loaded again after a network error.
{
  const context = createClient();
  const first = context.client.loadGoogleAnalytics();
  context.scripts[0].dispatch("error");
  assert.equal(await first, false);
  assert.equal(context.scripts.length, 0, "failed script is removed before retry");
  const retry = context.client.loadGoogleAnalytics();
  assert.equal(context.scripts.length, 1);
  context.scripts[0].dispatch("load");
  assert.equal(await retry, true);
}

// C — portfolio stays isolated even if its environment contains an ID.
{
  const browser = createFakeBrowser();
  const portfolio = createGoogleAnalyticsClient({
    environment: { VITE_GA_MEASUREMENT_ID: "G-TEST123" },
    siteEdition: { siteEdition: "portfolio", analyticsEnabled: false },
    ...browser,
  });
  assert.equal(await portfolio.loadGoogleAnalytics(), false);
  assert.equal(browser.scripts.length, 0);
  assert.equal(browser.browserWindow.gtag, undefined);
}

// E — each logical route produces one manual page view, while a hash does not.
{
  const context = createClient();
  await configure(context);
  assert.equal(context.client.trackPageView(), true);
  assert.equal(context.client.trackPageView(), false);
  context.browserWindow.location.pathname = "/oferty";
  context.browserDocument.title = "Oferty nieruchomości | PropertyCorp";
  assert.equal(context.client.trackPageView(), true);
  context.browserWindow.location.search = "?transaction=sale";
  assert.equal(context.client.trackPageView(), true);
  assert.equal(gaEvents(context.browserWindow).filter((entry) => entry[1] === "page_view").length, 3);
}

// F — Detail events cannot overtake their current page_view, and StrictMode /
// re-renders cannot duplicate view_offer while a new route can.
{
  const context = createClient({ pathname: "/oferty/test--17" });
  await configure(context);
  const params = { offer_id: "17", offer_type: "apartment", transaction_type: "sale", offer_location: "Popowice", price: 510000, area: 40.5, rooms: 2, agent_id: "osoba-demo-b" };
  assert.equal(context.client.trackOfferView(params), true);
  assert.equal(context.client.trackOfferView(params), false);
  context.browserWindow.location.pathname = "/oferty/other--18";
  assert.equal(context.client.trackOfferView({ ...params, offer_id: "18" }), true);
  const events = gaEvents(context.browserWindow);
  assert.deepEqual(events.map((entry) => entry[1]), ["page_view", "view_offer", "page_view", "view_offer"]);
  assert.equal(events.filter((entry) => entry[1] === "view_offer").length, 2);
}

// H / J — PII, formatted numbers and arbitrary objects cannot enter GA.
assert.deepEqual(
  sanitizeAnalyticsEventParameters("view_offer", {
    offer_id: " 17 ",
    offer_type: "apartment",
    transaction_type: "sale",
    offer_location: "Popowice",
    price: "510 000 zł",
    area: 40.5,
    rooms: Number.NaN,
    agent_id: "osoba-demo-b",
    email: "visitor@example.com",
    phone: "+48123456789",
    message: "private message",
    latitude: 51.1,
    longitude: 17.0,
    rawOffer: { id: "17" },
  }),
  { offer_id: "17", offer_type: "apartment", transaction_type: "sale", offer_location: "Popowice", area: 40.5, agent_id: "osoba-demo-b" },
);
assert.equal(sanitizeAnalyticsEventParameters("unknown_event", {}), null);

// I — withdrawal blocks future hits, clears GA cookies and wins an in-flight race.
{
  const context = createClient();
  const pending = context.client.loadGoogleAnalytics();
  context.client.disableGoogleAnalytics();
  context.scripts[0].dispatch("load");
  assert.equal(await pending, false);
  assert.equal(context.client.isGoogleAnalyticsEnabled(), false);

  const configured = createClient();
  await configure(configured);
  configured.browserDocument.cookie = "_ga=client";
  configured.browserDocument.cookie = "_ga_TEST=client";
  configured.browserDocument.cookie = "pc_consent=keep";
  configured.client.disableGoogleAnalytics();
  const withdrawalUpdate = commandEntries(configured.browserWindow, "consent").at(-1);
  assert.equal(withdrawalUpdate[1], "update");
  assert.deepEqual(withdrawalUpdate[2], {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  assert.equal(configured.client.trackEvent("click_agent_phone", { offer_id: "17", agent_id: "osoba-demo-b" }), false);
  assert.match(configured.browserDocument.cookie, /pc_consent=keep/);
  assert.doesNotMatch(configured.browserDocument.cookie, /(?:^|; )_ga(?:_|=)/);
  assert.equal(configured.browserWindow["ga-disable-G-TEST123"], true);
}

console.log("Analytics: native Arguments queue regression, Consent Mode v2 order, portfolio, duplicate prevention, contract, PII and withdrawal checks passed without real GA network calls.");
