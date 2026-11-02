import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import { getRequestedVariant, resolveEditionVariant, siteEditionConfig } from "../../config/siteEdition.js";
import { buildOfferPath } from "../../domain/offers/offerRoutes.js";
import { OfferCard, formatLocation, formatPrice, getPrimaryOfferImage } from "../offers/OfferCard.jsx";
import { Reveal, REVEAL_MOTION } from "./Reveal.jsx";
import { trackEvent } from "../../analytics/googleAnalytics.js";

const FEATURED_COPY = "Wybraliśmy kilka nieruchomości, które zasługują na bliższe spojrzenie. Zobacz pełną ofertę — właściwy adres może być bliżej, niż myślisz.";
const VARIANTS = [1, 2, 3, 4];
const FEATURED_BACKGROUND_CROSSFADE_DURATION = 960;
const FEATURED_CINEMATIC_BACKGROUND_DURATION = 1400;
const FEATURED_CINEMATIC_MOBILE_BACKGROUND_DURATION = 1100;

function getGroupStarts(offerCount) {
  return Array.from({ length: Math.ceil(offerCount / 3) }, (_, index) => index * 3);
}

function offerMeta(offer) {
  return [offer.area ? `${offer.area} m²` : null, offer.rooms ? `${offer.rooms} pok.` : null].filter(Boolean).join(" · ");
}

function getOfferIndex(offers, offerId) {
  return Math.max(0, offers.findIndex((offer) => String(offer.id) === String(offerId)));
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reducedMotion;
}

function useMobileCarouselSwipe(onMove) {
  const startRef = useRef(null);

  const isCompactViewport = () => window.matchMedia?.("(max-width: 700px)").matches;
  const reset = () => { startRef.current = null; };

  return {
    onTouchStart: (event) => {
      if (!isCompactViewport()) return;
      const touch = event.touches[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchCancel: reset,
    onTouchEnd: (event) => {
      if (!isCompactViewport() || !startRef.current) return reset();
      const touch = event.changedTouches[0];
      const start = startRef.current;
      reset();
      if (!touch) return;

      const distanceX = touch.clientX - start.x;
      const distanceY = touch.clientY - start.y;
      if (Math.abs(distanceX) < 48 || Math.abs(distanceX) < Math.abs(distanceY) * 1.25) return;
      onMove(distanceX < 0 ? 1 : -1);
    },
  };
}

function useCarouselAutoplay({ canAdvance, isTransitioning, reducedMotion, onAdvance }) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [pauseUntil, setPauseUntil] = useState(0);
  const [compactLayout, setCompactLayout] = useState(false);
  const timers = useRef({ autoplay: null, resume: null });
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;
  const clearTimer = (name) => {
    window.clearTimeout(timers.current[name]);
    timers.current[name] = null;
  };

  useEffect(() => () => Object.keys(timers.current).forEach(clearTimer), []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const sync = () => setCompactLayout(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const syncVisibility = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);
  useEffect(() => {
    clearTimer("autoplay");
    if (!canAdvance || isTransitioning || reducedMotion || compactLayout || isHovered || hasFocus || !isPageVisible || pauseUntil) return undefined;
    timers.current.autoplay = window.setTimeout(() => {
      timers.current.autoplay = null;
      advanceRef.current();
    }, 7000);
    return () => clearTimer("autoplay");
  }, [canAdvance, compactLayout, hasFocus, isHovered, isPageVisible, isTransitioning, pauseUntil, reducedMotion]);

  const pauseAfterInteraction = () => {
    clearTimer("autoplay");
    clearTimer("resume");
    const until = Date.now() + 12000;
    setPauseUntil(until);
    timers.current.resume = window.setTimeout(() => setPauseUntil(0), 12000);
  };

  return {
    pauseAfterInteraction,
    interactionProps: {
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      onFocusCapture: () => setHasFocus(true),
      onBlurCapture: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false); },
    },
  };
}

