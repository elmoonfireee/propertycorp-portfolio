import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronDown, MapPin, Maximize2, Minimize2, X } from "lucide-react";
import { DEFAULT_OFFER_FILTERS, filterOffers, sortOffers } from "../../domain/offers/offerFilters.js";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import {
  formatArea,
  formatPrice,
  formatRoomCount,
  getOfferPublicLocationPresentation,
} from "../../domain/offers/offerPresentation.js";
import { getOfferMapPositionKey, resolveOfferMapPosition } from "../../domain/offers/offerMapPosition.js";
import {
  getListingFacets,
  ROOM_OPTIONS,
  TRANSACTION_OPTIONS,
} from "../../domain/offers/offerListing.js";
import { MultiSelectFilter } from "./OffersFilters.jsx";
import { BrandMark } from "../layout/BrandMark.jsx";
import { loadGoogleMapsJavaScriptApi, PROPERTYCORP_MAP_STYLE } from "./googleMapsLoader.js";
import { GoogleMapsConsentPlaceholder } from "../consent/GoogleMapsConsentPlaceholder.jsx";
import { useConsent } from "../../consent/ConsentProvider.jsx";
import { trackEvent } from "../../analytics/googleAnalytics.js";
import { MapTypeToggle } from "./MapTypeToggle.jsx";
import { ApproximateLocationNotice } from "./ApproximateLocationNotice.jsx";
import { isPortfolioEdition } from "../../config/siteEdition.js";
import { DemoOffersMap } from "./DemoOffersMap.jsx";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim()
  || import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY?.trim();
const HOVER_GRACE_PERIOD = 360;

function getMapOffers(offers) {
  return offers.flatMap((offer) => {
    const presentation = getOfferPublicLocationPresentation(offer);
    const position = resolveOfferMapPosition(offer);
    if (!position) return [];
    const street = String(offer?.location?.street || "").trim();
    const locality = String(offer?.location?.locality || offer?.location?.municipality || "").trim();
    const publicHeading = [street, locality]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join(" · ") || presentation.heading;
    return [{ offer, presentation: { ...presentation, heading: publicHeading }, position }];
  });
}

function getMapGroups(offers) {
  const groups = new Map();
  getMapOffers(offers).forEach((entry) => {
    const { presentation, position } = entry;
    // Only byte-for-byte equivalent numeric IMO positions share one marker.
    // Nearby listings stay separate: a same-location group is not a cluster.
    const key = getOfferMapPositionKey(position);
    const group = groups.get(key) || {
      id: `property-map-group-${groups.size + 1}`,
      position,
      presentation,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    // `offers` can be sorted by the modal filters. Preserve that order so the
    // grouped preview follows the sorting selected by the visitor.
    entries: group.entries,
  }));
}

