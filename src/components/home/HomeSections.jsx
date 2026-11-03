import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Instagram, Maximize2, ShieldCheck, Star, X } from "lucide-react";
import { ContactForm } from "../contact/ContactForm.jsx";
import { FeaturedPropertiesSection } from "./FeaturedPropertiesSection.jsx";
import { siteAssets, warnAboutMissingSiteAsset } from "../../config/siteAssets.js";
import { SiteAssetImage } from "../media/SiteAssetImage.jsx";
import { Reveal, REVEAL_MOTION } from "./Reveal.jsx";
import { CollaborationScrollStory } from "./CollaborationScrollStory.jsx";
import { ConsentAwareOffersMap, OffersMapModal } from "../offers/OffersInteractiveMap.jsx";
import { ApproximateLocationNotice } from "../offers/ApproximateLocationNotice.jsx";
import { trackEvent } from "../../analytics/googleAnalytics.js";
import { SOCIAL_LINKS } from "../../config/siteLinks.js";
import { calculateFaqExtraRunway } from "./faqRunway.js";
import { createGoogleReviewModalContent, getGoogleReviewTickerTarget, normalizeGoogleReviews, resetGoogleReviewTickerAfterModalClose } from "./googleReviewsModel.js";

const HERO_SLIDE_DURATION = 4200;

function HeroMediaSequence() {
  const slides = siteAssets.hero.slides;
  const [activeSlide, setActiveSlide] = useState(0);
  const [exitingSlide, setExitingSlide] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  const available = slides.every((slide) => slide.delivered && slide.path);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion || !available || failed) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => {
        setExitingSlide(current);
        return (current + 1) % slides.length;
      });
    }, HERO_SLIDE_DURATION);
    return () => window.clearInterval(timer);
  }, [available, failed, reducedMotion, slides.length]);

  if (!available || failed) return <div className="home-hero-final__fallback" aria-hidden="true"><span /></div>;

  return (
    <div className={`home-hero-final__slides ${reducedMotion ? "is-reduced-motion" : ""}`} aria-hidden="true">
      {slides.map((slide, index) => (
        <img
          className={`home-hero-final__slide ${index === activeSlide ? "is-active" : ""} ${index === exitingSlide ? "is-exiting" : ""} ${slide.motion === "pan" ? "has-camera-motion" : "is-static"}`}
          key={slide.path}
          src={slide.path}
          alt=""
          loading="eager"
          style={{ "--hero-object-position": slide.position, "--hero-mobile-object-position": slide.mobilePosition }}
          onError={() => {
            slides.forEach((asset) => warnAboutMissingSiteAsset(asset, { force: true }));
            setFailed(true);
          }}
          onTransitionEnd={(event) => {
            if (event.propertyName === "opacity" && index === exitingSlide) setExitingSlide(null);
          }}
        />
      ))}
    </div>
  );
}

export function HomeHero() {
  return (
    <section className="home-hero-final" id="main-content">
      <HeroMediaSequence />
      <div className="home-hero-final__shade" />
      <div className="home-hero-final__content final-shell">
        <Reveal className="reveal--hero" {...REVEAL_MOTION.eyebrow} offset={48}><p>PropertyCorp · Wrocław i okolice</p></Reveal>
        <Reveal className="reveal--hero" {...REVEAL_MOTION.heading} offset={50}><h1>Dobrze prowadzone<br /><em>zmiany adresu.</em></h1></Reveal>
        <Reveal className="home-hero-final__bottom reveal--hero" {...REVEAL_MOTION.copy} offset={46}>
          <span className="pc-body-copy">Sprzedaż, zakup i wynajem nieruchomości — z uważnością na każdy etap decyzji.</span>
          <div><a className="button-light" href="/oferty">Zobacz nieruchomości <ArrowRight /></a><a className="hero-text-link" href="#kontakt">Porozmawiajmy <ArrowDownRight /></a></div>
        </Reveal>
      </div>
    </section>
  );
}

export function FeaturedOffers({ offers, loading }) {
  return <FeaturedPropertiesSection offers={offers} loading={loading} />;
}



export function CooperationSection() {
  return <CollaborationScrollStory />;
}