function useOfferImagePreload(offers, activeOfferId) {
  useEffect(() => {
    if (!offers.length || typeof window === "undefined") return undefined;
    const activeIndex = getOfferIndex(offers, activeOfferId);
    const preload = (offer) => {
      const source = getPrimaryOfferImage(offer)?.url;
      if (!source) return;
      const image = new Image();
      image.src = source;
    };
    [0, -1, 1, -2, 2].forEach((offset) => preload(offers[(activeIndex + offset + offers.length) % offers.length]));
    const preloadRest = () => offers.forEach(preload);
    const idleId = window.requestIdleCallback ? window.requestIdleCallback(preloadRest, { timeout: 1200 }) : window.setTimeout(preloadRest, 160);
    return () => {
      if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [activeOfferId, offers]);
}

function preloadImage(source) {
  if (!source || typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    const finish = (loaded) => resolve(loaded);

    image.onload = () => {
      if (typeof image.decode !== "function") {
        finish(true);
        return;
      }
      image.decode().then(() => finish(true)).catch(() => finish(true));
    };
    image.onerror = () => finish(false);
    image.src = source;
  });
}

function FeaturedPropertyActions({ detailHref }) {
  return <div className="featured-property-actions"><a className="featured-property-action featured-property-action--all" href="/oferty"><span>Zobacz wszystkie oferty</span><ArrowRight aria-hidden="true" /></a><a className="featured-property-action featured-property-action--detail" href={detailHref}><span>Zobacz szczegóły</span><ArrowUpRight aria-hidden="true" /></a></div>;
}

function FeaturedHeading({ actionsDetailHref = null }) {
  return (
    <div className="home-section-heading home-section-heading--wide">
      <div>
        <Reveal as="p" {...REVEAL_MOTION.eyebrow}>Na pierwszym planie</Reveal>
        <Reveal as="h2" {...REVEAL_MOTION.heading}>Adresy, które<br />warto zobaczyć.</Reveal>
      </div>
      <Reveal className="home-featured__action" {...REVEAL_MOTION.copy}><span className="pc-body-copy">{FEATURED_COPY}</span>{actionsDetailHref ? <FeaturedPropertyActions detailHref={actionsDetailHref} /> : <a href="/oferty">Zobacz wszystkie oferty <ArrowRight /></a>}</Reveal>
    </div>
  );
}

function FeaturedBackgroundLayer({ imageUrl, duration = FEATURED_BACKGROUND_CROSSFADE_DURATION, mobileDuration = null }) {
  const [layers, setLayers] = useState(() => imageUrl ? [{ id: 0, source: imageUrl, visible: true }] : []);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches);
  const requestedImageRef = useRef(imageUrl);
  const requestGenerationRef = useRef(0);
  const layerIdRef = useRef(0);
  const revealFrameRef = useRef(null);
  const cleanupTimersRef = useRef([]);

  useEffect(() => () => {
    window.cancelAnimationFrame(revealFrameRef.current);
    cleanupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const activeDuration = isMobile && mobileDuration ? mobileDuration : duration;

  useEffect(() => {
    if (!imageUrl || requestedImageRef.current === imageUrl) return undefined;

    requestedImageRef.current = imageUrl;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;

    preloadImage(imageUrl).then((loaded) => {
      if (!loaded || generation !== requestGenerationRef.current) return;

      const layerId = layerIdRef.current + 1;
      layerIdRef.current = layerId;
      setLayers((current) => [
        ...current.map((layer) => ({ ...layer, visible: false })),
        { id: layerId, source: imageUrl, visible: false },
      ]);

      window.cancelAnimationFrame(revealFrameRef.current);
      revealFrameRef.current = window.requestAnimationFrame(() => {
        if (generation !== requestGenerationRef.current) return;
        setLayers((current) => current.map((layer) => ({ ...layer, visible: layer.id === layerId })));
      });

      const cleanupTimer = window.setTimeout(() => {
        setLayers((current) => current.filter((layer) => layer.visible));
      }, activeDuration + 80);
      cleanupTimersRef.current.push(cleanupTimer);
    });

    return undefined;
  }, [activeDuration, imageUrl]);

  if (!layers.length) return null;

  return (
    <div className="home-featured__background-layer" aria-hidden="true" style={{ "--featured-background-duration": `${activeDuration}ms` }}>
      {layers.map((layer) => <img className={`home-featured__background-image${layer.visible ? " is-visible" : ""}`} key={layer.id} src={layer.source} alt="" />)}
    </div>
  );
}

function CarouselVariantSwitcher({ activeVariant, onChange }) {
  const labels = ["01 — Editorial", "02 — Aktywne tło", "03 — Wachlarz", "04 — Hybryda"];
  return (
    <aside className="featured-carousel-lab" aria-label="Wybór wariantu sekcji Na pierwszym planie">
      <p>Wybierz wariant karuzeli</p>
      <div className="featured-carousel-lab__controls" role="group" aria-label="Wybór wariantu karuzeli">
        {labels.map((label, index) => <button key={label} type="button" aria-pressed={activeVariant === index + 1} className={activeVariant === index + 1 ? "is-active" : ""} onClick={() => onChange(index + 1)}>{label}</button>)}
      </div>
    </aside>
  );
}

function EditorialOfferGroup({ offers, start, className = "" }) {
  const visibleOffers = offers.slice(start, start + 3);
  return <div className={`home-offers-grid home-offers-grid--editorial home-offers-grid--count-${visibleOffers.length} ${className}`.trim()}>
    {visibleOffers.map((offer, index) => <div className="home-offers-grid__item" key={offer.id} style={{ "--editorial-stagger": `${index * 150}ms` }}><OfferCard offer={offer} index={index} /></div>)}
  </div>;
}

function FeaturedCarouselEditorial({ offers, activeOfferId, onActiveOfferChange }) {
  const starts = useMemo(() => getGroupStarts(offers.length), [offers.length]);
  const activeIndex = getOfferIndex(offers, activeOfferId);
  const desiredGroup = Math.min(Math.floor(activeIndex / 3), starts.length - 1);
  const [shownGroup, setShownGroup] = useState(desiredGroup);
  const [transition, setTransition] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [pauseUntil, setPauseUntil] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const timers = useRef({ transition: null, autoplay: null, resume: null });
  const clearTimer = (name) => { window.clearTimeout(timers.current[name]); timers.current[name] = null; };

  useEffect(() => () => Object.keys(timers.current).forEach(clearTimer), []);
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactQuery = window.matchMedia("(max-width: 700px)");
    const sync = () => { setReducedMotion(motionQuery.matches); setCompactLayout(compactQuery.matches); };
    sync();
    motionQuery.addEventListener("change", sync);
    compactQuery.addEventListener("change", sync);
    return () => { motionQuery.removeEventListener("change", sync); compactQuery.removeEventListener("change", sync); };
  }, []);
  useEffect(() => {
    const syncVisibility = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);
  useEffect(() => {
    if (!transition && shownGroup !== desiredGroup) setShownGroup(desiredGroup);
  }, [desiredGroup, shownGroup, transition]);

  const pauseAfterInteraction = () => {
    clearTimer("autoplay");
    clearTimer("resume");
    const until = Date.now() + 12000;
    setPauseUntil(until);
    timers.current.resume = window.setTimeout(() => setPauseUntil(0), 12000);
  };

  const selectGroup = (nextGroup, source = "manual", directionOverride) => {
    if (nextGroup === shownGroup || transition) return;
    if (source === "manual") pauseAfterInteraction();
    const duration = 1380;
    const direction = directionOverride || (nextGroup > shownGroup ? "forward" : "backward");
    setTransition({ from: shownGroup, to: nextGroup, direction, duration });
    onActiveOfferChange(offers[starts[nextGroup]].id);
    clearTimer("transition");
    timers.current.transition = window.setTimeout(() => { setShownGroup(nextGroup); setTransition(null); }, duration);
  };
  useEffect(() => {
    clearTimer("autoplay");
    if (starts.length < 2 || transition || reducedMotion || compactLayout || isHovered || hasFocus || !isPageVisible || pauseUntil) return undefined;
    timers.current.autoplay = window.setTimeout(() => selectGroup((shownGroup + 1) % starts.length, "autoplay", "forward"), 7000);
    return () => clearTimer("autoplay");
  }, [compactLayout, hasFocus, isHovered, isPageVisible, pauseUntil, reducedMotion, shownGroup, starts.length, transition]);
  const moveBy = (amount) => selectGroup((shownGroup + amount + starts.length) % starts.length, "manual", amount > 0 ? "forward" : "backward");
  const onKeyDown = (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); moveBy(1); }
  };
  const swipeProps = useMobileCarouselSwipe(moveBy);
  return (
    <div className="featured-carousel-editorial" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onFocusCapture={() => setHasFocus(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false); }} onKeyDown={onKeyDown} {...swipeProps}>
      {starts.length > 1 && <div className="home-featured__group-navigation" aria-label="Przeglądaj zestawy ofert">
        <div className="home-featured__group-bar" role="group" aria-label="Grupy wyróżnionych ofert">{starts.map((start, index) => <button className={index === shownGroup ? "is-active" : ""} type="button" key={start} onClick={() => selectGroup(index)} aria-label={`Pokaż grupę ofert ${index + 1} z ${starts.length}`} aria-current={index === shownGroup ? "true" : undefined}><span /></button>)}</div>
        <div className="home-featured__group-controller"><span aria-live="polite">{String(starts[shownGroup] + 1).padStart(2, "0")} / {String(offers.length).padStart(2, "0")}</span><div className="home-featured__group-arrows"><button type="button" onClick={() => moveBy(-1)} aria-label="Poprzednia grupa ofert"><ArrowLeft aria-hidden="true" /></button><button type="button" onClick={() => moveBy(1)} aria-label="Następna grupa ofert"><ArrowRight aria-hidden="true" /></button></div></div>
      </div>}
      <div className={`featured-carousel-editorial__scene ${transition ? `is-transitioning is-${transition.direction}` : ""}`} style={{ "--editorial-duration": `${transition?.duration || 1380}ms` }}>
        {transition ? <><EditorialOfferGroup offers={offers} start={starts[transition.from]} className="is-outgoing" /><EditorialOfferGroup offers={offers} start={starts[transition.to]} className="is-incoming" /></> : <EditorialOfferGroup offers={offers} start={starts[shownGroup]} />}
      </div>
    </div>
  );
}

