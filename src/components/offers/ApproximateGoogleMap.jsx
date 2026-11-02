import React, { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { loadGoogleMapsJavaScriptApi, PROPERTYCORP_MAP_STYLE } from "./googleMapsLoader.js";

export { loadGoogleMapsJavaScriptApi } from "./googleMapsLoader.js";

function pointPinIcon(maps) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="62" viewBox="0 0 48 62"><defs><filter id="property-pin-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2.6" flood-color="#070b16" flood-opacity=".24"/></filter></defs><g filter="url(#property-pin-shadow)"><path d="M24 2C12.28 2 3 11.32 3 22.98 3 38.61 24 57.5 24 57.5S45 38.61 45 22.98C45 11.32 35.72 2 24 2Z" fill="#22244f" stroke="#dfcfb9" stroke-width="2.2"/><circle cx="24" cy="23" r="5.15" fill="#c7a47b" stroke="#dfcfb9" stroke-width="1.25"/></g></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(42, 54),
    anchor: new maps.Point(21, 52),
  };
}

export function ApproximateGoogleMap({ apiKey, position, title, zoom, mapType = "roadmap" }) {
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const latitude = Number(position?.lat);
  const longitude = Number(position?.lng);
  const hasPublicCenter = Number.isFinite(latitude) && Number.isFinite(longitude);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPublicCenter) {
      setStatus("error");
      return undefined;
    }

    let isMounted = true;
    let pointMarker;
    let mapInstance;
    setStatus("loading");

    loadGoogleMapsJavaScriptApi(apiKey)
      .then((maps) => {
        if (!isMounted) return;

        const center = { lat: latitude, lng: longitude };
        const map = new maps.Map(canvas, {
          center,
          zoom,
          styles: mapType === "hybrid" ? null : PROPERTYCORP_MAP_STYLE,
          backgroundColor: "#e8e3d8",
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          mapTypeId: mapType,
          rotateControl: false,
          scaleControl: false,
          streetViewControl: false,
          zoomControl: true,
          gestureHandling: "cooperative",
        });
        mapInstance = map;
        mapRef.current = map;

        pointMarker = new maps.Marker({ map, position: center, icon: pointPinIcon(maps), zIndex: 3 });
        setStatus("ready");
      })
      .catch(() => {
        if (isMounted) setStatus("error");
      });

    return () => {
      isMounted = false;
      pointMarker?.setMap(null);
      if (mapRef.current === mapInstance) mapRef.current = null;
    };
  }, [apiKey, hasPublicCenter, latitude, longitude, zoom]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    mapRef.current.setOptions({ styles: mapType === "hybrid" ? null : PROPERTYCORP_MAP_STYLE });
    mapRef.current.setMapTypeId(mapType);
  }, [mapType, status]);

  return (
    <div className="offer-map__google-canvas" data-map-renderer="google-javascript" data-map-status={status} data-map-type={mapType} data-map-position={hasPublicCenter ? `${latitude},${longitude}` : undefined} aria-busy={status === "loading"}>
      <div ref={canvasRef} className="offer-map__google-instance" role="region" aria-label={title} />
      {status !== "ready" && <div className={`offer-map__api-status ${status === "error" ? "is-error" : ""}`}>
        <MapPin aria-hidden="true" />
        <span>{status === "error" ? "Nie udało się załadować mapy lokalizacji." : "Ładujemy mapę lokalizacji"}</span>
      </div>}
    </div>
  );
}
