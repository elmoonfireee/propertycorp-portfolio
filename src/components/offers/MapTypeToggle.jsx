import React from "react";

/** Shared PropertyCorp map-layer selector for all interactive Google maps. */
export function MapTypeToggle({ mapType = "roadmap", onChange }) {
  return <div className="map-type-toggle" role="group" aria-label="Widok mapy">
    <button
      className={mapType === "roadmap" ? "is-active" : ""}
      type="button"
      aria-label="Widok mapy"
      aria-pressed={mapType === "roadmap"}
      onClick={() => onChange?.("roadmap")}
    >
      Mapa
    </button>
    <button
      className={mapType === "hybrid" ? "is-active" : ""}
      type="button"
      aria-label="Widok satelitarny"
      aria-pressed={mapType === "hybrid"}
      onClick={() => onChange?.("hybrid")}
    >
      Satelita
    </button>
  </div>;
}