function FeaturedOfferDetails({ offer, inverted = false, hidden = false, showDetailLink = true, showFacts = true }) {
  const location = formatLocation(offer.location) || "Wrocław i okolice";
  return <div className={`featured-active-offer ${inverted ? "is-inverted" : ""}`} aria-live={hidden ? undefined : "polite"} aria-hidden={hidden || undefined}>
    <p><MapPin aria-hidden="true" />{location}</p>
    <h3 className={`is-${getTitleLengthClass(offer.title)}`}>{offer.title}</h3>
    {showFacts && <div className="featured-active-offer__facts"><strong>{formatPrice(offer)}</strong><span>{offerMeta(offer)}</span></div>}
    {showDetailLink && <a href={buildOfferPath(offer)} tabIndex={hidden ? -1 : undefined}>Zobacz szczegóły oferty <ArrowUpRight aria-hidden="true" /></a>}
  </div>;
}

function getDirection(fromIndex, targetIndex, count, directionHint) {
  if (directionHint) return directionHint > 0 ? "forward" : "backward";
  const forward = (targetIndex - fromIndex + count) % count;
  const backward = (fromIndex - targetIndex + count) % count;
  return forward <= backward ? "forward" : "backward";
}

function useLatestOfferNavigation(offers, initialOfferId, onCommit, reducedMotion, timing = {}) {
  const initialIndex = getOfferIndex(offers, initialOfferId);
  const [state, setState] = useState(() => ({ committedIndex: initialIndex, requestedIndex: initialIndex, fromIndex: initialIndex, transitionTargetIndex: null, direction: "forward", generation: 0, duration: 0 }));
  const committedRef = useRef(initialIndex);
  const visualRef = useRef(initialIndex);
  const requestedRef = useRef(initialIndex);
  const generationRef = useRef(0);
  const aggregateTimer = useRef(null);
  const completionTimer = useRef(null);
  const directionRef = useRef(1);
  const requestCountRef = useRef(0);

  useEffect(() => () => { window.clearTimeout(aggregateTimer.current); window.clearTimeout(completionTimer.current); }, []);
  useEffect(() => {
    const known = offers.some((offer) => String(offer.id) === String(initialOfferId));
    if (!known) return;
    const index = getOfferIndex(offers, initialOfferId);
    if (!state.transitionTargetIndex && index !== committedRef.current) {
      committedRef.current = index;
      visualRef.current = index;
      requestedRef.current = index;
      setState((current) => ({ ...current, committedIndex: index, requestedIndex: index, fromIndex: index }));
    }
  }, [initialOfferId, offers, state.transitionTargetIndex]);

  const startLatest = () => {
    const targetIndex = requestedRef.current;
    const fromIndex = visualRef.current;
    if (targetIndex === fromIndex) return;
    const direction = getDirection(fromIndex, targetIndex, offers.length, directionRef.current);
    const distance = direction === "forward" ? (targetIndex - fromIndex + offers.length) % offers.length : (fromIndex - targetIndex + offers.length) % offers.length;
    const requestCount = requestCountRef.current;
    requestCountRef.current = 0;
    const duration = reducedMotion ? 0 : requestCount > 1 ? (timing.rapid || 900) : distance > 1 ? (timing.multi || 1100) : (timing.single || 980);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    visualRef.current = targetIndex;
    window.clearTimeout(completionTimer.current);
    setState((current) => ({ ...current, fromIndex, transitionTargetIndex: targetIndex, direction, generation, duration }));
    completionTimer.current = window.setTimeout(() => {
      if (generation !== generationRef.current) return;
      committedRef.current = targetIndex;
      setState((current) => current.generation === generation ? { ...current, committedIndex: targetIndex, transitionTargetIndex: null } : current);
      onCommit(offers[targetIndex].id);
    }, duration);
  };

  const requestIndex = (index, directionHint) => {
    const targetIndex = (index + offers.length) % offers.length;
    requestCountRef.current += 1;
    requestedRef.current = targetIndex;
    directionRef.current = directionHint || getDirection(visualRef.current, targetIndex, offers.length);
    setState((current) => ({ ...current, requestedIndex: targetIndex }));
    window.clearTimeout(aggregateTimer.current);
    aggregateTimer.current = window.setTimeout(startLatest, reducedMotion ? 0 : 72);
  };
  const moveBy = (amount) => requestIndex((requestedRef.current + amount + offers.length) % offers.length, amount);
  const currentIndex = state.transitionTargetIndex ?? state.committedIndex;
  return { ...state, currentIndex, requestIndex, moveBy };
}

