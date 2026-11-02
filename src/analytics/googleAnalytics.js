import { siteEditionConfig } from "../config/siteEdition.js";

const runtimeEnv = import.meta.env || {};

// This is the analytics contract. Only values listed here can cross the
// application/GA boundary; callers must select those values explicitly.
const EVENT_PARAMETERS = Object.freeze({
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
});

const NUMERIC_EVENT_PARAMETERS = new Set(["price", "area", "rooms", "image_count"]);
const MAX_EVENT_VALUE_LENGTH = 100;

function googleConsentState(analyticsStorage) {
  return {
    analytics_storage: analyticsStorage,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

function getMeasurementId(environment) {
  return String(environment?.VITE_GA_MEASUREMENT_ID || "").trim();
}

function isAnalyticsDebugEnabled(environment) {
  return /^(1|true)$/i.test(String(environment?.VITE_GA_DEBUG || "").trim());
}

function getGlobalWindow(browserWindow) {
  return browserWindow || (typeof window === "undefined" ? null : window);
}

function getGlobalDocument(browserDocument) {
  return browserDocument || (typeof document === "undefined" ? null : document);
}

/**
 * Returns a newly allocated, safe event payload. Objects, arrays and unknown
 * parameters are deliberately ignored so raw offers/forms cannot be sent by
 * accident. Numeric GA values must arrive as numbers, never formatted labels.
 */
export function sanitizeAnalyticsEventParameters(name, params = {}) {
  const allowed = EVENT_PARAMETERS[name];
  if (!allowed) return null;

  const safeParams = {};
  allowed.forEach((key) => {
    const value = params?.[key];
    if (value == null || value === "") return;

    if (NUMERIC_EVENT_PARAMETERS.has(key)) {
      if (typeof value === "number" && Number.isFinite(value)) safeParams[key] = value;
      return;
    }

    if (typeof value !== "string") return;
    const normalized = value.trim().slice(0, MAX_EVENT_VALUE_LENGTH);
    if (normalized) safeParams[key] = normalized;
  });

  return safeParams;
}

function cookieDomains(browserWindow) {
  const hostname = String(browserWindow?.location?.hostname || "").trim();
  if (!hostname || hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return [""];

  const parts = hostname.split(".").filter(Boolean);
  const domains = new Set([""]);
  for (let index = 0; index < parts.length - 1; index += 1) domains.add(`; Domain=${parts.slice(index).join(".")}`);
  return [...domains];
}

function removeGoogleAnalyticsCookies(browserWindow, browserDocument) {
  if (!browserWindow || !browserDocument?.cookie) return;
  const secure = browserWindow.location?.protocol === "https:" ? "; Secure" : "";
  const cookieNames = String(browserDocument.cookie)
    .split(";")
    .map((value) => value.trim().split("=")[0])
    .filter((name) => name === "_ga" || name === "_gid" || name === "_gat" || name.startsWith("_ga_") || name.startsWith("_gat_"));

  cookieNames.forEach((name) => {
    cookieDomains(browserWindow).forEach((domain) => {
      browserDocument.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain}${secure}`;
    });
  });
}

/**
 * Factory kept dependency-injectable so the analytics contract can be tested
 * entirely with an in-memory DOM. The app uses the singleton below.
 */
export function createGoogleAnalyticsClient({
  environment = runtimeEnv,
  siteEdition = siteEditionConfig,
  browserWindow,
  browserDocument,
  logger = console,
} = {}) {
  const measurementId = getMeasurementId(environment);
  const debugEnabled = isAnalyticsDebugEnabled(environment);
  let loaderPromise = null;
  let configured = false;
  let analyticsEnabled = false;
  let consentGranted = false;
  let loadGeneration = 0;
  let hasWarnedAboutMissingMeasurementId = false;
  let lastPageViewKey = "";
  let lastOfferViewKey = "";
  const eventLog = [];

  const getWindow = () => getGlobalWindow(browserWindow);
  const getDocument = () => getGlobalDocument(browserDocument);
  const canUseAnalytics = () => Boolean(siteEdition?.analyticsEnabled && measurementId);

  const updateDebugState = () => {
    const currentWindow = getWindow();
    if (!debugEnabled || !currentWindow) return;
    currentWindow.__PC_ANALYTICS_DEBUG__ = {
      enabled: analyticsEnabled,
      loaded: configured,
      measurementConfigured: Boolean(measurementId),
      siteEdition: siteEdition?.siteEdition || "unknown",
      consent: consentGranted,
      eventLog: eventLog.map((event) => ({ ...event, params: { ...event.params } })),
    };
  };

  const getGtagScript = () => getDocument()?.querySelector('script[data-propertycorp-analytics="true"]') || null;
  const getGtag = () => {
    const currentWindow = getWindow();
    return typeof currentWindow?.gtag === "function" ? currentWindow.gtag : null;
  };

  const createGtag = () => {
    const currentWindow = getWindow();
    if (!currentWindow) return null;
    currentWindow.dataLayer = currentWindow.dataLayer || [];
    // Keep Google's queue contract exactly: gtag.js reads native Arguments
    // entries from dataLayer. A rest-parameter Array looks similar in a
    // console, but is not the standard gtag transport format.
    currentWindow.gtag = currentWindow.gtag || function propertyCorpGtag() {
      currentWindow.dataLayer.push(arguments);
    };
    return currentWindow.gtag;
  };

  const configureGoogleAnalytics = () => {
    const currentWindow = getWindow();
    if (!currentWindow || configured || !canUseAnalytics() || !consentGranted) return false;
    const gtag = createGtag();
    if (!gtag) return false;

    // Basic consent only: GA is created after an affirmative choice, never
    // before it, so no denied/cookieless pings are generated. Queue the
    // recommended v2 default first, then the stored affirmative decision,
    // before js/config or any measurement command.
    currentWindow[`ga-disable-${measurementId}`] = false;
    gtag("consent", "default", googleConsentState("denied"));
    gtag("consent", "update", googleConsentState("granted"));
    gtag("js", new Date());
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      ...(debugEnabled ? { debug_mode: true } : {}),
    });
    configured = true;
    analyticsEnabled = true;
    updateDebugState();
    return true;
  };

  const loadGoogleAnalytics = () => {
    const currentWindow = getWindow();
    const currentDocument = getDocument();
    if (!currentWindow || !currentDocument || !siteEdition?.analyticsEnabled) return Promise.resolve(false);
    if (!measurementId) {
      if (environment?.DEV && !hasWarnedAboutMissingMeasurementId) {
        hasWarnedAboutMissingMeasurementId = true;
        logger.warn?.("[PropertyCorp analytics] VITE_GA_MEASUREMENT_ID is missing; GA4 remains disabled.");
      }
      return Promise.resolve(false);
    }

    consentGranted = true;
    updateDebugState();
    if (configured) {
      currentWindow[`ga-disable-${measurementId}`] = false;
      analyticsEnabled = true;
      updateDebugState();
      return Promise.resolve(true);
    }
    if (loaderPromise) return loaderPromise;

    const requestGeneration = ++loadGeneration;
    // Initialise the dataLayer before loading gtag.js, as in Google's own
    // asynchronous snippet. This still happens only after affirmative consent.
    if (!configureGoogleAnalytics()) return Promise.resolve(false);
    loaderPromise = new Promise((resolve, reject) => {
      const complete = () => {
        // Withdrawal may happen while the script is in flight. Do not turn GA
        // back on after that decision.
        if (requestGeneration !== loadGeneration || !consentGranted) {
          resolve(false);
          return;
        }
        resolve(true);
      };
      const fail = (script) => {
        script.remove();
        reject(new Error("Google Analytics could not load."));
      };
      const existing = getGtagScript();
      if (existing) {
        if (existing.dataset.propertycorpLoaded === "true") complete();
        else {
          existing.addEventListener("load", complete, { once: true });
          existing.addEventListener("error", () => fail(existing), { once: true });
        }
        return;
      }

      const script = currentDocument.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      script.dataset.propertycorpAnalytics = "true";
      script.addEventListener("load", () => {
        script.dataset.propertycorpLoaded = "true";
        complete();
      }, { once: true });
      script.addEventListener("error", () => fail(script), { once: true });
      currentDocument.head.appendChild(script);
    }).catch((error) => {
      loaderPromise = null;
      configured = false;
      analyticsEnabled = false;
      currentWindow[`ga-disable-${measurementId}`] = true;
      updateDebugState();
      if (environment?.DEV) logger.warn?.("[PropertyCorp analytics]", error.message);
      return false;
    });

    return loaderPromise;
  };

  const isGoogleAnalyticsLoaded = () => Boolean(siteEdition?.analyticsEnabled && configured);
  const isGoogleAnalyticsEnabled = () => Boolean(analyticsEnabled && getGtag());
  const hasGoogleAnalyticsMeasurementId = () => canUseAnalytics();

  const trackEvent = (name, params = {}) => {
    if (!isGoogleAnalyticsEnabled()) return false;
    const safeParams = sanitizeAnalyticsEventParameters(name, params);
    if (!safeParams) {
      if (environment?.DEV) logger.warn?.(`[PropertyCorp analytics] Ignored unknown event: ${name}`);
      return false;
    }
    getGtag()("event", name, safeParams);
    if (debugEnabled) {
      eventLog.push({ name, params: safeParams });
      if (eventLog.length > 100) eventLog.shift();
      updateDebugState();
    }
    return true;
  };

  const currentPageKey = () => {
    const location = getWindow()?.location;
    if (!location) return "";
    // In-page anchors are not logical SPA routes and must not inflate views.
    return `${location.pathname || ""}${location.search || ""}`;
  };

  const trackPageView = () => {
    const currentWindow = getWindow();
    const currentDocument = getDocument();
    const key = currentPageKey();
    if (!key || key === lastPageViewKey || !currentWindow || !currentDocument) return false;
    const sent = trackEvent("page_view", {
      page_title: currentDocument.title,
      page_location: currentWindow.location.href,
      page_path: `${currentWindow.location.pathname || ""}${currentWindow.location.search || ""}`,
    });
    if (sent) lastPageViewKey = key;
    return sent;
  };

  const trackOfferView = (params) => {
    const key = `${currentPageKey()}::${params?.offer_id || ""}`;
    if (!key || key === lastOfferViewKey) return false;
    // Detail-page effects may run before the route tracker frame. Ensure the
    // current SPA view is represented before its corresponding offer view;
    // the route tracker will then be a harmless deduplicated no-op.
    trackPageView();
    const sent = trackEvent("view_offer", params);
    if (sent) lastOfferViewKey = key;
    return sent;
  };

  const disableGoogleAnalytics = () => {
    const currentWindow = getWindow();
    const gtag = getGtag();
    // A tag can only receive a withdrawal after it was previously allowed to
    // load. Queue that change before locally disabling all future tracking and
    // performing the existing controlled reload.
    if (configured && gtag) gtag("consent", "update", googleConsentState("denied"));
    consentGranted = false;
    analyticsEnabled = false;
    loadGeneration += 1;
    if (currentWindow && measurementId) currentWindow[`ga-disable-${measurementId}`] = true;
    removeGoogleAnalyticsCookies(currentWindow, getDocument());
    lastPageViewKey = "";
    lastOfferViewKey = "";
    updateDebugState();
  };

  return {
    disableGoogleAnalytics,
    hasGoogleAnalyticsMeasurementId,
    isGoogleAnalyticsEnabled,
    isGoogleAnalyticsLoaded,
    loadGoogleAnalytics,
    trackEvent,
    trackOfferView,
    trackPageView,
  };
}

const googleAnalytics = createGoogleAnalyticsClient();

export const hasGoogleAnalyticsMeasurementId = googleAnalytics.hasGoogleAnalyticsMeasurementId;
export const isGoogleAnalyticsLoaded = googleAnalytics.isGoogleAnalyticsLoaded;
export const isGoogleAnalyticsEnabled = googleAnalytics.isGoogleAnalyticsEnabled;
export const loadGoogleAnalytics = googleAnalytics.loadGoogleAnalytics;
export const trackEvent = googleAnalytics.trackEvent;
export const trackOfferView = googleAnalytics.trackOfferView;
export const trackPageView = googleAnalytics.trackPageView;
export const disableGoogleAnalytics = googleAnalytics.disableGoogleAnalytics;
export const analyticsEventParameters = EVENT_PARAMETERS;
