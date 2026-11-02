import React, { useEffect, useRef } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { Reveal, REVEAL_MOTION } from "./Reveal.jsx";
import { calculateChapterReadingLift, calculateStoryTimelineUnit } from "./collaborationStoryGeometry.js";

const steps = [
  {
    eyebrow: "01 / ROZMOWA",
    title: "Najpierw rozmowa.",
    text: "Zaczynamy od Twojej sytuacji, potrzeb i oczekiwań. Jeśli masz nieruchomość, poznajemy ją i jej kontekst. Jeśli szukasz, ustalamy czego naprawdę potrzebujesz.",
    descriptor: "CEL · POTRZEBY · KONTEKST",
    image: "/media/demo/scene.svg",
    alt: "Tło etapu rozmowy",
    position: "center",
    mobileObjectPosition: "25% 72%",
  },
  {
    eyebrow: "02 / STRATEGIA",
    title: "Ustalamy właściwy kierunek.",
    text: "Analizujemy sytuację, rynek i możliwości. Wspólnie określamy priorytety, tempo działania i to, co w danym momencie ma największe znaczenie.",
    descriptor: "ANALIZA · STRATEGIA · SELEKCJA",
    image: "/media/demo/scene.svg",
    alt: "Tło etapu strategii",
    position: "center",
    mobileObjectPosition: "20% 56%",
  },
  {
    eyebrow: "03 / DZIAŁANIE",
    title: "Przechodzimy do działania.",
    text: "Przygotowujemy ofertę lub selekcjonujemy nieruchomości. Organizujemy prezentacje, prowadzimy rozmowy i negocjacje. Dbamy, by każdy kolejny krok był dobrze uzasadniony.",
    descriptor: "OFERTA · PREZENTACJE · NEGOCJACJE",
    image: "/media/demo/scene.svg",
    alt: "Tło etapu działania",
    position: "center 58%",
    mobileObjectPosition: "42% 58%",
  },
  {
    eyebrow: "04 / FINALIZACJA",
    title: "Domykamy szczegóły.",
    text: "Koordynujemy formalności, dokumenty i ustalenia między stronami. Jesteśmy obecni do podpisania umowy i przekazania kluczy.",
    descriptor: "FORMALNOŚCI · UMOWA · KLUCZE",
    image: "/media/demo/scene.svg",
    alt: "Tło etapu przekazania kluczy",
    mobileObjectPosition: "58% 52%",
  },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
// Each panel gets a distinct reading beat before the following panel starts
// to cover it. Keeping these timings separate prevents the stack from feeling
// like a single rushed transition.
const PANEL_ENTRY_DURATION = 0.44;
const INTRO_END = PANEL_ENTRY_DURATION;
const INTRO_HOLD = 0.24;
const ENTRY_OFFSET = 1;
const CARD_ENTRY_DURATION = PANEL_ENTRY_DURATION;
const CARD_HOLD = 0.24;
const FINAL_CARD_HOLD = 0.46;
const END_SHEET_DURATION = PANEL_ENTRY_DURATION;
const END_SHEET_HOLD = 0.26;
const FINAL_CARD_START = INTRO_HOLD + INTRO_END + CARD_HOLD + (steps.length - 2) * (CARD_ENTRY_DURATION + CARD_HOLD);
const END_SHEET_START = FINAL_CARD_START + CARD_ENTRY_DURATION + FINAL_CARD_HOLD;
const CARD_CONTENT_SHOW_THRESHOLD = 0.58;
const CARD_CONTENT_RESET_THRESHOLD = 0.25;
const VIEW_TRANSITION_DURATION = 0.42;
const VIEW_B_HOLD = 0.34;
// On compact screens the final chapter also contains the team image below the
// headline, so it needs a longer reading beat before the light story arrives.
const MOBILE_VIEW_B_HOLD = 0.38;
const MOBILE_CHAPTER_READING_LIFT = 0.26;
const END_SHEET_END = END_SHEET_START + END_SHEET_DURATION;
const CHAPTER_TRANSITION_START = END_SHEET_END + END_SHEET_HOLD;
const CHAPTER_TRANSITION_END = CHAPTER_TRANSITION_START + VIEW_TRANSITION_DURATION;
const STORY_END = CHAPTER_TRANSITION_END + VIEW_B_HOLD;

function getCardStart(index) {
  if (index === 0) return INTRO_HOLD;
  return INTRO_HOLD + INTRO_END + CARD_HOLD + (index - 1) * (CARD_ENTRY_DURATION + CARD_HOLD);
}

function StoryCard({ step, index, setCardRef }) {
  return (
    <article
      className={`collaboration-story__card${index === steps.length - 1 ? " collaboration-story__card--final" : ""}`}
      ref={(element) => setCardRef(element, index)}
      style={{ transform: `translate3d(0, ${(index + ENTRY_OFFSET) * 100}%, 0)`, zIndex: index + 7 }}
    >
      {step.image ? (
        <img
          className="collaboration-story__image"
          src={step.image}
          alt={step.alt}
          style={{
            "--desktop-object-position": step.position || "center",
            "--mobile-object-position": step.mobileObjectPosition || step.position || "center",
          }}
        />
      ) : (
        <div className="collaboration-story__key-visual" aria-hidden="true">
          <div><KeyRound /><span>Przekazanie kluczy</span></div>
          <i />
        </div>
      )}
      <div className="collaboration-story__shade" aria-hidden="true" />
      <div className="collaboration-story__card-copy">
        <p className="collaboration-story__card-reveal" data-card-reveal>{step.eyebrow}</p>
        <h3 className="collaboration-story__card-reveal" data-card-reveal>{step.title}</h3>
        <span className="collaboration-story__card-reveal pc-body-copy" data-card-reveal>{step.text}</span>
        <small className="collaboration-story__card-reveal" data-card-reveal>{step.descriptor}</small>
      </div>
    </article>
  );
}

function EndSheet({ sheetRef, contentMotionRef }) {
  return (
    <section className="collaboration-story__end-sheet" ref={sheetRef} style={{ transform: "translate3d(0, 100%, 0)" }}>
      <img className="collaboration-story__end-image" src="/media/demo/scene.svg" alt="" aria-hidden="true" />
      <div className="collaboration-story__end-content-motion" ref={contentMotionRef}>
        <div className="collaboration-story__end-content final-shell">
          <Reveal {...REVEAL_MOTION.eyebrow} offset={20}><p>PropertyCorp</p></Reveal>
          <Reveal {...REVEAL_MOTION.heading} offset={20}><h2>Dobry finał zaczyna się <span>od właściwych decyzji.</span></h2></Reveal>
          <Reveal {...REVEAL_MOTION.copy} offset={20}><span className="pc-body-copy">Pomagamy przejść przez cały proces spokojnie, świadomie i bez pomijania tego, co naprawdę ważne.</span></Reveal>
          <Reveal {...REVEAL_MOTION.action} offset={20} className="collaboration-story__end-actions">
            <p>Z czym możemy Ci pomóc?</p>
            <div>
              <a href="#kontakt">Mam nieruchomość <ArrowRight aria-hidden="true" /></a>
              <a href="/oferty">Szukam nieruchomości <ArrowRight aria-hidden="true" /></a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PropertyCorpChapter({ chapterRef, contentRef }) {
  return (
    <section className="collaboration-story__chapter" ref={chapterRef} aria-label="PropertyCorp">
      <div className="collaboration-story__chapter-grid final-shell" ref={contentRef}>
        <div className="collaboration-story__chapter-lead">
          <Reveal as="p" {...REVEAL_MOTION.eyebrow} offset={48}>PropertyCorp</Reveal>
          <Reveal as="h2" {...REVEAL_MOTION.heading} offset={50}>Każda nieruchomość to inna historia.</Reveal>
          <Reveal as="h2" delay={410} duration={REVEAL_MOTION.heading.duration} offset={50}><em>Każdą prowadzimy osobiście.</em></Reveal>
        </div>
        <div className="collaboration-story__chapter-copy">
          <Reveal as="div" className="collaboration-story__chapter-media" delay={160} duration={REVEAL_MOTION.media.duration} offset={56}>
            <div className="collaboration-story__chapter-media-recess">
              <img src="/media/demo/scene.svg" alt="Zespół PropertyCorp podczas rozmowy z klientami" loading="lazy" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function CollaborationScrollStory() {
  const trackRef = useRef(null);
  const sceneRef = useRef(null);
  const introRef = useRef(null);
  const sheetRef = useRef(null);
  const endContentMotionRef = useRef(null);
  const chapterRef = useRef(null);
  const chapterContentRef = useRef(null);
  const cardRefs = useRef([]);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const getStoryEnd = () => (
      window.matchMedia?.("(max-width: 700px)").matches
        ? CHAPTER_TRANSITION_END + MOBILE_VIEW_B_HOLD
        : STORY_END
    );

    const getPanelHeight = () => Math.max(sceneRef.current?.clientHeight || 0, 1);

    const getTargetProgress = () => {
      if (!trackRef.current) return 0;
      const track = trackRef.current;
      const trackRect = track.getBoundingClientRect();
      const storyEnd = getStoryEnd();
      const timelineScrollRange = calculateStoryTimelineUnit(track.offsetHeight, getPanelHeight(), storyEnd);
      return timelineScrollRange > 0 ? clamp(-trackRect.top / timelineScrollRange, 0, storyEnd) : 0;
    };

    const renderProgress = (progress) => {
      const panelHeight = getPanelHeight();
      const introProgress = clamp((progress - INTRO_HOLD) / INTRO_END, 0, 1);
      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const cardStart = getCardStart(index);
        const incomingProgress = index === 0
          ? introProgress
          : clamp((progress - cardStart) / CARD_ENTRY_DURATION, 0, 1);
        const startOffset = 1;
        const translateY = (1 - incomingProgress) * startOffset * card.offsetHeight;

        card.style.transform = `translate3d(0, ${translateY}px, 0)`;
        card.style.zIndex = String(index + 7);
        card.style.opacity = "1";
        card.style.filter = "none";

        const isContentVisible = card.classList.contains("is-content-visible");
        const shouldShowContent = isContentVisible
          ? incomingProgress > CARD_CONTENT_RESET_THRESHOLD
          : incomingProgress >= CARD_CONTENT_SHOW_THRESHOLD;
        if (shouldShowContent !== isContentVisible) card.classList.toggle("is-content-visible", shouldShowContent);

      });

      const sheetProgress = clamp((progress - END_SHEET_START) / END_SHEET_DURATION, 0, 1);
      const copyProgress = clamp((sheetProgress - 0.62) / 0.32, 0, 1);
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translate3d(0, ${100 - sheetProgress * 100}%, 0)`;
        sheetRef.current.style.setProperty("--end-sheet-copy", `${copyProgress}`);
        sheetRef.current.style.setProperty("--end-sheet-copy-offset", `${(1 - copyProgress) * 28}px`);
      }

      const chapterProgress = clamp((progress - CHAPTER_TRANSITION_START) / VIEW_TRANSITION_DURATION, 0, 1);
      if (endContentMotionRef.current) {
        endContentMotionRef.current.style.transform = `translate3d(0, ${-chapterProgress * panelHeight * 1.2}px, 0)`;
      }
      if (chapterRef.current) {
        const compactViewport = window.matchMedia?.("(max-width: 700px)").matches;
        const chapterHoldProgress = clamp(
          (progress - CHAPTER_TRANSITION_END) / (getStoryEnd() - CHAPTER_TRANSITION_END),
          0,
          1,
        );
        const chapterContentHeight = chapterContentRef.current?.scrollHeight || 0;
        const maxReadingLift = calculateChapterReadingLift({
          panelHeight,
          contentHeight: chapterContentHeight,
          baseLift: compactViewport ? panelHeight * MOBILE_CHAPTER_READING_LIFT : 0,
        });
        const entryOffset = (1 - chapterProgress) * panelHeight;
        const readingLift = chapterHoldProgress * maxReadingLift;
        chapterRef.current.style.transform = `translate3d(0, ${entryOffset - readingLift}px, 0)`;
      }
    };

    const update = () => {
      frame = 0;
      if (motionQuery.matches || !trackRef.current) return;

      renderProgress(getTargetProgress());
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const resetForReducedMotion = () => {
      if (!motionQuery.matches) return requestUpdate();
      cardRefs.current.forEach((card) => {
        if (!card) return;
        card.removeAttribute("style");
        card.classList.remove("is-content-visible");
      });
      introRef.current?.removeAttribute("style");
      sheetRef.current?.removeAttribute("style");
      endContentMotionRef.current?.removeAttribute("style");
      chapterRef.current?.removeAttribute("style");
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.visualViewport?.addEventListener("resize", requestUpdate);
    window.visualViewport?.addEventListener("scroll", requestUpdate);
    motionQuery.addEventListener("change", resetForReducedMotion);

    const contentObserver = typeof ResizeObserver === "undefined" || !chapterContentRef.current
      ? null
      : new ResizeObserver(requestUpdate);
    contentObserver?.observe(chapterContentRef.current);

    const fontSet = document.fonts;
    fontSet?.ready?.then(requestUpdate);
    fontSet?.addEventListener?.("loadingdone", requestUpdate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.visualViewport?.removeEventListener("resize", requestUpdate);
      window.visualViewport?.removeEventListener("scroll", requestUpdate);
      motionQuery.removeEventListener("change", resetForReducedMotion);
      contentObserver?.disconnect();
      fontSet?.removeEventListener?.("loadingdone", requestUpdate);
    };
  }, []);

  const setCardRef = (element, index) => {
    cardRefs.current[index] = element;
  };

  return (
    <section className="collaboration-story" id="jak-pracujemy">
      <div className="collaboration-story__track" ref={trackRef}>
        <div className="collaboration-story__scene" ref={sceneRef}>
          <div className="collaboration-story__intro" ref={introRef}>
            <img
              className="collaboration-story__intro-image"
              src="/media/demo/scene.svg"
              alt=""
            />
            <div className="collaboration-story__intro-shade" aria-hidden="true" />
            <div className="collaboration-story__intro-content final-shell">
              <Reveal {...REVEAL_MOTION.eyebrow}><p>Współpraca</p></Reveal>
              <Reveal {...REVEAL_MOTION.heading}><h2>Od pierwszej rozmowy do przekazania kluczy.</h2></Reveal>
              <Reveal {...REVEAL_MOTION.copy}><span className="pc-body-copy">Każda nieruchomość zaczyna się od innej historii. Najpierw poznajemy Twój cel, później układamy właściwy sposób działania.</span></Reveal>
            </div>
          </div>
          <div className="collaboration-story__cards-layer">
            {steps.map((step, index) => <StoryCard key={step.eyebrow} step={step} index={index} setCardRef={setCardRef} />)}
          </div>
          <EndSheet sheetRef={sheetRef} contentMotionRef={endContentMotionRef} />
          <PropertyCorpChapter chapterRef={chapterRef} contentRef={chapterContentRef} />
        </div>
      </div>
    </section>
  );
}