function getCircularDistance(fromIndex, targetIndex, count, direction) {
  return direction === "forward" ? (targetIndex - fromIndex + count) % count : (fromIndex - targetIndex + count) % count;
}

function BackdropPreviewTrack({ offers, activeIndex, fromIndex, isTransitioning, onSelect, direction, duration, generation }) {
  const trackCycles = 11;
  const homeCycle = Math.floor(trackCycles / 2);
  const trackRef = useRef(null);
  const logicalPositionRef = useRef(offers.length * homeCycle + activeIndex);
  const framesRef = useRef([]);
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState(() => ({ offset: 0, moving: false }));
  const previewOffers = useMemo(() => Array.from({ length: trackCycles }, () => offers).flat(), [offers, trackCycles]);
  const readOffset = () => {
    const transform = getComputedStyle(trackRef.current).transform;
    const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform);
    return matrix ? matrix.m41 : track.offset;
  };

  useLayoutEffect(() => {
    const measure = () => {
      const card = trackRef.current?.querySelector(".featured-backdrop-preview-card");
      if (!card) return;
      const gap = Number.parseFloat(getComputedStyle(trackRef.current).gap) || 0;
      const nextStep = card.getBoundingClientRect().width + gap;
      setStep(nextStep);
      setTrack((current) => current.offset === 0 ? { ...current, offset: -(logicalPositionRef.current + 1) * nextStep } : current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [offers.length]);

  useEffect(() => {
    framesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    framesRef.current = [];
    if (!step || !isTransitioning) return undefined;
    const distance = Math.max(1, getCircularDistance(fromIndex, activeIndex, offers.length, direction));
    logicalPositionRef.current += direction === "forward" ? distance : -distance;
    const currentOffset = readOffset();
    const targetOffset = -(logicalPositionRef.current + 1) * step;
    setTrack({ offset: currentOffset, moving: false });
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => setTrack({ offset: targetOffset, moving: true }));
      framesRef.current = [secondFrame];
    });
    framesRef.current = [firstFrame];
    return () => framesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
  }, [activeIndex, direction, fromIndex, generation, isTransitioning, offers.length, step]);

  useEffect(() => {
    if (isTransitioning || !step) return;
    const rebased = offers.length * homeCycle + activeIndex;
    logicalPositionRef.current = rebased;
    setTrack({ offset: -(rebased + 1) * step, moving: false });
  }, [activeIndex, isTransitioning, offers.length, step]);

  return <div ref={trackRef} className={`featured-backdrop-previews__track ${track.moving ? "is-moving" : ""}`} style={{ "--backdrop-track-duration": `${duration}ms`, transform: `translate3d(${track.offset}px, 0, 0)` }}>
    {previewOffers.map((offer, occurrence) => {
      const image = getPrimaryOfferImage(offer);
      const offerIndex = getOfferIndex(offers, offer.id);
      return <button className="featured-backdrop-preview-card" type="button" key={`${offer.id}-${occurrence}`} onClick={() => onSelect(offerIndex)} aria-label={`Wybierz ofertę: ${offer.title}`}><span className="featured-backdrop-preview-card__image">{image ? <img src={image.url} alt="" loading="lazy" /> : <i>PropertyCorp</i>}</span></button>;
    })}
  </div>;
}

