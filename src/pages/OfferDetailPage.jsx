import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import "../styles/offer-detail.css";
import { OfferGallery } from "../components/offers/OfferGallery.jsx";
import { OfferAgent, OfferDescription, OfferDetailsGroups, OfferMap, OfferQuickSpecs, RelatedOffers } from "../components/offers/OfferDetailSections.jsx";
import { useOfferDetailSeo } from "../components/offers/useOfferDetailSeo.js";
import { Reveal, REVEAL_MOTION } from "../components/home/Reveal.jsx";
import { SiteFooter } from "../components/layout/SiteFooter.jsx";
import { SiteHeader } from "../components/layout/SiteHeader.jsx";
import { getOfferEyebrow, getPublicLocation, getRelatedOffers } from "../domain/offers/offerPresentation.js";
import { parseOfferFilters } from "../domain/offers/offerFilters.js";
import { getOfferNavigationResult, getOfferNeighbors } from "../domain/offers/offerListing.js";
import { buildOfferListingPath, buildOfferPathWithSearch, OFFER_LIST_PATH, parseOfferRouteSegment } from "../domain/offers/offerRoutes.js";
import { getAllOffers } from "../services/offers/index.js";
import { trackEvent, trackOfferView } from "../analytics/googleAnalytics.js";
import { getOfferAnalyticsParameters } from "../analytics/offerTracking.js";
import { useConsent } from "../consent/ConsentProvider.jsx";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function useOfferGallerySheetMotion(active, sheetRef) {
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!active || !sheet || typeof window === "undefined") return undefined;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let sheetDocumentTop = 0;
    let startScroll = 0;
    let travelDistance = 0;

    const update = () => {
      frame = 0;
      if (motionQuery.matches) {
        sheet.style.transform = "";
        sheet.style.marginBottom = "";
        return;
      }

      const currentScroll = window.scrollY;
      if (currentScroll <= startScroll) {
        sheet.style.transform = "";
        sheet.style.marginBottom = "";
        return;
      }

      const progress = clamp((currentScroll - startScroll) / travelDistance, 0, 1);
      const restingTop = sheetDocumentTop - currentScroll;
      const completedLift = -(sheetDocumentTop - startScroll - travelDistance);
      if (progress === 1) {
        sheet.style.transform = `translate3d(0, ${completedLift.toFixed(2)}px, 0)`;
        sheet.style.marginBottom = `${completedLift.toFixed(2)}px`;
        return;
      }
      const targetTop = (sheetDocumentTop - startScroll) * (1 - progress);
      const lift = Math.min(0, targetTop - restingTop);
      sheet.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0)`;
      sheet.style.marginBottom = `${lift.toFixed(2)}px`;
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const measure = () => {
      sheet.style.transform = "";
      sheet.style.marginBottom = "";
      sheetDocumentTop = sheet.getBoundingClientRect().top + window.scrollY;
      const visibleCardEdge = clamp(window.innerHeight * 0.06, 42, 66);
      startScroll = Math.max(sheetDocumentTop - window.innerHeight + visibleCardEdge, 0);
      const transition = sheet.closest(".offer-detail__gallery-transition");
      const stage = transition?.querySelector(".offer-detail__gallery-stage");
      const gallery = transition?.querySelector(".offer-detail__gallery-reveal");
      const galleryReleaseScroll = stage && gallery
        ? Math.max(0, stage.getBoundingClientRect().top + window.scrollY + stage.offsetHeight - gallery.offsetHeight)
        : Number.POSITIVE_INFINITY;
      // The card gets its own scroll runway while the gallery remains pinned.
      // This makes the overlap deliberate instead of reacting one-to-one to a
      // single wheel gesture.
      const preferredTravel = clamp(window.innerHeight * 0.82, 440, 720);
      const availableTravel = galleryReleaseScroll - startScroll - 18;
      travelDistance = Math.max(220, Math.min(preferredTravel, availableTravel));
      requestUpdate();
    };

    const handleMotionChange = () => {
      if (motionQuery.matches) {
        sheet.style.transform = "";
        sheet.style.marginBottom = "";
      }
      else measure();
    };

    measure();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", measure);
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", measure);
      motionQuery.removeEventListener("change", handleMotionChange);
      sheet.style.transform = "";
      sheet.style.marginBottom = "";
    };
  }, [active, sheetRef]);
}

function Breadcrumbs({ offer, listingHref }) {
  const location = getPublicLocation(offer.location);
  return <nav className="offer-detail__breadcrumbs final-shell" aria-label="Okruszki"><a href={listingHref}>Oferty</a><span>/</span><span>{getOfferEyebrow(offer).split(" · ")[0]}</span>{location && <><span>/</span><span>{location}</span></>}</nav>;
}

function OfferHeroInfo({ offer }) {
  const location = getPublicLocation(offer.location) || "Wrocław i okolice";
  const titleLength = String(offer.title || "").trim().length;
  const titleSize = titleLength <= 48 ? "short" : titleLength <= 76 ? "medium" : "long";
  return (
    <section className="offer-hero-info">
      <div className="offer-hero-info__main">
        <p className="offer-detail__eyebrow">{getOfferEyebrow(offer)}</p>
        <p className="offer-hero-info__location"><MapPin aria-hidden="true" />{location}</p>
        <h1 className={`offer-hero-info__title offer-hero-info__title--${titleSize}`}>{offer.title}</h1>
        <p>Oferta jest fikcyjna, a zdjęcia mają charakter poglądowy.</p>
      </div>
    </section>
  );
}

function LoadingState() {
  return <main id="main-content" className="offer-detail offer-detail--loading" aria-busy="true"><div className="final-shell"><div className="offer-detail__loading-gallery" /><div className="offer-detail__loading-copy"><i /><i /><i /></div></div></main>;
}

function NotFoundState() {
  return <main id="main-content" className="offer-detail offer-detail--not-found"><div className="final-shell"><p>PropertyCorp</p><h1>Nie znaleźliśmy<br />tej oferty.</h1><a href={OFFER_LIST_PATH}>Wróć do ofert <ArrowRight aria-hidden="true" /></a></div></main>;
}

function OfferDetailNavigation({ listingHref, offer, orderedOffers, search, analyticsContext }) {
  const { previous, next } = getOfferNeighbors(orderedOffers, offer);
  const sourceOfferId = String(offer.externalId || offer.id);
  const trackNavigation = (direction, targetOffer) => {
    trackEvent("navigate_offer", {
      direction,
      source_offer_id: sourceOfferId,
      target_offer_id: String(targetOffer.externalId || targetOffer.id),
      context: analyticsContext,
    });
  };

  const renderOfferLink = (direction, targetOffer) => {
    const isPrevious = direction === "previous";
    if (!targetOffer) return <span className="offer-detail__offer-link offer-detail__offer-link--placeholder" aria-hidden="true" />;
    return <a
      className={`offer-detail__offer-link offer-detail__offer-link--${direction}`}
      href={buildOfferPathWithSearch(targetOffer, search)}
      rel={isPrevious ? "prev" : "next"}
      aria-label={isPrevious ? "Przejdź do poprzedniej oferty" : "Przejdź do następnej oferty"}
      onClick={() => trackNavigation(direction, targetOffer)}
    >
      {isPrevious && <ArrowLeft aria-hidden="true" />}
      <span>{isPrevious ? "Poprzednia" : "Następna"}</span>
      {!isPrevious && <ArrowRight aria-hidden="true" />}
    </a>;
  };

  return <nav className="final-shell offer-detail__navigation-row" aria-label="Nawigacja między ofertami">
    <a className="offer-detail__back" href={listingHref}><ArrowLeft aria-hidden="true" />Wszystkie oferty</a>
    <div className="offer-detail__offer-links">
      {renderOfferLink("previous", previous)}
      {renderOfferLink("next", next)}
    </div>
  </nav>;
}

export function OfferDetailPage({ segment }) {
  const { analyticsReady } = useConsent();
  const route = useMemo(() => parseOfferRouteSegment(segment), [segment]);
  const [offer, setOffer] = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(Boolean(route));
  const [offersError, setOffersError] = useState(false);
  const contentSheetRef = useRef(null);
  const detailSearch = window.location.search;
  const listingFilters = useMemo(() => parseOfferFilters(new URLSearchParams(detailSearch)), [detailSearch]);
  const listingHref = useMemo(() => buildOfferListingPath(detailSearch), [detailSearch]);

  useOfferDetailSeo(offer);
  useOfferGallerySheetMotion(Boolean(offer), contentSheetRef);

  useEffect(() => {
    if (offer && analyticsReady) trackOfferView(getOfferAnalyticsParameters(offer));
  }, [analyticsReady, offer]);

  useEffect(() => {
    let mounted = true;
    if (!route) {
      setOffer(null);
      setOffers([]);
      setOffersError(false);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setOffersError(false);
    getAllOffers()
      .then((allOffers) => {
        if (!mounted) return;
        setOffer(allOffers.find((item) => item.id === String(route.externalId)) || null);
        setOffers(allOffers);
      })
      .catch(() => {
        if (!mounted) return;
        setOffer(null);
        setOffers([]);
        setOffersError(true);
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [route]);

  const relatedOffers = useMemo(() => offer ? getRelatedOffers(offer, offers) : [], [offer, offers]);
  const navigationResult = useMemo(() => getOfferNavigationResult(offers, offer, listingFilters), [listingFilters, offer, offers]);
  const navigationSearch = navigationResult.usedFallback ? "" : detailSearch;
  return (
    <div className="offer-detail-page">
      <SiteHeader />
      {loading ? <LoadingState /> : offersError ? <main id="main-content" className="offer-detail--not-found runtime-offers-error" role="alert"><div><p>Oferty</p><h1>Nie możemy teraz<br />pobrać tej oferty.</h1><a href="/oferty">Wróć do ofert</a></div></main> : offer ? <main id="main-content" className="offer-detail">
        <Breadcrumbs offer={offer} listingHref={listingHref} />
        <OfferDetailNavigation listingHref={listingHref} offer={offer} orderedOffers={navigationResult.orderedOffers} search={navigationSearch} analyticsContext={navigationResult.analyticsContext} />
        <div className="offer-detail__gallery-transition">
          <div className="offer-detail__gallery-stage">
            <Reveal className="final-shell offer-detail__gallery-reveal" {...REVEAL_MOTION.media} offset={22}><OfferGallery offer={offer} /></Reveal>
          </div>
          <div className="offer-detail__content-sheet-layer" ref={contentSheetRef}>
            <div className="offer-detail__content-sheet">
              <section className="final-shell offer-detail__decision">
                <div className="offer-detail__decision-main">
                  <Reveal duration={820} offset={30}><OfferHeroInfo offer={offer} /></Reveal>
                  <Reveal duration={780} delay={70} offset={24}><OfferQuickSpecs offer={offer} /></Reveal>
                </div>
                <Reveal className="offer-detail__agent-reveal" duration={840} delay={100} offset={28}><OfferAgent offer={offer} /></Reveal>
              </section>
              <section className="final-shell offer-detail__narrative">
                <Reveal duration={820} offset={28}><OfferDescription offer={offer} /></Reveal>
                <Reveal duration={820} delay={70} offset={28}><OfferMap offer={offer} /></Reveal>
              </section>
              <Reveal duration={820} offset={28}><OfferDetailsGroups offer={offer} /></Reveal>
              <Reveal duration={820} offset={28}><RelatedOffers offers={relatedOffers} sourceOfferId={offer.id} /></Reveal>
            </div>
          </div>
        </div>
      </main> : <NotFoundState />}
      <SiteFooter />
    </div>
  );
}
