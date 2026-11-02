import React from "react";
import { MapPin } from "lucide-react";
import { useConsent } from "../../consent/ConsentProvider.jsx";

export function GoogleMapsConsentPlaceholder({ className = "", title = "Mapa Google jest wyłączona" }) {
  const { setExternalMediaConsent } = useConsent();
  return <div className={`google-maps-consent-placeholder ${className}`.trim()} data-map-consent="required">
    <MapPin aria-hidden="true" />
    <strong>{title}</strong>
    <span>Aby zobaczyć lokalizację lub oferty na mapie, zezwól na Mapy i treści zewnętrzne.</span>
    <button type="button" onClick={() => setExternalMediaConsent(true)}>Włącz mapę</button>
  </div>;
}