function FeaturedCarouselBackdrop({ offers, activeOfferId, onActiveOfferChange, onVisualOfferChange }) {
  const reducedMotion = useReducedMotion();
  const navigation = useLatestOfferNavigation(offers, activeOfferId, onActiveOfferChange, reducedMotion, { single: 1680, multi: 1760, rapid: 920 });
  const autoplay = useCarouselAutoplay({ canAdvance: offers.length > 1, isTransitioning: navigation.transitionTargetIndex !== null, reducedMotion, onAdvance: () => navigation.moveBy(1) });
  const activeOffer = offers[navigation.currentIndex];
  const backgroundDuration = reducedMotion ? 0 : navigation.duration + 180;
  const moveBy = (amount) => { autoplay.pauseAfterInteraction(); navigation.moveBy(amount); };
  const selectOffer = (index) => { autoplay.pauseAfterInteraction(); navigation.requestIndex(index); };
  const swipeProps = useMobileCarouselSwipe(moveBy);
  useEffect(() => {
    onVisualOfferChange?.(activeOffer.id);
  }, [activeOffer.id, onVisualOfferChange]);
  return <div className={`featured-carousel-backdrop is-moving-${navigation.direction}`} style={{ "--backdrop-duration": `${backgroundDuration}ms` }} {...autoplay.interactionProps} {...swipeProps}>
    <div className="featured-carousel-backdrop__inner">
      <FeaturedOfferDetails key={activeOffer.id} offer={activeOffer} inverted showDetailLink={false} />
      <div className="featured-backdrop-previews">
        <div className="featured-backdrop-previews__controls"><button type="button" onClick={() => moveBy(-1)} aria-label="Poprzednia oferta"><ArrowLeft aria-hidden="true" /></button><span>{String(navigation.currentIndex + 1).padStart(2, "0")} / {String(offers.length).padStart(2, "0")}</span><button type="button" onClick={() => moveBy(1)} aria-label="Następna oferta"><ArrowRight aria-hidden="true" /></button></div>
        <div className="featured-backdrop-previews__stage" aria-label="Pozostałe wyróżnione oferty"><BackdropPreviewTrack offers={offers} activeIndex={navigation.currentIndex} fromIndex={navigation.fromIndex} isTransitioning={navigation.transitionTargetIndex !== null} onSelect={selectOffer} direction={navigation.direction} duration={navigation.duration} generation={navigation.generation} /></div>
      </div>
    </div>
  </div>;
}

function getTitleLengthClass(title) {
  if (title.length > 68) return "long";
  if (title.length > 42) return "medium";
  return "short";
}

function getCircularSlot(index, centerIndex, count) {
  let slot = index - centerIndex;
  if (slot > count / 2) slot -= count;
  if (slot < -count / 2) slot += count;
  return slot;
}

