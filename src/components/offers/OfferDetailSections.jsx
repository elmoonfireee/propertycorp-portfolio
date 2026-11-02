import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, BedDouble, Building2, CalendarDays, CarFront, DoorOpen,
  ChevronDown, Flame, LandPlot, Layers3, Mail, MapPin, Maximize2, Phone, Ruler, Trees, Warehouse, X,
} from "lucide-react";
import { getOfferAgent } from "../../data/agents.js";
import { siteEditionConfig } from "../../config/siteEdition.js";
import {
  formatPhone, formatPrice, formatPricePerSquareMeter, getDescriptionPreview, getDetailGroups,
  getAmenitySpecs, getOfferDescriptionParagraphs, getOfferPublicLocationPresentation, getPrimarySpecs, getPublicLocation,
} from "../../domain/offers/offerPresentation.js";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { getPrimaryOfferImage } from "./OfferCard.jsx";
import { ApproximateGoogleMap } from "./ApproximateGoogleMap.jsx";
import { ApproximateLocationNotice, getOfferLocationPrecision } from "./ApproximateLocationNotice.jsx";
import { RichOfferDescription } from "./RichOfferDescription.jsx";
import { resolveOfferMapPosition } from "../../domain/offers/offerMapPosition.js";
import { MapTypeToggle } from "./MapTypeToggle.jsx";
import { parseOfferDescription } from "../../domain/offers/parseOfferDescription.js";
import { GoogleMapsConsentPlaceholder } from "../consent/GoogleMapsConsentPlaceholder.jsx";
import { useConsent } from "../../consent/ConsentProvider.jsx";
import { trackEvent } from "../../analytics/googleAnalytics.js";
import { getAgentAnalyticsId } from "../../analytics/offerTracking.js";

const specIcons = {
  area: Ruler,
  rooms: BedDouble,
  floor: Layers3,
  year: CalendarDays,
  balcony: Trees,
  parking: CarFront,
  plot: LandPlot,
  bedrooms: BedDouble,
  garage: Warehouse,
  commercial: Building2,
  purpose: DoorOpen,
  heating: Flame,
  building: Building2,
};

const googleMapsJavaScriptApiKey = import.meta.env.VITE_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim()
  || import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY?.trim();

function Eyebrow({ children }) {
  return <p className="offer-detail__eyebrow">{children}</p>;
}

