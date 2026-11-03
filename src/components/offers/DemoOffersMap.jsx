import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Maximize2, Minimize2 } from "lucide-react";
import { groupOffersByMapPosition } from "../../domain/offers/offerMapPosition.js";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import "leaflet/dist/leaflet.css";

/** Portfolio-only map: all displayed positions are illustrative. */
export function DemoOffersMap({ offers, title, className = "", mapMode = "inline", isFullscreen = false, onToggleFullscreen }) {
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const groups = useMemo(() => groupOffersByMapPosition(offers), [offers]);

  useEffect(() => {
    let cancelled = false;
    let map;
    if (!groups.length) {
      setStatus("empty");
      return undefined;
    }
    setStatus("loading");
    import("leaflet").then((module) => {
      if (cancelled || !canvasRef.current) return;
      const L = module.default || module;
      map = L.map(canvasRef.current, { scrollWheelZoom: mapMode === "modal", zoomControl: true });
      mapRef.current = map;
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      let loaded = false;
      tiles.on("tileload", () => { loaded = true; if (!cancelled) setStatus("ready"); });
      tiles.on("tileerror", () => { if (!loaded && !cancelled) setStatus("error"); });
      const icon = L.divIcon({ className: "demo-map-pin", html: '<span aria-hidden="true"></span>', iconSize: [30, 40], iconAnchor: [15, 40] });
      for (const group of groups) {
        const content = document.createElement("div");
        content.className = "demo-map-popup";
        const label = document.createElement("strong");
        label.textContent = "Fikcyjne oferty — lokalizacja poglądowa";
        content.append(label);
        for (const offer of group.offers) {
          const link = document.createElement("a");
          link.href = buildOfferPath(offer);
          link.textContent = offer.title;
          content.append(link);
        }
        L.marker([group.position.lat, group.position.lng], { icon, title: group.offers.map((offer) => offer.title).join(", ") }).addTo(map).bindPopup(content);
      }
      const bounds = L.latLngBounds(groups.map(({ position }) => [position.lat, position.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; if (mapRef.current === map) mapRef.current = null; map?.remove(); };
  }, [groups, mapMode]);

  useEffect(() => {
    const observer = typeof ResizeObserver === "undefined" || !canvasRef.current ? null : new ResizeObserver(() => mapRef.current?.invalidateSize());
    if (observer) observer.observe(canvasRef.current);
    mapRef.current?.invalidateSize();
    return () => observer?.disconnect();
  }, [isFullscreen]);

  return <div className={`property-map property-map--${mapMode} demo-map ${className}`} data-map-provider="openstreetmap" data-map-status={status}>
    <div ref={canvasRef} className="property-map__canvas" role="region" aria-label={title || "Mapa fikcyjnych ofert"} />
    {status !== "ready" && <div className={`property-map__status${status === "error" ? " is-error" : ""}`} role="status"><MapPin aria-hidden="true" /><span>{status === "error" ? "Nie udało się pobrać mapy. Sprawdź połączenie z internetem." : status === "empty" ? "Brak ofert na mapie." : "Przygotowujemy mapę ofert…"}</span></div>}
    {onToggleFullscreen && <div className="property-map__view-controls"><button className="property-map__fullscreen-control" type="button" onClick={onToggleFullscreen} aria-label={isFullscreen ? "Wyjdź z pełnego ekranu" : "Pokaż mapę na pełnym ekranie"}>{isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}</button></div>}
  </div>;
}