function useFanScene(offers, initialOfferId, onCommit, reducedMotion, onVisualChange = null) {
  const initialIndex = getOfferIndex(offers, initialOfferId);
  const [scene, setScene] = useState(() => ({ displayIndex: initialIndex, targetIndex: null, phase: "idle", direction: "forward", generation: 0, duration: 0 }));
  const committedRef = useRef(initialIndex);
  const visualRef = useRef(initialIndex);
  const requestedRef = useRef(initialIndex);
  const generationRef = useRef(0);
  const aggregateTimer = useRef(null);
  const completionTimer = useRef(null);
  const animationFrames = useRef([]);
  const requestCountRef = useRef(0);
  const directionRef = useRef(1);

  useEffect(() => () => {
    window.clearTimeout(aggregateTimer.current);
    window.clearTimeout(completionTimer.current);
    animationFrames.current.forEach((frame) => window.cancelAnimationFrame(frame));
  }, []);

  useEffect(() => {
    const externalIndex = getOfferIndex(offers, initialOfferId);
    if (scene.phase === "idle" && externalIndex !== committedRef.current) {
      committedRef.current = externalIndex;
      visualRef.current = externalIndex;
      requestedRef.current = externalIndex;
      setScene((current) => ({ ...current, displayIndex: externalIndex, targetIndex: null }));
    }
  }, [initialOfferId, offers, scene.phase]);

  const commit = (generation, targetIndex) => {
    if (generation !== generationRef.current) return;
    committedRef.current = targetIndex;
    setScene((current) => current.generation === generation ? { ...current, displayIndex: targetIndex, targetIndex: null, phase: "idle" } : current);
    onCommit(offers[targetIndex].id);
  };

  const startLatest = () => {
    const targetIndex = requestedRef.current;
    const fromIndex = visualRef.current;
    if (targetIndex === fromIndex) return;
    const direction = getDirection(fromIndex, targetIndex, offers.length, directionRef.current);
    const distance = getCircularDistance(fromIndex, targetIndex, offers.length, direction);
    const requestCount = requestCountRef.current;
    requestCountRef.current = 0;
    const duration = reducedMotion ? 0 : requestCount > 1 ? 980 : distance > 1 ? 1880 : 1720;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    visualRef.current = targetIndex;
    window.clearTimeout(completionTimer.current);
    animationFrames.current.forEach((frame) => window.cancelAnimationFrame(frame));
    animationFrames.current = [];
    setScene((current) => ({ ...current, displayIndex: fromIndex, targetIndex, phase: "prepare", direction, generation, duration }));
    if (reducedMotion) {
      commit(generation, targetIndex);
      return;
    }
    const prepareFrame = window.requestAnimationFrame(() => {
      const animateFrame = window.requestAnimationFrame(() => {
        if (generation === generationRef.current) setScene((current) => current.generation === generation ? { ...current, phase: "animate" } : current);
      });
      animationFrames.current = [animateFrame];
    });
    animationFrames.current = [prepareFrame];
    completionTimer.current = window.setTimeout(() => commit(generation, targetIndex), duration + 34);
  };

  const requestIndex = (index, directionHint) => {
    const targetIndex = (index + offers.length) % offers.length;
    requestCountRef.current += 1;
    requestedRef.current = targetIndex;
    onVisualChange?.(offers[targetIndex].id);
    directionRef.current = directionHint || getDirection(visualRef.current, targetIndex, offers.length);
    window.clearTimeout(aggregateTimer.current);
    aggregateTimer.current = window.setTimeout(startLatest, reducedMotion ? 0 : 72);
  };

  return { ...scene, currentIndex: scene.targetIndex ?? scene.displayIndex, requestIndex, moveBy: (amount) => requestIndex((requestedRef.current + amount + offers.length) % offers.length, amount) };
}

function useRetargetableFanScene(offers, initialOfferId, onTargetChange, reducedMotion, onVisualChange = null) {
  const initialIndex = getOfferIndex(offers, initialOfferId);
  const [scene, setScene] = useState(() => ({ displayIndex: initialIndex, targetIndex: null, phase: "idle", direction: "forward", generation: 0, duration: reducedMotion ? 0 : 1720 }));
  const targetRef = useRef(initialIndex);
  const directionRef = useRef(1);

  const requestIndex = (index, directionHint) => {
    const targetIndex = (index + offers.length) % offers.length;
    const fromIndex = targetRef.current;
    if (targetIndex === fromIndex) return;
    const direction = directionHint || getDirection(fromIndex, targetIndex, offers.length, directionRef.current);
    targetRef.current = targetIndex;
    directionRef.current = direction;
    setScene((current) => ({ ...current, displayIndex: targetIndex, targetIndex: null, phase: "idle", direction, generation: current.generation + 1, duration: reducedMotion ? 0 : 1720 }));
    onVisualChange?.(offers[targetIndex].id);
    onTargetChange(offers[targetIndex].id);
  };

  return { ...scene, currentIndex: scene.displayIndex, requestIndex, moveBy: (amount) => requestIndex((targetRef.current + amount + offers.length) % offers.length, amount) };
}

function FanCardInfo({ offer, hidden }) {
  const titleLength = getTitleLengthClass(offer.title);
  return <div className={`featured-fan-card__info featured-fan-card__info--${titleLength}`} aria-hidden={hidden || undefined}>
    <p><MapPin aria-hidden="true" />{formatLocation(offer.location) || "Wrocław i okolice"}</p>
    <h3>{offer.title}</h3>
    <div><strong>{formatPrice(offer)}</strong><span>{offerMeta(offer)}</span></div>
  </div>;
}

