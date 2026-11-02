import React from "react";
import { Info } from "lucide-react";

const DETAIL_LABEL = "Lokalizacja przybliżona";
const DETAIL_EXPLANATION = "Punkt na mapie wskazuje najbliższą okolicę nieruchomości. Dokładny adres udostępni opiekun oferty.";
const MAP_LABEL = "Lokalizacje ofert są przybliżone";
const MAP_EXPLANATION = "Markery wskazują najbliższą okolicę nieruchomości. Dokładny adres może różnić się od punktu widocznego na mapie.";

// The data model currently exposes portal coordinates as approximate. Keeping
// this tiny boundary makes it possible to hide the notice for a future offer
// explicitly published with an exact location.
export function getOfferLocationPrecision(offer) {
  return offer?.locationPrecision === "exact" || offer?.location?.precision === "exact"
    ? "exact"
    : "approximate";
}

export function ApproximateLocationNotice({ precision = "approximate", variant = "detail", className = "" }) {
  if (precision !== "approximate") return null;

  const classes = `approximate-location-notice approximate-location-notice--${variant} ${className}`.trim();

  if (variant === "map") {
    return (
      <details className={classes}>
        <summary>
          <Info aria-hidden="true" />
          <span>{MAP_LABEL}</span>
        </summary>
        <p>{MAP_EXPLANATION}</p>
      </details>
    );
  }

  if (variant === "mini") {
    return <p className={classes}><Info aria-hidden="true" /><span>Lokalizacje przybliżone</span></p>;
  }

  return (
    <aside className={classes} aria-label={DETAIL_LABEL}>
      <span className="approximate-location-notice__badge"><Info aria-hidden="true" />{DETAIL_LABEL}</span>
      <p>{DETAIL_EXPLANATION}</p>
    </aside>
  );
}