export function AboutTeam() {
  return (
    <section className="home-about" id="o-nas">
      <Reveal as="div" className="home-about__image" {...REVEAL_MOTION.media} offset={56}>
        <SiteAssetImage
          asset={siteAssets.team}
          alt="Zespół PropertyCorp"
          loading="lazy"
          fallback={<div className="home-about__fallback" aria-hidden="true"><span>PropertyCorp</span></div>}
        />
        <span>Zespół PropertyCorp · Wrocław</span>
      </Reveal>
      <div className="home-about__copy">
        <Reveal className="home-about__eyebrow" {...REVEAL_MOTION.heading}><p>Po drugiej stronie</p></Reveal>
        <Reveal className="home-about__heading" {...REVEAL_MOTION.copy}><h2>Masz człowieka<br />po swojej stronie.</h2></Reveal>
        <Reveal className="home-about__body" {...REVEAL_MOTION.action}><p className="home-body-copy pc-body-copy">Od pierwszego telefonu do przekazania kluczy rozmawiasz z ludźmi, którzy znają Twoją sprawę i wiedzą, co jest dla Ciebie ważne.</p><a href="#kontakt">Poznajmy się <ArrowRight /></a></Reveal>
      </div>
    </section>
  );
}

export function ExperienceSection() {
  const presenceLeadRef = useRef(null);

  return (
    <section className="home-experience" aria-label="Doświadczenie i skuteczność PropertyCorp">
      <div className="final-shell home-experience__inner">
        <article className="home-experience__row home-experience__row--sale">
          <div className="home-experience__copy">
            <Reveal as="p" {...REVEAL_MOTION.eyebrow}>Doświadczenie i skuteczność</Reveal>
            <Reveal as="h2" {...REVEAL_MOTION.heading}>Chcesz sprzedać nieruchomość bez stresu?</Reveal>
            <Reveal className="home-experience__lead" {...REVEAL_MOTION.copy}>
              <p className="home-body-copy pc-body-copy">Prowadzimy sprzedaż od pierwszego kontaktu aż po finalizację transakcji. Dbamy o przygotowanie oferty, prezentację nieruchomości, kontakt z zainteresowanymi i sprawne doprowadzenie sprawy do końca.</p>
            </Reveal>
            <Reveal as="ul" className="home-experience__points" {...REVEAL_MOTION.action}>
              <li>Pełna obsługa sprzedaży</li>
              <li>Przykładowe informacje o projekcie</li>
              <li>Zgłoś nieruchomość, a my zajmiemy się resztą</li>
            </Reveal>
            <Reveal className="home-experience__action" delay={760} duration={REVEAL_MOTION.action.duration}>
              <a href="#kontakt" aria-label="Zgłoś nieruchomość — przejdź do formularza kontaktowego">Zgłoś nieruchomość <ArrowRight aria-hidden="true" /></a>
            </Reveal>
          </div>
          <Reveal as="figure" className="home-experience__media home-experience__media--first" {...REVEAL_MOTION.media} offset={44}>
            <img src="/zdjecie1.jpg" alt="Agent PropertyCorp prezentujący materiały sprzedażowe" loading="lazy" />
          </Reveal>
        </article>

        <article className="home-experience__row home-experience__row--presence">
          <Reveal as="figure" className="home-experience__media home-experience__media--second" {...REVEAL_MOTION.media} offset={44}>
            <img src="/zdjecie2.jpg" alt="Przedstawicielka PropertyCorp podczas codziennej pracy" loading="lazy" />
          </Reveal>
          <div className="home-experience__copy">
            <Reveal as="p" {...REVEAL_MOTION.eyebrow}>PropertyCorp na co dzień</Reveal>
            <Reveal as="h2" {...REVEAL_MOTION.heading}>Doświadczenie widać nie tylko w ofercie, ale i w sposobie działania.</Reveal>
            <Reveal className="home-experience__lead" revealRef={presenceLeadRef} {...REVEAL_MOTION.copy}>
              <p className="home-body-copy pc-body-copy">Na co dzień pokazujemy kulisy naszej pracy, prezentacje nieruchomości i efekty współpracy z klientami. Zajrzyj na Instagram, aby lepiej poznać nasze podejście.</p>
            </Reveal>
            <Reveal as="ul" className="home-experience__points" {...REVEAL_MOTION.action}>
              <li>Publikujemy aktualne nieruchomości i realizacje</li>
              <li>Pokazujemy współpracę od środka</li>
              <li>Dzielimy się efektami naszej pracy</li>
            </Reveal>
            <Reveal className="home-experience__action" triggerRef={presenceLeadRef} delay={REVEAL_MOTION.copy.delay + 320} duration={REVEAL_MOTION.action.duration}>
              <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Otwórz profil PropertyCorp na Instagramie w nowej karcie" onClick={() => trackEvent("click_instagram", { context: "experience_section" })}>Zobacz Instagram <Instagram aria-hidden="true" /><ArrowUpRight aria-hidden="true" /></a>
            </Reveal>
          </div>
        </article>
      </div>
    </section>
  );
}

