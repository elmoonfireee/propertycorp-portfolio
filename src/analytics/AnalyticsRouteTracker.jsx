import { useEffect, useState } from "react";
import { trackPageView } from "./googleAnalytics.js";
import { useConsent } from "../consent/ConsentProvider.jsx";

function currentRoute() {
  // A hash only changes an in-page anchor; it is not a new SPA page.
  return `${window.location.pathname}${window.location.search}`;
}

export function AnalyticsRouteTracker() {
  const { consent, analyticsReady } = useConsent();
  const [route, setRoute] = useState(() => (typeof window === "undefined" ? "" : currentRoute()));

  useEffect(() => {
    const update = () => setRoute(currentRoute());
    const notify = () => window.dispatchEvent(new Event("propertycorp:navigation"));
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      notify();
      return result;
    };
    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      notify();
      return result;
    };
    window.addEventListener("popstate", update);
    window.addEventListener("propertycorp:navigation", update);
    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", update);
      window.removeEventListener("propertycorp:navigation", update);
    };
  }, []);

  useEffect(() => {
    if (!consent.analytics || !analyticsReady || !route) return undefined;
    // SEO hooks run in the route subtree. A frame gives them time to update
    // document.title and collapses superseded rapid navigations to the actual
    // current route before its single manual page_view is emitted.
    const frame = window.requestAnimationFrame(() => trackPageView());
    return () => window.cancelAnimationFrame(frame);
  }, [analyticsReady, consent.analytics, route]);

  return null;
}