function FanDeck({ offers, navigation, onMove, onSelect, showInfo = true, className = "" }) {
  const slotCenter = navigation.phase === "prepare" ? navigation.displayIndex : navigation.currentIndex;
  const positions = offers.map((offer, index) => ({ offer, offset: getCircularSlot(index, slotCenter, offers.length) }));
  return <div className={`featured-carousel-fan__cards ${className}`.trim()} aria-label="Karuzela wyróżnionych ofert">
    {positions.map(({ offset, offer }) => {
      const image = getPrimaryOfferImage(offer);
      const isActive = offset === 0;
      const isCommittedActive = navigation.phase === "idle" && isActive;
      const edge = Math.min(Math.abs(offset), 3);
      const canSelectCard = !isActive && edge === 1;
      const offsetClass = `featured-fan-card--${isActive ? "active" : offset < 0 ? `left-${edge}` : `right-${edge}`}`;
      return <article className={`featured-fan-card ${offsetClass} ${showInfo && isActive ? "is-panel-visible" : ""}`} key={offer.id} aria-current={isActive ? "true" : undefined} aria-hidden={edge >= 3 || undefined}>
        <div className="featured-fan-card__image">{image ? <img src={image.url} alt={isCommittedActive ? offer.title : ""} loading={isActive ? "eager" : "lazy"} /> : <span>PropertyCorp</span>}</div>
        {canSelectCard && <button className="featured-fan-card__select" type="button" onClick={() => onSelect(getOfferIndex(offers, offer.id), offset)} aria-label={`Pokaż ofertę: ${offer.title}`} />}
        {showInfo && <FanCardInfo offer={offer} hidden={!isActive} />}
      </article>;
    })}
    <div className="featured-fan-controls"><button type="button" onClick={() => onMove(-1)} aria-label="Poprzednia oferta"><ArrowLeft aria-hidden="true" /></button><span>{String(navigation.currentIndex + 1).padStart(2, "0")} / {String(offers.length).padStart(2, "0")}</span><i aria-hidden="true" style={{ "--fan-progress": `${((navigation.currentIndex + 1) / offers.length) * 100}%` }} /><button type="button" onClick={() => onMove(1)} aria-label="Następna oferta"><ArrowRight aria-hidden="true" /></button></div>
  </div>;
}

function FeaturedCarouselFan({ offers, activeOfferId, onActiveOfferChange, onVisualOfferChange }) {
  const reducedMotion = useReducedMotion();
  const navigation = useFanScene(offers, activeOfferId, onActiveOfferChange, reducedMotion);
  const autoplay = useCarouselAutoplay({ canAdvance: offers.length > 1, isTransitioning: navigation.phase !== "idle", reducedMotion, onAdvance: () => navigation.moveBy(1) });
  const activeOffer = offers[navigation.currentIndex];
  const backgroundDuration = reducedMotion ? 0 : navigation.duration + 220;
  const moveBy = (amount) => { autoplay.pauseAfterInteraction(); navigation.moveBy(amount); };
  const selectOffer = (index, direction) => { autoplay.pauseAfterInteraction(); navigation.requestIndex(index, direction); };
  const swipeProps = useMobileCarouselSwipe(moveBy);
  useEffect(() => {
    onVisualOfferChange?.(activeOffer.id);
  }, [activeOffer.id, onVisualOfferChange]);
  return <div className={`featured-carousel-fan is-moving-${navigation.direction} is-${navigation.phase}`} style={{ "--fan-duration": `${navigation.duration}ms`, "--fan-backdrop-duration": `${backgroundDuration}ms` }} {...autoplay.interactionProps} {...swipeProps} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(-1); } if (event.key === "ArrowRight") { event.preventDefault(); moveBy(1); } }}>
    <FanDeck offers={offers} navigation={navigation} onMove={moveBy} onSelect={selectOffer} />
  </div>;
}

function FeaturedCarouselHybrid({ offers, activeOfferId, onActiveOfferChange, onVisualOfferChange }) {
  const reducedMotion = useReducedMotion();
  const navigation = useRetargetableFanScene(offers, activeOfferId, onActiveOfferChange, reducedMotion, onVisualOfferChange);
  const autoplay = useCarouselAutoplay({ canAdvance: offers.length > 1, isTransitioning: navigation.phase !== "idle", reducedMotion, onAdvance: () => navigation.moveBy(1) });
  const activeOffer = offers[navigation.currentIndex];
  const moveBy = (amount) => { autoplay.pauseAfterInteraction(); navigation.moveBy(amount); };
  const selectOffer = (index, direction) => { autoplay.pauseAfterInteraction(); navigation.requestIndex(index, direction); };
  const swipeProps = useMobileCarouselSwipe(moveBy);
  return <div className={`featured-carousel-hybrid is-moving-${navigation.direction} is-${navigation.phase}`} style={{ "--fan-duration": `${navigation.duration}ms` }} {...autoplay.interactionProps} {...swipeProps} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); moveBy(-1); } if (event.key === "ArrowRight") { event.preventDefault(); moveBy(1); } }}>
    <div className="featured-carousel-hybrid__inner">
      <FeaturedOfferDetails key={activeOffer.id} offer={activeOffer} inverted showDetailLink={false} />
      <FanDeck offers={offers} navigation={navigation} onMove={moveBy} onSelect={selectOffer} showInfo={false} className="featured-carousel-hybrid__fan" />
    </div>
  </div>;
}

