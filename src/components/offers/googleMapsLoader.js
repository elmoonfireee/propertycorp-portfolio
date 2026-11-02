const GOOGLE_MAPS_SCRIPT_ID = "propertycorp-google-maps-javascript-api";
const GOOGLE_MAPS_CALLBACK = "__propertycorpGoogleMapsReady";
const GOOGLE_MAPS_TIMEOUT = 20000;
let googleMapsLoader;

export const PROPERTYCORP_MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ color: "#e8e3d8" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#555967" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f4ec" }, { weight: 3 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fbf9f3" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ded8ca" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfd8dc" }] },
];

function mapsAreReady() {
  return Boolean(window.google?.maps?.Map && window.google?.maps?.Circle);
}

/**
 * Single lazy loader shared by the offer detail map and the homepage map.
 * `loading=async` prevents the direct-script warning emitted by Google Maps.
 */
export function loadGoogleMapsJavaScriptApi(apiKey) {
  if (!apiKey || typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Google Maps JavaScript API key is unavailable."));
  }
  if (mapsAreReady()) return Promise.resolve(window.google.maps);
  if (googleMapsLoader) return googleMapsLoader;

  googleMapsLoader = new Promise((resolve, reject) => {
    let settled = false;
    let readinessTimer;
    const clearReadinessTimer = () => {
      if (readinessTimer != null) window.clearTimeout(readinessTimer);
      readinessTimer = undefined;
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearReadinessTimer();
      googleMapsLoader = undefined;
      delete window[GOOGLE_MAPS_CALLBACK];
      const error = new Error(message);
      if (import.meta.env.DEV) console.error("[Maps] loader failed", error);
      reject(error);
    };
    const complete = () => {
      if (settled || !mapsAreReady()) return false;
      settled = true;
      clearReadinessTimer();
      delete window[GOOGLE_MAPS_CALLBACK];
      resolve(window.google.maps);
      return true;
    };
    const waitForReadiness = (startedAt = Date.now()) => {
      if (settled) return;
      if (complete()) return;
      if (Date.now() - startedAt >= GOOGLE_MAPS_TIMEOUT) {
        fail("Google Maps JavaScript API did not initialise in time.");
        return;
      }
      readinessTimer = window.setTimeout(() => waitForReadiness(startedAt), 40);
    };
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);

    // `loading=async` intentionally decouples script.onload from Maps API
    // readiness. Google invokes this callback only after `google.maps` is
    // available; the small readiness check also handles an already appended
    // script during React StrictMode remounts.
    window[GOOGLE_MAPS_CALLBACK] = () => complete();

    if (existingScript) {
      existingScript.addEventListener("load", () => waitForReadiness(), { once: true });
      existingScript.addEventListener("error", () => fail("Google Maps JavaScript API could not load."), { once: true });
      waitForReadiness();
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&language=pl&region=PL&loading=async&callback=${GOOGLE_MAPS_CALLBACK}`;
    script.addEventListener("load", () => waitForReadiness(), { once: true });
    script.addEventListener("error", () => fail("Google Maps JavaScript API could not load."), { once: true });
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}