function propertyPinIcon(maps, state = "idle", count = 1) {
  const scale = state === "selected" ? 1.12 : state === "hover" ? 1.08 : 1;
  const width = Math.round(68 * scale);
  const height = Math.round(64 * scale);
  const stroke = state === "selected" ? "#f4e5ce" : "#dfcfb9";
  const ring = state === "selected"
    ? '<circle cx="24" cy="24" r="21.25" fill="none" stroke="#c7a47b" stroke-width="2.5" opacity=".92"/>'
    : "";
  const shadow = state === "idle" ? ".22" : ".34";
  const badge = count > 1
    ? `<g filter="url(#s)"><circle cx="56" cy="13" r="10.5" fill="#dfcfb9" stroke="#c7a47b" stroke-width="1.4"/><text x="56" y="16.35" fill="#22244f" font-family="Arial, sans-serif" font-size="10.5" font-weight="700" text-anchor="middle">${count}</text></g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="64" viewBox="0 0 68 64"><defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2.6" flood-color="#070b16" flood-opacity="${shadow}"/></filter></defs><g filter="url(#s)">${ring}<path d="M24 2C12.28 2 3 11.32 3 22.98 3 38.61 24 57.5 24 57.5S45 38.61 45 22.98C45 11.32 35.72 2 24 2Z" fill="#22244f" stroke="${stroke}" stroke-width="2.2"/><circle cx="24" cy="23" r="5.15" fill="#c7a47b" stroke="#dfcfb9" stroke-width="1.25"/></g>${badge}</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(width, height),
    anchor: new maps.Point(Math.round(width * (24 / 68)), Math.round(height * (57.5 / 64))),
  };
}

function hasNativeCtrlHint(canvas) {
  const copy = canvas?.textContent || "";
  return /(?:ctrl|control).{0,36}(?:scroll|przewij|zoom)|(?:scroll|przewij|zoom).{0,36}(?:ctrl|control)/i.test(copy);
}

function supportsDesktopPointer() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

function formatPreviewTitle(title) {
  return String(title || "")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function OfferPreview({ group, activeIndex, pinned, onClose, onChangeEntry, onMouseEnter, onMouseLeave, onSelectOffer }) {
  const entry = group?.entries[activeIndex];
  if (!entry) return null;
  const { offer, presentation } = entry;
  const image = offer.images?.[0];
  const previewTitle = formatPreviewTitle(offer.title);
  const facts = [formatArea(offer.area), formatRoomCount(offer.rooms)].filter(Boolean);
  const price = formatPrice(offer);
  const hasMultipleOffers = group.entries.length > 1;
  return (
    <article className={`property-map-preview${pinned ? " is-pinned" : ""}`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {pinned && <button className="property-map-preview__close" type="button" onClick={onClose} aria-label="Zamknij podgląd oferty"><X aria-hidden="true" /></button>}
      <a className="property-map-preview__hit-area" href={buildOfferPath(offer)} aria-label={`Zobacz szczegóły: ${offer.title}`} onClick={() => onSelectOffer(offer)}>
        <div className="property-map-preview__image">
          <div className="property-map-preview__media-transition" key={`map-preview-media-${offer.id}`}>
            {image
              ? <img src={image.url} alt="" loading="lazy" />
              : <div className="property-map-preview__fallback" aria-hidden="true"><BrandMark className="property-map-preview__fallback-brand" tone="dark" /></div>}
          </div>
        </div>
        <div className="property-map-preview__content" key={`map-preview-content-${offer.id}`}>
          <p><MapPin aria-hidden="true" />{presentation.heading}</p>
          {hasMultipleOffers && <span className="property-map-preview__group-count">{group.entries.length} ofert w tej lokalizacji</span>}
          <h3>{previewTitle}</h3>
          <div className="property-map-preview__facts">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div>
          <strong className="property-map-preview__price">{price}</strong>
          <span className="property-map-preview__cta">Zobacz szczegóły <ArrowRight aria-hidden="true" /></span>
        </div>
      </a>
      {hasMultipleOffers && <div className="property-map-preview__group-navigation" aria-label="Przeglądaj oferty w tej lokalizacji">
        <span>{activeIndex + 1} / {group.entries.length}</span>
        <button type="button" onClick={() => onChangeEntry(-1)} aria-label="Poprzednia oferta w tej lokalizacji"><ArrowLeft aria-hidden="true" /></button>
        <button type="button" onClick={() => onChangeEntry(1)} aria-label="Następna oferta w tej lokalizacji"><ArrowRight aria-hidden="true" /></button>
      </div>}
    </article>
  );
}

function MapFallback({ error }) {
  return <div className={`property-map__status${error ? " is-error" : ""}`}><MapPin aria-hidden="true" /><span>{error ? "Mapa jest chwilowo niedostępna." : "Przygotowujemy mapę ofert"}</span></div>;
}

/** Shared interactive surface for the homepage and the full-screen modal. */
export function OffersInteractiveMap({
  offers,
  title = "Mapa aktualnych ofert PropertyCorp",
  immediate = false,
  className = "",
  mapMode = "inline",
  isFullscreen = false,
  onToggleFullscreen,
}) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const timerRef = useRef(null);
  const ctrlHintTimerRef = useRef(null);
  const selectedGroupIdRef = useRef(null);
  const mapObjectsRef = useRef(new Map());
  const [isNear, setIsNear] = useState(immediate);
  const [status, setStatus] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [showCtrlHint, setShowCtrlHint] = useState(false);
  const [mapType, setMapType] = useState("roadmap");
  const mapGroups = useMemo(() => getMapGroups(offers), [offers]);

  // A filtered result set has its own markers and group composition. Never
  // keep a preview around when the collection it was built from changes.
  useEffect(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    selectedGroupIdRef.current = null;
    setPreview(null);
  }, [mapGroups]);

  const clearHideTimer = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const clearCtrlHintTimer = () => {
    if (ctrlHintTimerRef.current != null) window.clearTimeout(ctrlHintTimerRef.current);
    ctrlHintTimerRef.current = null;
  };

  const setMapObjectState = (groupId, state = "idle") => {
    const object = mapObjectsRef.current.get(groupId);
    if (!object) return;
    object.marker.setIcon(object.icons[state]);
    object.marker.setZIndex(state === "selected" ? 8 : state === "hover" ? 6 : object.baseZIndex);
  };

  const resetMapObjectStates = () => {
    mapObjectsRef.current.forEach((_, groupId) => setMapObjectState(groupId));
  };

  const clearActivePreview = () => {
    clearHideTimer();
    selectedGroupIdRef.current = null;
    resetMapObjectStates();
    setPreview(null);
  };

  const showHoverPreview = (group) => {
    if (selectedGroupIdRef.current) return;
    clearHideTimer();
    resetMapObjectStates();
    setMapObjectState(group.id, "hover");
    setPreview({ group, activeIndex: 0, pinned: false });
  };

  const pinPreview = (group) => {
    clearHideTimer();
    selectedGroupIdRef.current = group.id;
    resetMapObjectStates();
    setMapObjectState(group.id, "selected");
    setPreview({ group, activeIndex: 0, pinned: true });
  };

  const changePreviewEntry = (offset) => {
    clearHideTimer();
    setPreview((current) => {
      if (!current?.group || current.group.entries.length < 2) return current;
      const { entries } = current.group;
      return {
        ...current,
        activeIndex: (current.activeIndex + offset + entries.length) % entries.length,
      };
    });
  };

  const scheduleHide = () => {
    clearHideTimer();
    timerRef.current = window.setTimeout(() => {
      if (!selectedGroupIdRef.current) clearActivePreview();
    }, HOVER_GRACE_PERIOD);
  };

  useEffect(() => {
    if (immediate || !rootRef.current || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsNear(true);
      observer.disconnect();
    }, { rootMargin: "720px 0px" });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [immediate]);

  useEffect(() => () => {
    clearHideTimer();
    clearCtrlHintTimer();
  }, []);

  useEffect(() => {
    if (mapMode === "modal") return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && selectedGroupIdRef.current) clearActivePreview();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mapMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const mapSurface = rootRef.current;
    if (!isNear || !canvas || !mapSurface || !mapGroups.length) return undefined;
    let mounted = true;
    let listeners = [];
    let removeCanvasWheelListener = null;
    let mapInstance = null;
    let mapsApiInstance = null;
    setStatus("loading");

    loadGoogleMapsJavaScriptApi(GOOGLE_MAPS_API_KEY)
      .then((maps) => {
        if (!mounted) return;
        const interactionOptions = mapMode === "modal"
          ? { gestureHandling: "greedy", scrollwheel: true }
          // Wheel zoom is handled explicitly below for Ctrl + scroll. Keeping
          // the native map wheel handler off lets an ordinary wheel gesture
          // retain the browser's natural momentum while the pointer is over
          // the inline map or an offer preview.
          : { gestureHandling: "cooperative", scrollwheel: false };
        const map = new maps.Map(canvas, {
          center: mapGroups[0].position,
          zoom: 12,
          styles: mapMode === "modal" && mapType === "hybrid" ? null : PROPERTYCORP_MAP_STYLE,
          backgroundColor: "#e8e3d8",
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          mapTypeId: mapMode === "modal" ? mapType : "roadmap",
          rotateControl: false,
          scaleControl: false,
          streetViewControl: false,
          ...interactionOptions,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_CENTER },
        });
        mapInstance = map;
        mapsApiInstance = maps;
        mapRef.current = map;
        mapsApiRef.current = maps;

        if (mapMode !== "modal") {
          let ctrlWheelDelta = 0;
          let ctrlWheelResetTimer = null;
          const onInlineMapWheel = (event) => {
            if (!supportsDesktopPointer()) return;

            // Prevent browser-level page zoom and apply Ctrl+wheel directly to
            // the hovered map. The small threshold keeps a trackpad gesture
            // smooth while a mouse wheel still advances one zoom level.
            if (event.ctrlKey) {
              event.preventDefault();
              event.stopImmediatePropagation();
              clearCtrlHintTimer();
              setShowCtrlHint(false);
              ctrlWheelDelta += event.deltaY;
              if (ctrlWheelResetTimer != null) window.clearTimeout(ctrlWheelResetTimer);
              ctrlWheelResetTimer = window.setTimeout(() => {
                ctrlWheelDelta = 0;
                ctrlWheelResetTimer = null;
              }, 120);

              if (Math.abs(ctrlWheelDelta) < 40) return;
              const currentZoom = map.getZoom() ?? 12;
              const nextZoom = Math.min(21, Math.max(3, currentZoom + (ctrlWheelDelta < 0 ? 1 : -1)));
              ctrlWheelDelta = 0;
              map.setZoom(nextZoom);
              return;
            }

            // Do not cancel a normal wheel gesture. The browser can then keep
            // its native scroll velocity, including trackpad momentum, instead
            // of receiving a sequence of manual scrollBy calls.
            if (!mounted || hasNativeCtrlHint(canvas)) return;
            clearCtrlHintTimer();
            setShowCtrlHint(true);
            ctrlHintTimerRef.current = window.setTimeout(() => setShowCtrlHint(false), 1500);
          };
          // The preview card is a sibling of the Google Maps canvas. Listen on
          // the whole component so Ctrl+wheel works when the cursor is above
          // either the map itself or its offer preview.
          mapSurface.addEventListener("wheel", onInlineMapWheel, { capture: true, passive: false });
          removeCanvasWheelListener = () => {
            if (ctrlWheelResetTimer != null) window.clearTimeout(ctrlWheelResetTimer);
            mapSurface.removeEventListener("wheel", onInlineMapWheel, true);
          };
        }
        const bounds = new maps.LatLngBounds();

        mapGroups.forEach((group) => {
          bounds.extend(group.position);
          const icons = {
            idle: propertyPinIcon(maps, "idle", group.entries.length),
            hover: propertyPinIcon(maps, "hover", group.entries.length),
            selected: propertyPinIcon(maps, "selected", group.entries.length),
          };
          const marker = new maps.Marker({
            map,
            position: group.position,
            title: group.entries.length > 1 ? `${group.presentation.heading} — ${group.entries.length} ofert` : group.presentation.heading,
            icon: icons.idle,
            zIndex: 3,
          });
          mapObjectsRef.current.set(group.id, { marker, icons, baseZIndex: 3 });

          listeners.push(
            marker.addListener("mouseover", () => showHoverPreview(group)),
            marker.addListener("mouseout", scheduleHide),
            marker.addListener("click", () => pinPreview(group)),
          );
        });

        listeners.push(map.addListener("click", clearActivePreview));
        map.fitBounds(bounds, 72);
        maps.event.addListenerOnce(map, "bounds_changed", () => {
          if (map.getZoom() > 14) map.setZoom(14);
        });
        setStatus("ready");
      })
      .catch(() => { if (mounted) setStatus("error"); });

    return () => {
      mounted = false;
      removeCanvasWheelListener?.();
      clearCtrlHintTimer();
      setShowCtrlHint(false);
      // Google can reject a map script before every listener is initialised
      // (for example for an unapproved local referrer). Cleanup must still be
      // safe so closing the modal never unmounts the rest of the homepage.
      listeners.forEach((listener) => listener?.remove?.());
      mapObjectsRef.current.forEach((mapObject) => mapObject?.marker?.setMap?.(null));
      mapObjectsRef.current.clear();
      selectedGroupIdRef.current = null;
      if (mapRef.current === mapInstance) mapRef.current = null;
      if (mapsApiRef.current === mapsApiInstance) mapsApiRef.current = null;
    };
  }, [isNear, mapGroups, mapMode]);

  useEffect(() => {
    if (mapMode !== "modal" || status !== "ready" || !mapRef.current) return;
    mapRef.current.setOptions({ styles: mapType === "hybrid" ? null : PROPERTYCORP_MAP_STYLE });
    mapRef.current.setMapTypeId(mapType);
  }, [mapMode, mapType, status]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    const surface = rootRef.current;
    if (status !== "ready" || !map || !maps || !surface) return undefined;

    let frameId = null;
    let timeoutId = null;
    const reflowMap = () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const currentMap = mapRef.current;
        const currentMaps = mapsApiRef.current;
        if (!currentMap || !currentMaps) return;
        const center = currentMap.getCenter();
        const zoom = currentMap.getZoom();
        currentMaps.event.trigger(currentMap, "resize");
        if (center) currentMap.setCenter(center);
        if (Number.isFinite(zoom)) currentMap.setZoom(zoom);
      });
    };

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(reflowMap);
    observer?.observe(surface);
    reflowMap();
    timeoutId = window.setTimeout(reflowMap, 260);

    return () => {
      observer?.disconnect();
      if (frameId != null) window.cancelAnimationFrame(frameId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [isFullscreen, status]);

  const changeMapType = (nextMapType) => {
    if (nextMapType === mapType) return;
    setMapType(nextMapType);
    mapRef.current?.setOptions({ styles: nextMapType === "hybrid" ? null : PROPERTYCORP_MAP_STYLE });
    mapRef.current?.setMapTypeId(nextMapType);
  };

  return <div ref={rootRef} className={`property-map property-map--${mapMode} ${className}`} data-map-status={status} data-map-mode={mapMode} data-map-type={mapType} aria-busy={status === "loading"}>
    <div ref={canvasRef} className="property-map__canvas" role="region" aria-label={title} />
    {status !== "ready" && <MapFallback error={status === "error" || (isNear && !mapGroups.length)} />}
    {mapMode === "modal" && onToggleFullscreen && <div className="property-map__view-controls">
      <MapTypeToggle mapType={mapType} onChange={changeMapType} />
      <button
        className="property-map__fullscreen-control"
        type="button"
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? "Wyjdź z pełnego ekranu" : "Pokaż mapę na pełnym ekranie"}
      >
        {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
      </button>
    </div>}
    {mapMode !== "modal" && showCtrlHint && <div className="property-map__ctrl-hint" aria-hidden="true">Użyj Ctrl + scroll, aby przybliżyć mapę</div>}
    {preview && <OfferPreview group={preview.group} activeIndex={preview.activeIndex} pinned={preview.pinned} onClose={clearActivePreview} onChangeEntry={changePreviewEntry} onMouseEnter={clearHideTimer} onMouseLeave={scheduleHide} onSelectOffer={(offer) => trackEvent("map_offer_select", { offer_id: String(offer.id), map_context: mapMode === "modal" ? "homepage_full" : "homepage_mini" })} />}
  </div>;
}

export function ConsentAwareOffersMap({
  offers,
  title,
  immediate = false,
  className = "",
  mapMode = "inline",
  isFullscreen = false,
  onToggleFullscreen,
}) {
  const { consent } = useConsent();
  if (!consent.externalMedia) {
    return <GoogleMapsConsentPlaceholder className={`property-map property-map--${mapMode} ${className}`.trim()} title={isPortfolioEdition ? "Mapa jest wyłączona" : "Mapa Google jest wyłączona"} />;
  }
  if (isPortfolioEdition) return <DemoOffersMap offers={offers} title={title} className={className} mapMode={mapMode} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />;
  return <OffersInteractiveMap
    offers={offers}
    title={title}
    immediate={immediate}
    className={className}
    mapMode={mapMode}
    isFullscreen={isFullscreen}
    onToggleFullscreen={onToggleFullscreen}
  />;
}

function getOfferCountLabel(count) {
  if (count === 1) return "aktualna oferta";
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) return "aktualne oferty";
  return "aktualnych ofert";
}

function formatOfferCount(count) {
  return new Intl.NumberFormat("pl-PL").format(count);
}

function MapFilterSelect({ id, label, value, onChange, children }) {
  return (
    <label className="property-map-modal__filter" htmlFor={id}>
      <span>{label}</span>
      <div>
        <select id={id} value={value || ""} onChange={(event) => onChange(event.target.value || null)}>
          {children}
        </select>
        <ChevronDown aria-hidden="true" />
      </div>
    </label>
  );
}

function MapModalFilters({ filters, facets, onChange, onClear, clearDisabled }) {
  const setPartial = (partial) => onChange({ ...filters, ...partial });

  return (
    <div className="property-map-modal__filters" aria-label="Filtry ofert na mapie">
      <MapFilterSelect id="map-filter-transaction" label="Transakcja" value={filters.transaction} onChange={(transaction) => setPartial({ transaction })}>
        <option value="">Wszystkie</option>
        {TRANSACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </MapFilterSelect>
      <MultiSelectFilter id="map-filter-type" label="Typ" value={filters.type} options={facets.types} onChange={(type) => setPartial({ type })} allLabel="Wszystkie" className="property-map-modal__filter" />
      <MultiSelectFilter id="map-filter-location" label="Lokalizacja" value={filters.location} options={facets.locations} onChange={(location) => setPartial({ location })} allLabel="Wszystkie" className="property-map-modal__filter" />
      <MultiSelectFilter id="map-filter-rooms" label="Pokoje" value={filters.rooms} options={ROOM_OPTIONS} onChange={(rooms) => setPartial({ rooms })} allLabel="Wszystkie" className="property-map-modal__filter" />
      <button className="property-map-modal__clear-filters" type="button" onClick={onClear} disabled={clearDisabled}>Wyczyść filtry</button>
    </div>
  );
}

function MapEmptyState({ onClear }) {
  return (
    <div className="property-map-modal__empty" role="status">
      <MapPin aria-hidden="true" />
      <p>Brak ofert spełniających wybrane kryteria.</p>
      <button type="button" onClick={onClear}>Wyczyść filtry</button>
    </div>
  );
}

export function OffersMapModal({ offers, onClose, triggerRef }) {
  const dialogRef = useRef(null);
  const isFullscreenRef = useRef(false);
  const { consent } = useConsent();
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_OFFER_FILTERS }));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const facets = useMemo(() => getListingFacets(offers), [offers]);
  const filteredOffers = useMemo(
    () => sortOffers(filterOffers(offers, filters), filters.sort),
    [filters, offers],
  );
  const hasActiveFilters = Boolean(
    filters.transaction
    || filters.type.length
    || filters.location.length
    || filters.rooms.length,
  );

  const updateFilters = (nextFilters) => {
    const changedFilter = Object.keys(nextFilters).find((key) => nextFilters[key] !== filters[key]);
    if (changedFilter) trackEvent("filter_offers", { context: "map", changed_filter: changedFilter });
    setFilters(nextFilters);
  };
  const resetFilters = () => {
    if (hasActiveFilters) trackEvent("filter_offers", { context: "map", changed_filter: "clear" });
    setFilters({ ...DEFAULT_OFFER_FILTERS });
  };

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (isFullscreenRef.current) {
          event.preventDefault();
          setIsFullscreen(false);
          return;
        }
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overflow = previousDocumentOverflow;
      window.removeEventListener("keydown", onKeyDown);
      (triggerRef?.current || previousFocus)?.focus?.();
    };
  }, [onClose, triggerRef]);

  const canUseFullscreen = consent.externalMedia && filteredOffers.length > 0;

  return createPortal(<div className={`property-map-modal${isFullscreen ? " is-fullscreen" : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section
      ref={dialogRef}
      className={`property-map-modal__panel${isFullscreen ? " is-fullscreen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={isFullscreen ? undefined : "property-map-modal-title"}
      aria-label={isFullscreen ? "Pełna mapa ofert PropertyCorp" : undefined}
      tabIndex={-1}
    >
      {!isFullscreen && <header className="property-map-modal__header">
        <div className="property-map-modal__intro"><p>Oferty na mapie</p><h2 id="property-map-modal-title">Znajdź nieruchomość w interesującej Cię okolicy.</h2><span aria-live="polite">{formatOfferCount(filteredOffers.length)} {getOfferCountLabel(filteredOffers.length)}</span><ApproximateLocationNotice variant="map" /></div>
        <MapModalFilters filters={filters} facets={facets} onChange={updateFilters} onClear={resetFilters} clearDisabled={!hasActiveFilters} />
        <button type="button" aria-label="Zamknij mapę ofert" onMouseDown={(event) => { event.stopPropagation(); onClose(); }} onClick={onClose}><X aria-hidden="true" /></button>
      </header>}
      <div className="property-map-modal__map-wrap">
        <ConsentAwareOffersMap
          offers={filteredOffers}
          title="Pełna mapa aktualnych ofert PropertyCorp"
          immediate
          className="property-map--modal"
          mapMode="modal"
          isFullscreen={isFullscreen}
          onToggleFullscreen={canUseFullscreen ? () => setIsFullscreen((current) => !current) : undefined}
        />
        {isFullscreen && <ApproximateLocationNotice variant="map" className="property-map-modal__location-notice" />}
        {filteredOffers.length === 0 && <MapEmptyState onClear={resetFilters} />}
      </div>
      {!isFullscreen && <div className="property-map-modal__scroll-runway" aria-hidden="true" />}
    </section>
  </div>, document.body);
}
