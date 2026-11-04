import React, { useEffect, useMemo, useState } from "react";
import { ArrowUp } from "lucide-react";
import { homepageConfig } from "../config/homepage.js";
import { selectLatestFeaturedOffers } from "../domain/offers/featuredOffers.js";
import { reportMissingSiteAssets } from "../config/siteAssets.js";
import { getAllOffers } from "../services/offers/index.js";
import { SiteFooter } from "../components/layout/SiteFooter.jsx";
import { SiteHeader } from "../components/layout/SiteHeader.jsx";
import {
  AboutTeam,
  ContactSection,
  CooperationSection,
  ExperienceSection,
  Faq,
  FeaturedOffers,
  HomeHero,
  MapTeaser,
  GoogleReviews,
} from "../components/home/HomeSections.jsx";
import { OffersPage } from "./OffersPage.jsx";
import { OfferDetailPage } from "./OfferDetailPage.jsx";
import { AnalyticsRouteTracker } from "../analytics/AnalyticsRouteTracker.jsx";
import { ConsentManager } from "../components/consent/ConsentManager.jsx";
import { LegalPage } from "./LegalPage.jsx";

export function pickFeaturedOffers(offers) {
  return selectLatestFeaturedOffers(offers, homepageConfig.featuredOfferLimit);
}

function useHashAnchorNavigation() {
  useEffect(() => {
    let frame = null;
    let nestedFrame = null;

    const scrollToHashTarget = () => {
      let id;
      try {
        id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      } catch (error) {
        if (error instanceof URIError) return;
        throw error;
      }
      if (!id) return;

      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nestedFrame);
      frame = window.requestAnimationFrame(() => {
        nestedFrame = window.requestAnimationFrame(() => {
          const target = document.getElementById(id);
          if (!target) return;
          const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        });
      });
    };

    scrollToHashTarget();
    window.addEventListener("hashchange", scrollToHashTarget);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nestedFrame);
      window.removeEventListener("hashchange", scrollToHashTarget);
    };
  }, []);
}

export function HomePage() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offersError, setOffersError] = useState(false);

  useEffect(() => {
    reportMissingSiteAssets();
    let mounted = true;
    getAllOffers({ sort: "newest" }).then((data) => {
      if (mounted) setOffers(data);
    }).catch(() => {
      if (mounted) setOffersError(true);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const featuredOffers = useMemo(() => pickFeaturedOffers(offers), [offers]);
  return (
    <div className="final-home">
      <SiteHeader />
      <HomeHero />
      {offersError && <p className="runtime-offers-error final-shell" role="alert">Nie możemy teraz pobrać aktualnych ofert. Odśwież stronę i spróbuj ponownie.</p>}
      <FeaturedOffers offers={featuredOffers} loading={loading} />
      <MapTeaser offers={offers} loading={loading} />
      <CooperationSection />
      <div className="home-light-story">
        <AboutTeam />
        <ExperienceSection />
        <GoogleReviews />
        <div className="home-faq-stage"><Faq /></div>
      </div>
      <ContactSection />
      <SiteFooter />
    </div>
  );
}

function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const updateVisibility = () => {
      frame = 0;
      const threshold = Math.max(640, Math.min(900, Math.round(window.innerHeight * .85)));
      const nextVisible = window.scrollY > threshold;
      setIsVisible((current) => (current === nextVisible ? current : nextVisible));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      className={`scroll-to-top${isVisible ? " is-visible" : ""}`}
      aria-label="Wróć na górę strony"
      tabIndex={isVisible ? 0 : -1}
      onClick={scrollToTop}
    >
      <ArrowUp aria-hidden="true" />
    </button>
  );
}

export default function FinalSite() {
  useHashAnchorNavigation();
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const content = path === "/oferty" || path === "/oferty-nieruchomosci"
    ? <OffersPage />
    : path === "/polityka-cookies"
      ? <LegalPage type="cookies" />
      : path === "/polityka-prywatnosci"
        ? <LegalPage type="privacy" />
    : path.startsWith("/oferty/")
      ? <OfferDetailPage segment={path.split("/").at(-1)} />
      : <HomePage />;

  return <><AnalyticsRouteTracker />{content}<ScrollToTopButton /><ConsentManager /></>;
}