function initials(name) {
  return String(name || "PropertyCorp").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function DescriptionDialog({ model, onClose, triggerRef }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const focusableSelector = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll(focusableSelector);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [onClose, triggerRef]);

  const dialog = (
    <div className="offer-description-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="offer-description-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="offer-description-dialog-title" tabIndex={-1}>
        <header>
          <div><Eyebrow>O nieruchomości</Eyebrow><h2 id="offer-description-dialog-title">Pełny opis oferty</h2></div>
          <button type="button" aria-label="Zamknij pełny opis" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="offer-description-dialog__content"><RichOfferDescription model={model} onContact={onClose} /></div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

function getMapUrls(presentation) {
  if (!presentation?.externalQuery) return null;
  return {
    external: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(presentation.externalQuery)}`,
  };
}

function MapCanvas({ apiKey, mapPosition, title, zoom, mapType }) {
  const hasPublicCoordinates = Boolean(mapPosition);

  if (apiKey && hasPublicCoordinates) {
    return <ApproximateGoogleMap apiKey={apiKey} position={mapPosition} title={title} zoom={zoom} mapType={mapType} />;
  }

  return null;
}

function MapDialog({ presentation, mapPosition, mapUrls, mapApiKey, externalMediaEnabled, mapType, onMapTypeChange, supportsMapTypeToggle, locationPrecision, onClose, triggerRef }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const focusableSelector = "button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex='-1'])";
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll(focusableSelector);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [onClose, triggerRef]);

  return (
    <div className="offer-map-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="offer-map-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="offer-map-dialog-title" tabIndex={-1}>
        <header>
          <div>
            <Eyebrow>Lokalizacja</Eyebrow>
            <h2 id="offer-map-dialog-title">{presentation.heading}</h2>
            <p className="pc-body-copy">{presentation.modalDescription}</p>
            <ApproximateLocationNotice precision={locationPrecision} variant="map" className="offer-map-dialog__location-notice" />
          </div>
          <div className="offer-map-dialog__actions">
            <a href={mapUrls.external} target="_blank" rel="noreferrer">{presentation.externalLabel} <Maximize2 aria-hidden="true" /></a>
            <button type="button" aria-label="Zamknij mapę" onClick={onClose}><X aria-hidden="true" /></button>
          </div>
        </header>
        <div className="offer-map-dialog__canvas">
          {externalMediaEnabled
            ? <>
              <MapCanvas apiKey={mapApiKey} mapPosition={mapPosition} title={`Mapa: ${presentation.heading}`} zoom={presentation.modalZoom} mapType={mapType} />
              {supportsMapTypeToggle && <div className="offer-map__view-controls offer-map-dialog__view-controls"><MapTypeToggle mapType={mapType} onChange={onMapTypeChange} /></div>}
            </>
            : <GoogleMapsConsentPlaceholder className="offer-map-dialog__consent" title="Mapa Google jest wyłączona" />}
        </div>
      </section>
    </div>
  );
}

export function OfferQuickSpecs({ offer }) {
  const primarySpecs = getPrimarySpecs(offer);
  const amenitySpecs = getAmenitySpecs(offer);
  if (!primarySpecs.length && !amenitySpecs.length) return null;
  return (
    <div className="offer-quick-specs">
      {primarySpecs.length > 0 && <section className="offer-primary-specs" aria-label="Najważniejsze parametry">
        {primarySpecs.map((spec) => {
          const Icon = specIcons[spec.icon] || Building2;
          return <article key={spec.label}>
            <span className="offer-primary-specs__icon"><Icon aria-hidden="true" /></span>
            <div><strong>{spec.value}</strong><span>{spec.label}</span></div>
          </article>;
        })}
      </section>}
      {amenitySpecs.length > 0 && <ul className="offer-amenity-specs" aria-label="Atuty nieruchomości">
        {amenitySpecs.map((spec) => {
          const Icon = specIcons[spec.icon] || Building2;
          return <li key={`${spec.label}-${spec.value}`}><Icon aria-hidden="true" /><span>{spec.chip}</span></li>;
        })}
      </ul>}
    </div>
  );
}

export function OfferDescription({ offer }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const paragraphs = useMemo(() => getOfferDescriptionParagraphs(offer), [offer]);
  const model = useMemo(() => parseOfferDescription(offer?.description, { agent: offer?.agent }), [offer]);
  const preview = useMemo(() => getDescriptionPreview(paragraphs, 650, 3), [paragraphs]);
  const isLong = preview.join(" ").length < paragraphs.join(" ").length;
  const canOpenFullDescription = isLong || model.sections.length > 0 || model.closing.length > 0;

  return <>
    <section className="offer-description" id="opis">
      <Eyebrow>O nieruchomości</Eyebrow>
      <h2>Opis oferty</h2>
      <div className={`offer-description__preview ${isLong ? "is-truncated" : ""}`}>
        {preview.map((paragraph, index) => <p className="pc-body-copy" key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
      </div>
      {canOpenFullDescription && <button ref={triggerRef} type="button" className="offer-detail__text-action" aria-haspopup="dialog" onClick={() => { trackEvent("view_full_description", { offer_id: String(offer.id) }); setIsOpen(true); }}>Czytaj pełny opis <ArrowRight aria-hidden="true" /></button>}
    </section>
    {isOpen && <DescriptionDialog model={model} triggerRef={triggerRef} onClose={() => setIsOpen(false)} />}
  </>;
}

export function OfferMap({ offer }) {
  const { consent } = useConsent();
  const mapRef = useRef(null);
  const [isNear, setIsNear] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapType, setMapType] = useState("roadmap");
  const expandButtonRef = useRef(null);
  const mapPosition = useMemo(() => resolveOfferMapPosition(offer), [offer]);
  const locationPrecision = useMemo(() => getOfferLocationPrecision(offer), [offer]);
  const presentation = useMemo(() => getOfferPublicLocationPresentation(offer), [offer]);
  const mapUrls = useMemo(() => getMapUrls(presentation), [presentation]);
  const usesJavaScriptMap = Boolean(
    googleMapsJavaScriptApiKey
    && Boolean(mapPosition),
  );
  const hasMapSurface = usesJavaScriptMap;
  const canOpenMap = hasMapSurface;
  const openMap = () => {
    trackEvent("view_offer_map", { offer_id: String(offer.id), location_mode: presentation.mode });
    setIsMapModalOpen(true);
  };
  const changeMapType = (nextMapType) => {
    if (nextMapType === mapType) return;
    setMapType(nextMapType);
  };

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setIsNear(true);
      observer.disconnect();
    }, { rootMargin: "0px 0px 240px 0px", threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section className="offer-map" id="lokalizacja" ref={mapRef}>
        <Eyebrow>Lokalizacja</Eyebrow>
        <div className="offer-map__heading">
          <h2>{presentation.heading}</h2>
          <ApproximateLocationNotice precision={locationPrecision} />
          <p className="pc-body-copy">{presentation.description}</p>
        </div>
        {hasMapSurface ? (consent.externalMedia
          ? <div className="offer-map__surface" data-map-provider="google" data-location-mode={presentation.mode}>
            {isNear ? <MapCanvas apiKey={googleMapsJavaScriptApiKey} mapPosition={mapPosition} title={`Mapa Google: ${presentation.heading}`} zoom={presentation.inlineZoom} mapType={mapType} /> : <div className="offer-map__placeholder" aria-hidden="true"><MapPin /><span>Przygotowujemy mapę lokalizacji</span></div>}
            {isNear && canOpenMap && <div className="offer-map__view-controls">
              {usesJavaScriptMap && <MapTypeToggle mapType={mapType} onChange={changeMapType} />}
              <button ref={expandButtonRef} type="button" className="offer-map__expand" aria-label="Powiększ mapę" onClick={openMap}><Maximize2 aria-hidden="true" /></button>
            </div>}
          </div>
          : <GoogleMapsConsentPlaceholder className="offer-map__surface" title="Mapa Google jest wyłączona" />
        ) : <div className="offer-map__fallback" data-map-provider="fallback"><MapPin aria-hidden="true" /><div><strong>{presentation.heading}</strong><span className="pc-body-copy">{presentation.mode === "point" ? "Mapę lokalizacji otworzysz w Google Maps." : presentation.description}</span></div></div>}
      {mapUrls && <div className="offer-map__actions">
        <a className="offer-map__external" href={mapUrls.external} target="_blank" rel="noreferrer">{presentation.externalLabel} <Maximize2 aria-hidden="true" /></a>
      </div>}
      </section>
      {isMapModalOpen && canOpenMap && <MapDialog presentation={presentation} mapPosition={mapPosition} mapUrls={mapUrls} mapApiKey={googleMapsJavaScriptApiKey} externalMediaEnabled={consent.externalMedia} mapType={mapType} onMapTypeChange={changeMapType} supportsMapTypeToggle={usesJavaScriptMap} locationPrecision={locationPrecision} triggerRef={expandButtonRef} onClose={() => setIsMapModalOpen(false)} />}
    </>
  );
}

export function OfferDetailsGroups({ offer }) {
  const groups = getDetailGroups(offer);
  if (!groups.length) return null;
  return (
    <section className="offer-details offer-detail-section" id="szczegoly">
      <Eyebrow>Szczegółowe parametry</Eyebrow>
      <h2>Szczegóły nieruchomości</h2>
      <div className="offer-details__groups">
        {groups.map((group) => <details key={group.title} className="offer-details__group" open>
          <summary><h3>{group.title}</h3><ChevronDown aria-hidden="true" /></summary>
          <dl>{group.items.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl>
        </details>)}
      </div>
    </section>
  );
}

export function OfferAgent({ offer }) {
  const agent = getOfferAgent(offer.agent);
  const phoneHref = !siteEditionConfig.formDeliveryEnabled ? null : agent.phone ? `tel:${String(agent.phone).replace(/\s+/g, "")}` : null;
  const mailHref = !siteEditionConfig.formDeliveryEnabled ? null : agent.email ? `mailto:${agent.email}?subject=${encodeURIComponent(`Oferta nr ${offer.id}: ${offer.title}`)}` : null;
  const perMeter = formatPricePerSquareMeter(offer.price.pricePerSquareMeter);

  return (
    <aside className="offer-agent" id="kontakt" aria-label={`Opiekun oferty: ${agent.name}`}>
      <div className="offer-agent__price">
        <strong>{formatPrice(offer)}</strong>
        {perMeter && <span>{perMeter}</span>}
      </div>
      <div className="offer-agent__divider" />
      <Eyebrow>Opiekun oferty</Eyebrow>
      <div className="offer-agent__intro">
        <div className="offer-agent__portrait" data-portrait-path={agent.image ? undefined : agent.imagePath || undefined} aria-label={agent.image ? `Zdjęcie: ${agent.name}` : `Monogram: ${agent.name}`}>
          {agent.image ? <img src={agent.image} alt={agent.name} style={{ objectPosition: agent.imagePosition, transform: `scale(${agent.imageScale ?? 1})`, transformOrigin: agent.imagePosition }} /> : <span>{initials(agent.name)}</span>}
        </div>
        <div><h2>{agent.name}</h2><p className="pc-body-copy">Porozmawiajmy o tej nieruchomości.</p>{agent.license && <small>Licencja pośrednika nr {agent.license}</small>}</div>
      </div>
      <div className="offer-agent__contact">
        {phoneHref && <a href={phoneHref} onClick={() => trackEvent("click_agent_phone", { offer_id: String(offer.id), agent_id: getAgentAnalyticsId(agent) })}><Phone aria-hidden="true" />{formatPhone(agent.phone)}</a>}
        {mailHref && <a href={mailHref} onClick={() => trackEvent("click_agent_email", { offer_id: String(offer.id), agent_id: getAgentAnalyticsId(agent) })}><Mail aria-hidden="true" />{agent.email}</a>}
      </div>
      <div className="offer-agent__actions">
        {phoneHref && <a className="offer-agent__button" href={phoneHref} onClick={() => trackEvent("click_agent_phone", { offer_id: String(offer.id), agent_id: getAgentAnalyticsId(agent) })}>Zadzwoń <Phone aria-hidden="true" /></a>}
        {mailHref && <a className="offer-agent__button offer-agent__button--quiet" href={mailHref} onClick={() => trackEvent("click_agent_email", { offer_id: String(offer.id), agent_id: getAgentAnalyticsId(agent) })}>Zapytaj o ofertę <ArrowRight aria-hidden="true" /></a>}
      </div>
    </aside>
  );
}

export function RelatedOffers({ offers, sourceOfferId }) {
  if (!offers.length) return null;
  return (
    <section className="offer-related offer-detail-section">
      <Eyebrow>Może Cię również zainteresować</Eyebrow>
      <div className="offer-related__heading"><h2>Podobne oferty</h2><a href="/oferty">Zobacz wszystkie oferty <ArrowRight aria-hidden="true" /></a></div>
      <div className="offer-related__grid">{offers.map((offer, index) => <RelatedOfferCard key={offer.id} offer={offer} priority={index === 0} sourceOfferId={sourceOfferId} />)}</div>
    </section>
  );
}

function RelatedOfferCard({ offer, priority, sourceOfferId }) {
  const image = getPrimaryOfferImage(offer);
  const location = getPublicLocation(offer.location) || "Wrocław i okolice";
  const facts = getPrimarySpecs(offer).slice(0, 2).map((spec) => spec.value).filter(Boolean);

  return <article className="offer-related-card">
    <a href={buildOfferPath(offer)} aria-label={`Zobacz ofertę: ${offer.title}`} onClick={() => trackEvent("click_similar_offer", { source_offer_id: String(sourceOfferId), target_offer_id: String(offer.id) })}>
      <div className="offer-related-card__visual">
        {image ? <img src={image.url} alt={offer.title} loading={priority ? "eager" : "lazy"} sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1050px) calc((100vw - 84px) / 2), (max-width: 1480px) calc((100vw - 12vw - 56px) / 3), 450px" /> : <div className="offer-related-card__fallback" aria-hidden="true"><i /><i /><span>PC</span></div>}
      </div>
      <div className="offer-related-card__body">
        <p><MapPin aria-hidden="true" />{location}</p>
        <h3>{offer.title}</h3>
        <div className="offer-related-card__footer"><strong>{formatPrice(offer)}</strong><span>{facts.join(" · ") || "Szczegóły oferty"}</span><ArrowRight aria-hidden="true" /></div>
      </div>
    </a>
  </article>;
}