export function FeaturedPropertiesSection({ offers, loading }) {
  const [variant, setVariant] = useState(() => {
    const requestedVariant = typeof window === "undefined" ? null : getRequestedVariant(window.location.search, "carouselVariant", VARIANTS);
    return resolveEditionVariant(siteEditionConfig, requestedVariant, "featuredVariant");
  });
  const [activeOfferId, setActiveOfferId] = useState(() => offers[0]?.id);
  const [hybridBackgroundOfferId, setHybridBackgroundOfferId] = useState(() => offers[0]?.id);
  const [featuredBackgroundOfferId, setFeaturedBackgroundOfferId] = useState(() => offers[0]?.id);
  useOfferImagePreload(offers, activeOfferId);
  useEffect(() => {
    if (offers.length && !offers.some((offer) => String(offer.id) === String(activeOfferId))) setActiveOfferId(offers[0].id);
  }, [activeOfferId, offers]);
  const updateFeaturedBackground = useCallback((offerId) => setFeaturedBackgroundOfferId((current) => String(current) === String(offerId) ? current : offerId), []);
  const selectVariant = (nextVariant) => {
    if (!siteEditionConfig.variantSelectionEnabled) return;
    if (nextVariant === 4) setHybridBackgroundOfferId(activeOfferId);
    if (nextVariant === 2 || nextVariant === 3) updateFeaturedBackground(activeOfferId);
    setVariant(nextVariant);
    const url = new URL(window.location.href);
    url.searchParams.set("carouselVariant", String(nextVariant));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const committedOffer = offers[getOfferIndex(offers, activeOfferId)];
  const actionsDetailHref = variant > 1 && committedOffer ? buildOfferPath(committedOffer) : null;
  const hybridBackgroundOffer = offers[getOfferIndex(offers, hybridBackgroundOfferId)];
  const hybridBackground = variant === 4 && hybridBackgroundOffer ? getPrimaryOfferImage(hybridBackgroundOffer)?.url : null;
  const featuredBackgroundOffer = offers[getOfferIndex(offers, featuredBackgroundOfferId)];
  const featuredBackground = (variant === 2 || variant === 3) && featuredBackgroundOffer ? getPrimaryOfferImage(featuredBackgroundOffer)?.url : null;
  const backgroundImage = hybridBackground || featuredBackground;
  const carousel = loading ? <div className="home-offers-loading" aria-live="polite">Wczytujemy aktualne nieruchomości…</div> : !offers.length ? <div className="home-offers-loading">Brak aktualnych nieruchomości do pokazania.</div> : variant === 1 ? <FeaturedCarouselEditorial offers={offers} activeOfferId={activeOfferId} onActiveOfferChange={setActiveOfferId} /> : variant === 2 ? <FeaturedCarouselBackdrop offers={offers} activeOfferId={activeOfferId} onActiveOfferChange={setActiveOfferId} onVisualOfferChange={updateFeaturedBackground} /> : variant === 3 ? <FeaturedCarouselFan offers={offers} activeOfferId={activeOfferId} onActiveOfferChange={setActiveOfferId} onVisualOfferChange={updateFeaturedBackground} /> : <FeaturedCarouselHybrid offers={offers} activeOfferId={activeOfferId} onActiveOfferChange={setActiveOfferId} onVisualOfferChange={setHybridBackgroundOfferId} />;
  const trackFeaturedOfferClick = (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const targetPath = new URL(link.href, window.location.href).pathname;
    const targetOffer = offers.find((offer) => buildOfferPath(offer) === targetPath);
    if (targetOffer) trackEvent("click_featured_offer", { offer_id: String(targetOffer.id), carousel_variant: String(variant) });
  };
  const backgroundDuration = variant === 2 || variant === 4 ? FEATURED_CINEMATIC_BACKGROUND_DURATION : 1180;
  return <section className={`home-featured home-featured--variant-${variant}${siteEditionConfig.variantSelectionEnabled ? " has-carousel-lab" : ""}`} id="oferty" onClick={trackFeaturedOfferClick}>{backgroundImage && <FeaturedBackgroundLayer imageUrl={backgroundImage} duration={backgroundDuration} mobileDuration={variant === 2 || variant === 4 ? FEATURED_CINEMATIC_MOBILE_BACKGROUND_DURATION : null} />}{siteEditionConfig.variantSelectionEnabled && <div className="featured-carousel-lab-inline"><CarouselVariantSwitcher activeVariant={variant} onChange={selectVariant} /></div>}<div className="final-shell"><FeaturedHeading actionsDetailHref={actionsDetailHref} /><Reveal className="home-featured__stage-reveal" delay={REVEAL_MOTION.action.delay} duration={REVEAL_MOTION.media.duration}><div className="featured-carousel-variant" key={variant}>{carousel}</div></Reveal></div></section>;
}
