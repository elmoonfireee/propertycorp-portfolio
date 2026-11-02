import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CONSENT,
  clearConsentCookie,
  normalizeConsent,
  readConsentCookie,
  sameConsent,
  writeConsentCookie,
} from "./consentModel.js";
import {
  disableGoogleAnalytics,
  isGoogleAnalyticsLoaded,
  loadGoogleAnalytics,
} from "../analytics/googleAnalytics.js";

const ConsentContext = createContext(null);

function initialConsentState() {
  const stored = readConsentCookie();
  return { consent: stored || normalizeConsent(DEFAULT_CONSENT), hasDecision: Boolean(stored) };
}

function hasLoadedGoogleMaps() {
  if (typeof document === "undefined") return false;
  return Boolean(
    window.google?.maps
    || document.querySelector('script[src*="maps.googleapis.com"], iframe[src*="google.com/maps"]'),
  );
}

export function ConsentProvider({ children }) {
  const initialStateRef = useRef(initialConsentState());
  const [consent, setConsent] = useState(initialStateRef.current.consent);
  const [hasDecision, setHasDecision] = useState(initialStateRef.current.hasDecision);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analyticsReady, setAnalyticsReady] = useState(false);
  const consentRef = useRef(initialStateRef.current.consent);

  if (import.meta.env.DEV && typeof window !== "undefined") {
    window.__PC_CONSENT_DEBUG__ = () => ({
      consent: consentRef.current,
      hasDecision,
      gaLoaded: isGoogleAnalyticsLoaded(),
      mapsLoaded: hasLoadedGoogleMaps(),
    });
  }

  const commitConsent = useCallback((nextValue, { reloadOnWithdrawal = true } = {}) => {
    const previous = consentRef.current;
    const next = normalizeConsent({ ...previous, ...nextValue });
    if (sameConsent(previous, next) && hasDecision) {
      setPreferencesOpen(false);
      return next;
    }

    const analyticsWasLoaded = previous.analytics && !next.analytics && isGoogleAnalyticsLoaded();
    const mapsWereLoaded = previous.externalMedia && !next.externalMedia && hasLoadedGoogleMaps();
    if (previous.analytics && !next.analytics) disableGoogleAnalytics();

    consentRef.current = next;
    writeConsentCookie(next);
    setConsent(next);
    setHasDecision(true);
    setPreferencesOpen(false);

    if (reloadOnWithdrawal && (analyticsWasLoaded || mapsWereLoaded)) {
      window.setTimeout(() => window.location.reload(), 0);
    }
    return next;
  }, [hasDecision]);

  useEffect(() => {
    let cancelled = false;
    if (!consent.analytics) {
      setAnalyticsReady(false);
      return undefined;
    }
    loadGoogleAnalytics().then((loaded) => {
      if (!cancelled) setAnalyticsReady(Boolean(loaded));
    });
    return () => { cancelled = true; };
  }, [consent.analytics]);

  const value = useMemo(() => ({
    consent,
    hasDecision,
    analyticsReady,
    preferencesOpen,
    acceptAll: () => commitConsent({ analytics: true, externalMedia: true }),
    rejectOptional: () => commitConsent({ analytics: false, externalMedia: false }),
    savePreferences: (preferences) => commitConsent(preferences),
    setAnalyticsConsent: (analytics) => commitConsent({ analytics }),
    setExternalMediaConsent: (externalMedia) => commitConsent({ externalMedia }),
    openConsentPreferences: () => setPreferencesOpen(true),
    closeConsentPreferences: () => setPreferencesOpen(false),
    resetConsent: () => {
      const previous = consentRef.current;
      if (previous.analytics) disableGoogleAnalytics();
      consentRef.current = normalizeConsent(DEFAULT_CONSENT);
      clearConsentCookie();
      setConsent(consentRef.current);
      setHasDecision(false);
      setPreferencesOpen(false);
      setAnalyticsReady(false);
    },
  }), [analyticsReady, commitConsent, consent, hasDecision, preferencesOpen]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const value = useContext(ConsentContext);
  if (!value) throw new Error("useConsent must be used within ConsentProvider.");
  return value;
}