export function MapTeaser({ offers, loading }) {
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const mapButtonRef = useRef(null);

  return (
    <section className="home-map-teaser" id="mapa-ofert">
      <div className="final-shell home-map-teaser__inner">
        <div className="home-map-teaser__primary">
          <Reveal as="p" {...REVEAL_MOTION.eyebrow}>Z perspektywy mapy</Reveal>
          <Reveal as="h2" {...REVEAL_MOTION.heading}>Adres to początek.<br />Okolica nadaje mu<br />znaczenie.</Reveal>
        </div>
        <div className="home-map-teaser__support">
          <Reveal className="home-map-teaser__description" {...REVEAL_MOTION.copy}><span className="pc-body-copy">Zobacz, gdzie kończy się sam adres, a zaczyna codzienny kontekst — dojazd, sąsiedztwo, zieleń i rytm okolicy.</span></Reveal>
          <Reveal delay={570} duration={REVEAL_MOTION.action.duration}><button ref={mapButtonRef} type="button" onClick={() => { trackEvent("open_full_offers_map"); setIsMapModalOpen(true); }}>Pokaż pełną mapę <Maximize2 /></button></Reveal>
        </div>
        <Reveal className="home-map-teaser__map-reveal" {...REVEAL_MOTION.media}>
          <ConsentAwareOffersMap offers={offers} title="Mapa aktualnych ofert PropertyCorp" className="home-map-teaser__map" />
          <ApproximateLocationNotice variant="mini" />
          {!loading && !offers.length && <p className="home-map-teaser__empty">Brak aktualnych ofert do pokazania na mapie.</p>}
        </Reveal>
      </div>
      {isMapModalOpen && <OffersMapModal offers={offers} triggerRef={mapButtonRef} onClose={() => setIsMapModalOpen(false)} />}
    </section>
  );
}

function formatGoogleRating(value) {
  return new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function formatReviewDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function useGoogleReviews() {
  const [reviewsData, setReviewsData] = useState(null);
  const [reviewsStatus, setReviewsStatus] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
      setReviewsStatus("error");
    }, 6000);
    const load = async () => {
      try {
        const response = await fetch("/api/google-reviews", { signal: controller.signal, headers: { Accept: "application/json" } });
        if (response.status === 204) {
          if (!controller.signal.aborted) setReviewsStatus("empty");
          return;
        }
        if (!response.ok) {
          if (!controller.signal.aborted) setReviewsStatus("error");
          return;
        }
        const payload = await response.json();
        const normalized = normalizeGoogleReviews(payload);
        if (controller.signal.aborted) return;
        setReviewsData(normalized);
        setReviewsStatus(normalized ? "success" : "empty");
      } catch {
        if (!controller.signal.aborted) setReviewsStatus("error");
      } finally {
        window.clearTimeout(timeoutId);
      }
    };
    load();
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return { data: reviewsData, status: reviewsStatus };
}

function GoogleRatingStars({ rating, className = "" }) {
  return <span className={`google-review-stars ${className}`.trim()} aria-label={`Ocena ${rating} na 5`}>
    {Array.from({ length: 5 }, (_, index) => <Star className={index < rating ? "is-filled" : ""} key={index} aria-hidden="true" />)}
  </span>;
}

function GoogleReviewCard({ review, onOpen, isDuplicate = false }) {
  const date = formatReviewDate(review.updatedAt || review.createdAt);
  return <button
    type="button"
    className="google-review-card"
    tabIndex={isDuplicate ? -1 : undefined}
    aria-label={`Otwórz pełną opinię: ${review.author}, ocena ${review.rating} na 5`}
    onClick={(event) => onOpen(review, event.currentTarget)}
  >
    <GoogleRatingStars rating={review.rating} />
    <p>{review.text}</p>
    <footer><strong>{review.author}</strong><span>Google{date ? ` · ${date}` : ""}</span></footer>
  </button>;
}

