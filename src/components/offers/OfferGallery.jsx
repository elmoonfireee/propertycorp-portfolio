import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Image as ImageIcon, X } from "lucide-react";
import { trackEvent } from "../../analytics/googleAnalytics.js";

function imageAlt(title, index, count) {
  return `Zdjęcie ${index + 1} z ${count}: ${title}`;
}

const IMAGES_PER_GROUP = 4;

function groupImages(images) {
  const groups = [];
  for (let index = 0; index < images.length; index += IMAGES_PER_GROUP) groups.push(images.slice(index, index + IMAGES_PER_GROUP));
  return groups;
}

function OfferLightbox({ images, initialIndex, title, onClose }) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  const showPrevious = () => setActiveIndex((index) => (index - 1 + images.length) % images.length);
  const showNext = () => setActiveIndex((index) => (index + 1) % images.length);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll("button:not([disabled])");
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
      previousFocusRef.current?.focus?.();
    };
  }, [images.length, onClose]);

  const touchStart = useRef(null);
  const onTouchStart = (event) => { touchStart.current = event.touches[0]?.clientX ?? null; };
  const onTouchEnd = (event) => {
    const end = event.changedTouches[0]?.clientX;
    if (touchStart.current == null || end == null) return;
    const distance = end - touchStart.current;
    if (Math.abs(distance) > 40) (distance > 0 ? showPrevious : showNext)();
    touchStart.current = null;
  };

  const image = images[activeIndex];
  const lightbox = (
    <div className="offer-lightbox" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="offer-lightbox__dialog" role="dialog" aria-modal="true" aria-label={`Galeria zdjęć: ${title}`} tabIndex={-1}>
        <div className="offer-lightbox__bar">
          <span>{String(activeIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>
          <button type="button" aria-label="Zamknij galerię" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
        <div className="offer-lightbox__image" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {failedImages.has(image.url) ? <GalleryPlaceholder /> : <img src={image.url} alt={imageAlt(title, activeIndex, images.length)} onError={() => setFailedImages((previous) => new Set(previous).add(image.url))} />}
        </div>
        {images.length > 1 && <>
          <button type="button" className="offer-lightbox__nav offer-lightbox__nav--previous" aria-label="Poprzednie zdjęcie" onClick={showPrevious}><ArrowLeft aria-hidden="true" /></button>
          <button type="button" className="offer-lightbox__nav offer-lightbox__nav--next" aria-label="Następne zdjęcie" onClick={showNext}><ArrowRight aria-hidden="true" /></button>
        </>}
      </section>
    </div>
  );

  return createPortal(lightbox, document.body);
}

function GalleryPlaceholder() {
  return (
    <div className="offer-gallery__placeholder" aria-label="Zdjęcie oferty jest w przygotowaniu" role="img">
      <span>PropertyCorp</span>
      <i aria-hidden="true" />
    </div>
  );
}

function GalleryGroup({ activeGroup, groupIndex, images, offerTitle, totalImages, onOpen, suppressClickRef }) {
  const [failedImages, setFailedImages] = useState(() => new Set());
  const groupStart = groupIndex * IMAGES_PER_GROUP;
  return (
    <div className={`offer-gallery__grid offer-gallery__grid--${images.length}`} role="group" aria-label={`Zdjęcia ${groupStart + 1}–${groupStart + images.length} z ${totalImages}`} aria-hidden={groupIndex !== activeGroup}>
      {images.map((image, index) => {
        const imageIndex = groupStart + index;
        return (
          <button
            key={image.filename}
            type="button"
            className={`offer-gallery__item offer-gallery__item--${index + 1}`}
            aria-label={`Otwórz ${imageAlt(offerTitle, imageIndex, totalImages)}`}
            tabIndex={groupIndex === activeGroup ? 0 : -1}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onOpen(imageIndex);
            }}
          >
            {failedImages.has(image.url) ? <GalleryPlaceholder /> : <img src={image.url} alt={imageAlt(offerTitle, imageIndex, totalImages)} loading={groupIndex === activeGroup && index === 0 ? "eager" : "lazy"} onError={() => setFailedImages((previous) => new Set(previous).add(image.url))} />}
          </button>
        );
      })}
    </div>
  );
}

export function OfferGallery({ offer }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const images = offer.images || [];
  const groups = useMemo(() => groupImages(images), [images]);
  const [activeGroup, setActiveGroup] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [pauseUntil, setPauseUntil] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const touchStartRef = useRef(null);
  const suppressClickRef = useRef(false);
  const timersRef = useRef({ autoplay: null, resume: null });
  const canMovePrevious = activeGroup > 0;
  const canMoveNext = activeGroup < groups.length - 1;

  const clearTimer = (name) => {
    if (timersRef.current[name] != null) window.clearTimeout(timersRef.current[name]);
    timersRef.current[name] = null;
  };

  useEffect(() => () => Object.keys(timersRef.current).forEach(clearTimer), []);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactQuery = window.matchMedia("(max-width: 700px)");
    const sync = () => {
      setReducedMotion(motionQuery.matches);
      setCompactLayout(compactQuery.matches);
    };
    sync();
    motionQuery.addEventListener("change", sync);
    compactQuery.addEventListener("change", sync);
    return () => {
      motionQuery.removeEventListener("change", sync);
      compactQuery.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const syncVisibility = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    setActiveGroup(0);
    setLightboxIndex(null);
    clearTimer("resume");
    setPauseUntil(0);
  }, [offer.id]);

  useEffect(() => {
    if (!groups.length || typeof window === "undefined") return undefined;
    const preloadGroups = [activeGroup - 1, activeGroup, activeGroup + 1]
      .filter((groupIndex) => groupIndex >= 0 && groupIndex < groups.length)
      .flatMap((groupIndex) => groups[groupIndex]);
    const preloadedImages = preloadGroups.map((image) => {
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = image.url;
      return preload;
    });
    return () => { preloadedImages.forEach((image) => { image.src = ""; }); };
  }, [activeGroup, groups]);

  const pauseAfterInteraction = () => {
    clearTimer("autoplay");
    clearTimer("resume");
    setPauseUntil(Date.now() + 12000);
    timersRef.current.resume = window.setTimeout(() => setPauseUntil(0), 12000);
  };

  const moveBy = (amount, isManual = true) => {
    if (isManual) pauseAfterInteraction();
    setActiveGroup((groupIndex) => Math.max(0, Math.min(groups.length - 1, groupIndex + amount)));
  };

  useEffect(() => {
    clearTimer("autoplay");
    if (groups.length < 2 || activeGroup >= groups.length - 1 || reducedMotion || compactLayout || isHovered || hasFocus || !isPageVisible || pauseUntil) return undefined;
    timersRef.current.autoplay = window.setTimeout(() => moveBy(1, false), 7000);
    return () => clearTimer("autoplay");
  }, [activeGroup, compactLayout, groups.length, hasFocus, isHovered, isPageVisible, pauseUntil, reducedMotion]);

  const handleKeyDown = (event) => {
    if (lightboxIndex != null) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveBy(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(1);
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const distanceX = touch.clientX - start.x;
    const distanceY = touch.clientY - start.y;
    if (Math.abs(distanceX) < 48 || Math.abs(distanceX) < Math.abs(distanceY) * 1.15) return;
    suppressClickRef.current = true;
    moveBy(distanceX < 0 ? 1 : -1);
  };

  const openGallery = (imageIndex) => {
    trackEvent("view_offer_gallery", { offer_id: String(offer.id), image_count: images.length });
    setLightboxIndex(imageIndex);
  };

  return (
    <section className={`offer-gallery offer-gallery--${groups.length ? "ready" : "empty"}`} aria-label={`Galeria oferty: ${offer.title}`} aria-roledescription={groups.length > 1 ? "karuzela zdjęć" : undefined} tabIndex={groups.length > 1 ? 0 : undefined} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onFocusCapture={() => setHasFocus(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false); }} onKeyDown={handleKeyDown}>
      {groups.length ? <>
        <div className="offer-gallery__viewport" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchStartRef.current = null; }}>
          <div className="offer-gallery__track" style={{ transform: `translate3d(-${activeGroup * 100}%, 0, 0)` }}>
            {groups.map((group, groupIndex) => <GalleryGroup key={group[0]?.filename || groupIndex} activeGroup={activeGroup} groupIndex={groupIndex} images={group} offerTitle={offer.title} totalImages={images.length} onOpen={openGallery} suppressClickRef={suppressClickRef} />)}
          </div>
        </div>
        {groups.length > 1 && <>
          <button type="button" className="offer-gallery__nav offer-gallery__nav--previous" aria-label="Poprzednie zdjęcia" disabled={!canMovePrevious} onClick={() => moveBy(-1)}><ArrowLeft aria-hidden="true" /></button>
          <p className="offer-gallery__pagination" aria-live="polite">{String(activeGroup + 1).padStart(2, "0")} / {String(groups.length).padStart(2, "0")}</p>
          <button type="button" className="offer-gallery__nav offer-gallery__nav--next" aria-label="Następne zdjęcia" disabled={!canMoveNext} onClick={() => moveBy(1)}><ArrowRight aria-hidden="true" /></button>
        </>}
        <button type="button" className="offer-gallery__all" onClick={() => openGallery(0)}>
          <ImageIcon aria-hidden="true" />
          Powiększ zdjęcia <span>({images.length})</span>
        </button>
      </> : <GalleryPlaceholder />}
      {lightboxIndex != null && <OfferLightbox images={images} initialIndex={lightboxIndex} title={offer.title} onClose={() => setLightboxIndex(null)} />}
    </section>
  );
}