function GoogleReviewModal({ review, onClose, triggerRef }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const content = createGoogleReviewModalContent(review);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
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

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overflow = previousDocumentOverflow;
      window.removeEventListener("keydown", onKeyDown);
      (triggerRef.current || previousFocus)?.focus?.();
    };
  }, [onClose, triggerRef]);

  if (!content) return null;

  const date = formatReviewDate(content.updatedAt || content.createdAt);
  return createPortal(
    <div className="google-review-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="google-review-modal__panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="google-review-modal-title" tabIndex={-1}>
        <header className="google-review-modal__header">
          <div><p>Głos klienta</p><h2 id="google-review-modal-title">Opinia z Google</h2></div>
          <button ref={closeButtonRef} type="button" aria-label="Zamknij opinię" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="google-review-modal__content">
          <GoogleRatingStars rating={content.rating} className="google-review-modal__stars" />
          <p>{content.text}</p>
          <footer><strong>{content.author}</strong><span>Google{date ? ` · ${date}` : ""}</span></footer>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function useSmoothGoogleReviewsTicker(tickerRef, trackRef, isModalOpen, isReady) {
  const modalOpenRef = useRef(isModalOpen);
  const controlsRef = useRef(null);

  useEffect(() => {
    modalOpenRef.current = isModalOpen;
    controlsRef.current?.setModalOpen(isModalOpen);
  }, [isModalOpen]);

  useEffect(() => {
    const ticker = tickerRef.current;
    const track = trackRef.current;
    if (!ticker || !track || typeof window === "undefined" || typeof track.getAnimations !== "function") return undefined;

    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const state = {
      animation: null,
      frame: 0,
      focusFrame: 0,
      modalCloseFrame: 0,
      interactionModality: "pointer",
      isFocusInsideRail: false,
      isModalOpen: modalOpenRef.current,
      isPointerInside: false,
      lastPointerPosition: null,
      targetRate: 1,
      canControl: false,
    };

    const cancelRateTransition = () => {
      if (state.frame) window.cancelAnimationFrame(state.frame);
      state.frame = 0;
    };

    const easeOutCubic = (progress) => 1 - ((1 - progress) ** 3);
    const easeInOutCubic = (progress) => (progress < .5
      ? 4 * progress ** 3
      : 1 - ((-2 * progress + 2) ** 3) / 2);

    const setPlaybackRate = (targetRate, { immediate = false } = {}) => {
      const animation = state.animation;
      if (!animation) return;

      const currentRate = Number.isFinite(animation.playbackRate) ? animation.playbackRate : 1;
      if (state.targetRate === targetRate && state.frame && !immediate) return;

      cancelRateTransition();
      state.targetRate = targetRate;
      if (immediate || Math.abs(currentRate - targetRate) < .001) {
        animation.playbackRate = targetRate;
        return;
      }

      if (targetRate > 0 && animation.playState === "paused") animation.play();

      const duration = targetRate === 0 ? 320 : 420;
      const easing = targetRate === 0 ? easeOutCubic : easeInOutCubic;
      const startedAt = window.performance.now();
      const updateRate = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        animation.playbackRate = currentRate + ((targetRate - currentRate) * easing(progress));
        if (progress < 1) {
          state.frame = window.requestAnimationFrame(updateRate);
        } else {
          state.frame = 0;
          animation.playbackRate = targetRate;
        }
      };
      state.frame = window.requestAnimationFrame(updateRate);
    };

    const reconcilePlayback = ({ modalChange = false } = {}) => {
      if (!state.canControl || !state.animation) return;
      const targetRate = getGoogleReviewTickerTarget(state);
      setPlaybackRate(targetRate, { immediate: modalChange && targetRate === 0 });
    };

    const updateMotionCapability = () => {
      state.canControl = hoverQuery.matches && !reducedMotionQuery.matches;
      if (!state.canControl) {
        cancelRateTransition();
        if (state.animation) state.animation.playbackRate = 1;
        return;
      }
      reconcilePlayback();
    };

    const initializeAnimation = () => {
      state.animation = track.getAnimations().find((animation) => animation.animationName === "home-reviews-marquee") || null;
      if (state.animation) ticker.dataset.smoothTickerMotion = "ready";
      updateMotionCapability();
    };

    const onPointerEnter = (event) => {
      if (!state.canControl) return;
      state.interactionModality = "pointer";
      state.lastPointerPosition = { x: event.clientX, y: event.clientY };
      state.isPointerInside = true;
      reconcilePlayback();
    };
    const onPointerLeave = () => {
      if (!state.canControl) return;
      state.isPointerInside = false;
      reconcilePlayback();
    };
    const onPointerDown = (event) => {
      state.interactionModality = "pointer";
      state.lastPointerPosition = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event) => {
      state.lastPointerPosition = { x: event.clientX, y: event.clientY };
    };
    const onKeyDown = (event) => {
      if (["Tab", "Enter", " ", "Spacebar", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        state.interactionModality = "keyboard";
      }
    };
    const onFocusIn = () => {
      state.isFocusInsideRail = true;
      reconcilePlayback();
    };
    const onFocusOut = () => {
      if (state.focusFrame) window.cancelAnimationFrame(state.focusFrame);
      state.focusFrame = window.requestAnimationFrame(() => {
        state.focusFrame = 0;
        state.isFocusInsideRail = ticker.contains(document.activeElement);
        reconcilePlayback();
      });
    };

    controlsRef.current = {
      setModalOpen(nextModalOpen) {
        state.isModalOpen = nextModalOpen;
        if (state.modalCloseFrame) {
          window.cancelAnimationFrame(state.modalCloseFrame);
          state.modalCloseFrame = 0;
        }
        if (!nextModalOpen) {
          // The opening card's coordinates can remain cached while the modal
          // owns pointer input. They must not keep the ticker paused after it
          // closes and returns focus to that card.
          Object.assign(state, resetGoogleReviewTickerAfterModalClose(state));
          if (state.interactionModality === "keyboard") {
            state.modalCloseFrame = window.requestAnimationFrame(() => {
              state.modalCloseFrame = 0;
              state.isFocusInsideRail = ticker.contains(document.activeElement);
              reconcilePlayback();
            });
            return;
          }
        }
        reconcilePlayback({ modalChange: nextModalOpen });
      },
    };

    const initializeFrame = window.requestAnimationFrame(initializeAnimation);
    ticker.addEventListener("pointerenter", onPointerEnter);
    ticker.addEventListener("pointerleave", onPointerLeave);
    ticker.addEventListener("focusin", onFocusIn);
    ticker.addEventListener("focusout", onFocusOut);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("keydown", onKeyDown, true);
    hoverQuery.addEventListener("change", updateMotionCapability);
    reducedMotionQuery.addEventListener("change", updateMotionCapability);

    return () => {
      window.cancelAnimationFrame(initializeFrame);
      cancelRateTransition();
      if (state.focusFrame) window.cancelAnimationFrame(state.focusFrame);
      if (state.modalCloseFrame) window.cancelAnimationFrame(state.modalCloseFrame);
      if (state.animation) {
        state.animation.playbackRate = 1;
        state.animation = null;
      }
      ticker.removeEventListener("pointerenter", onPointerEnter);
      ticker.removeEventListener("pointerleave", onPointerLeave);
      ticker.removeEventListener("focusin", onFocusIn);
      ticker.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("keydown", onKeyDown, true);
      hoverQuery.removeEventListener("change", updateMotionCapability);
      reducedMotionQuery.removeEventListener("change", updateMotionCapability);
      delete ticker.dataset.smoothTickerMotion;
      controlsRef.current = null;
    };
  }, [tickerRef, trackRef, isReady]);
}

export function GoogleReviews() {
  const { data: reviewsData, status: reviewsStatus } = useGoogleReviews();
  const [selectedReview, setSelectedReview] = useState(null);
  const reviewTriggerRef = useRef(null);
  const tickerRef = useRef(null);
  const tickerTrackRef = useRef(null);
  const openReview = useCallback((review, trigger) => {
    reviewTriggerRef.current = trigger;
    setSelectedReview(review);
  }, []);
  const closeReviewModal = useCallback(() => setSelectedReview(null), []);
  useSmoothGoogleReviewsTicker(tickerRef, tickerTrackRef, Boolean(selectedReview), Boolean(reviewsData));

  if (!reviewsData) {
    const isLoading = reviewsStatus === "loading";
    const message = isLoading
      ? "Łączymy tę sekcję z opiniami Google."
      : "Opinie klientów pojawią się tutaj po aktywacji zweryfikowanego połączenia z Google. Nie publikujemy fikcyjnych recenzji.";

    return (
      <section className="home-reviews home-reviews--pending" id="opinie" aria-busy={isLoading}>
        <div className="final-shell home-reviews__inner">
          <div className="home-reviews__grid">
            <div className="home-reviews__heading">
              <Reveal as="p" className="home-reviews__eyebrow" {...REVEAL_MOTION.eyebrow}>Opinie</Reveal>
              <Reveal as="h2" {...REVEAL_MOTION.heading}>Miejsce na głos<br />naszych klientów.</Reveal>
            </div>
            <Reveal className="home-reviews__note home-reviews__note--pending" {...REVEAL_MOTION.copy}>
              <ShieldCheck aria-hidden="true" />
              <p className="pc-body-copy">{message}</p>
            </Reveal>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="home-reviews" id="opinie">
      <div className="final-shell home-reviews__inner">
        <div className="home-reviews__grid">
          <div className="home-reviews__heading">
            <Reveal as="p" className="home-reviews__eyebrow" {...REVEAL_MOTION.eyebrow}>Opinie</Reveal>
            <Reveal as="h2" {...REVEAL_MOTION.heading}>Miejsce na głos<br />naszych klientów.</Reveal>
          </div>
          <Reveal className="home-reviews__note" {...REVEAL_MOTION.copy}>
            <div><strong>{formatGoogleRating(reviewsData.averageRating)}</strong><Star aria-hidden="true" /></div>
            <span className="pc-body-copy">na podstawie {reviewsData.totalReviewCount} opinii Google</span>
            {reviewsData.reviewsUrl && <a className="home-reviews__google-link" href={reviewsData.reviewsUrl} target="_blank" rel="noopener noreferrer" aria-label="Zobacz wszystkie opinie w Google (otwiera się w nowej karcie)">Zobacz wszystkie opinie w Google <ArrowUpRight aria-hidden="true" /></a>}
          </Reveal>
        </div>
      </div>
      <Reveal className="home-reviews__ticker-reveal" {...REVEAL_MOTION.media}>
        <div className={`home-reviews__ticker${selectedReview ? " is-modal-open" : ""}`} ref={tickerRef} tabIndex={0} aria-label="Najnowsze opinie Google">
          <div className="home-reviews__ticker-track" ref={tickerTrackRef}>
            <div className="home-reviews__ticker-group">{reviewsData.reviews.map((review) => <GoogleReviewCard key={review.id} review={review} onOpen={openReview} />)}</div>
            <div className="home-reviews__ticker-group" aria-hidden="true">{reviewsData.reviews.map((review) => <GoogleReviewCard key={`${review.id}-duplicate`} review={review} onOpen={openReview} isDuplicate />)}</div>
          </div>
        </div>
      </Reveal>
      {selectedReview && <GoogleReviewModal review={selectedReview} onClose={closeReviewModal} triggerRef={reviewTriggerRef} />}
    </section>
  );
}

const faqItems = [
  ["Od czego zaczyna się współpraca z PropertyCorp?", "Od rozmowy o Twojej sytuacji, celu i terminie. Dzięki temu możemy dobrać właściwy sposób działania do nieruchomości i Twoich oczekiwań."],
  ["Jak przygotowujecie nieruchomość do sprzedaży?", "Najpierw poznajemy nieruchomość i analizujemy jej sytuację rynkową. Następnie ustalamy sposób prezentacji, przygotowujemy ofertę i materiały potrzebne do rozpoczęcia sprzedaży."],
  ["Jak przebiega sprzedaż nieruchomości?", "Ustalamy strategię, przygotowujemy ofertę, organizujemy prezentacje i prowadzimy rozmowy z zainteresowanymi. Pomagamy również przy negocjacjach, dokumentach i finalizacji transakcji."],
  ["Czy pomagacie również osobom szukającym nieruchomości?", "Tak. Zaczynamy od poznania lokalizacji, budżetu i oczekiwań, a następnie selekcjonujemy propozycje i organizujemy prezentacje. Wspieramy także przy negocjacjach i formalnościach związanych z zakupem lub najmem."],
  ["Jakie dokumenty będą potrzebne?", "Zakres dokumentów zależy od rodzaju nieruchomości i transakcji. Na początku współpracy wskazujemy, co będzie potrzebne, i pomagamy uporządkować dokumentację przed finalizacją."],
  ["Czy zajmujecie się również wynajmem?", "Tak. Pomagamy zarówno właścicielom chcącym wynająć nieruchomość, jak i osobom poszukującym miejsca do najmu — od przygotowania lub wyboru oferty aż po ustalenie warunków i podpisanie umowy."],
];

export function Faq() {
  const [open, setOpen] = useState(null);
  const stageRef = useRef(null);
  const itemsRef = useRef(null);
  const extraRunwayRef = useRef(0);

  useEffect(() => {
    const items = itemsRef.current;
    const stage = stageRef.current;
    if (!items || !stage) return undefined;

    let frame = 0;
    let disposed = false;

    const getClosedHeight = () => {
      const itemBorderHeight = [...items.querySelectorAll(".home-faq__item")]
        .reduce((total, item) => {
          const button = item.querySelector(".home-faq__item-button");
          const borderBottom = Number.parseFloat(window.getComputedStyle(item).borderBottomWidth) || 0;
          return total + (button?.getBoundingClientRect().height || 0) + borderBottom;
        }, 0);
      const topBorder = Number.parseFloat(window.getComputedStyle(items).borderTopWidth) || 0;

      return itemBorderHeight + topBorder;
    };

    const measure = () => {
      frame = 0;
      if (disposed) return;
      const extraRunway = calculateFaqExtraRunway(getClosedHeight(), items.getBoundingClientRect().height);
      if (Math.abs(extraRunway - extraRunwayRef.current) < 0.1) return;

      extraRunwayRef.current = extraRunway;
      stage.style.setProperty("--faq-extra-runway", `${extraRunway}px`);
    };

    const scheduleMeasure = () => {
      if (!disposed && !frame) frame = window.requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(items);
    scheduleMeasure();
    if (document.fonts?.ready) document.fonts.ready.then(scheduleMeasure).catch(() => {});

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="home-faq-stage" ref={stageRef}>
      <section className="home-faq" id="faq"><div className="final-shell home-faq__grid"><div className="home-faq__intro"><Reveal as="p" {...REVEAL_MOTION.eyebrow}>FAQ</Reveal><Reveal as="h2" {...REVEAL_MOTION.heading}>Ważne pytania<br />przed decyzją.</Reveal></div><Reveal className="home-faq__accordion" {...REVEAL_MOTION.copy}><div className="home-faq__items" ref={itemsRef}>{faqItems.map(([question, answer], index) => { const isOpen = open === index; const panelId = `faq-panel-${index}`; const buttonId = `faq-button-${index}`; return <article className={`home-faq__item${isOpen ? " is-open" : ""}`} key={question}><h3><button className="home-faq__item-button" id={buttonId} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : index)}><span>{question}</span><ChevronDown aria-hidden="true" /></button></h3><div className="home-faq__answer" id={panelId} role="region" aria-labelledby={buttonId} aria-hidden={!isOpen}><div><p>{answer}</p></div></div></article>; })}</div></Reveal></div></section>
    </div>
  );
}

export function ContactSection() {
  return (
    <section className="home-contact" id="kontakt"><div className="final-shell home-contact__grid"><div className="home-contact__copy"><Reveal as="p" {...REVEAL_MOTION.eyebrow}>Porozmawiajmy</Reveal><Reveal as="h2" {...REVEAL_MOTION.heading}>Co jest dziś<br />Twoim następnym<br /><em>krokiem?</em></Reveal><Reveal className="home-contact__summary" {...REVEAL_MOTION.copy}><span className="pc-body-copy">Pierwsza rozmowa pomaga poukładać właściwy kierunek — bez zobowiązań.</span></Reveal><Reveal className="home-contact__details" {...REVEAL_MOTION.action}><span>Kontakt niedostępny w demonstracji</span><span>Dane kontaktowe są fikcyjne</span></Reveal></div><Reveal className="home-contact__form-reveal" delay={410} duration={REVEAL_MOTION.media.duration}><ContactForm /></Reveal></div></section>
  );
}
