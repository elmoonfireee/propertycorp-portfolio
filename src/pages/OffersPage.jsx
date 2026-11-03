import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import "../styles/offers.css";
import { OffersCardSkeleton, OffersListingCard } from "../components/offers/OffersListingCard.jsx";
import { OfferListingReveal } from "../components/offers/OfferListingReveal.jsx";
import { OfferCardVariant2 } from "../components/offers/OfferCardVariant2.jsx";
import { OfferCardVariant3 } from "../components/offers/OfferCardVariant3.jsx";
import { ActiveFilterChips, MobileFiltersSheet, OffersFilters, OffersSortDropdown, OffersStickyFilterBar } from "../components/offers/OffersFilters.jsx";
import { Reveal, REVEAL_MOTION } from "../components/home/Reveal.jsx";
import { SiteFooter } from "../components/layout/SiteFooter.jsx";
import { SiteHeader } from "../components/layout/SiteHeader.jsx";
import { DEFAULT_OFFER_FILTERS, findChangedOfferFilter, getListingOffers, parseOfferFilters, serializeOfferFilters } from "../domain/offers/offerFilters.js";
import { getActiveFilterChips, getListingFacets, pluralizeOffers } from "../domain/offers/offerListing.js";
import { buildOfferPathWithSearch, OFFER_LIST_PATH } from "../domain/offers/offerRoutes.js";
import { getAllOffers } from "../services/offers/index.js";
import { trackEvent } from "../analytics/googleAnalytics.js";
import { getRequestedVariant, resolveEditionVariant, siteEditionConfig } from "../config/siteEdition.js";

const OFFERS_PER_PAGE = 12;

function getSearch() {
  return window.location.search;
}

function getOffersVariant(search) {
  const requested = getRequestedVariant(search, "offersVariant", [1, 2, 3]);
  return resolveEditionVariant(siteEditionConfig, requested, "listingVariant");
}

function getListingHref(filters, { offersVariant = 1, preserveVariantParam = false } = {}) {
  const query = serializeOfferFilters(filters).toString();
  const params = new URLSearchParams(query);
  if (offersVariant > 1 || preserveVariantParam) params.set("offersVariant", String(offersVariant));
  const serialized = params.toString();
  return serialized ? `${OFFER_LIST_PATH}?${serialized}` : OFFER_LIST_PATH;
}

function useOffersSeo(search) {
  useEffect(() => {
    const originalTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const originalDescription = description?.getAttribute("content") || "";
    const canonical = document.querySelector('link[rel="canonical"]') || document.head.appendChild(document.createElement("link"));
    const originalCanonical = canonical.getAttribute("href");
    canonical.setAttribute("rel", "canonical");

    let robots = document.querySelector('meta[name="robots"]');
    const createdRobots = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    const originalRobots = robots.getAttribute("content");

    document.title = "Oferty nieruchomości | PropertyCorp";
    description?.setAttribute("content", "Aktualne oferty nieruchomości PropertyCorp we Wrocławiu i okolicach. Sprzedaż i wynajem mieszkań, domów oraz lokali.");
    canonical.setAttribute("href", `${window.location.origin}${OFFER_LIST_PATH}`);
    robots.setAttribute("content", siteEditionConfig.noIndex ? "noindex,nofollow" : search ? "noindex,follow" : "index,follow");

    return () => {
      document.title = originalTitle;
      if (description) description.setAttribute("content", originalDescription);
      if (originalCanonical == null) canonical.remove();
      else canonical.setAttribute("href", originalCanonical);
      if (createdRobots) robots.remove();
      else if (originalRobots == null) robots.removeAttribute("content");
      else robots.setAttribute("content", originalRobots);
    };
  }, [search]);
}

function OffersHero() {
  return (
    <section className="offers-hero" id="main-content">
      <div className="offers-hero__glow" aria-hidden="true" />
      <div className="final-shell offers-hero__content">
        <Reveal as="p" {...REVEAL_MOTION.eyebrow}>Oferty</Reveal>
        <Reveal as="h1" {...REVEAL_MOTION.heading}>Znajdź miejsce,<br />którego szukasz.</Reveal>
        <Reveal className="offers-hero__lead" {...REVEAL_MOTION.copy}>Wybrane nieruchomości we Wrocławiu i okolicach. Zawęź wyniki i znajdź adres dopasowany do swoich potrzeb.</Reveal>
        <p>Oferty są fikcyjne, a zdjęcia mają charakter poglądowy.</p>
      </div>
    </section>
  );
}

function OffersVariantSwitcher({ activeVariant, onChange }) {
  return (
    <aside className="offers-variant-lab" aria-label="Wybór wariantu kart ofert">
      <span>Wybierz wariant kart</span>
      <div>
        <button type="button" className={activeVariant === 1 ? "is-active" : ""} aria-pressed={activeVariant === 1} onClick={() => onChange(1)}>01 — Listing</button>
        <button type="button" className={activeVariant === 2 ? "is-active" : ""} aria-pressed={activeVariant === 2} onClick={() => onChange(2)}>02 — Foto + panel</button>
        <button type="button" className={activeVariant === 3 ? "is-active" : ""} aria-pressed={activeVariant === 3} onClick={() => onChange(3)}>03 — Plakat</button>
      </div>
    </aside>
  );
}

export function OffersPage() {
  const [search, setSearch] = useState(getSearch);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offersError, setOffersError] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(OFFERS_PER_PAGE);
  const filtersPanelRef = useRef(null);

  useOffersSeo(search);

  useEffect(() => {
    let mounted = true;
    getAllOffers().then((data) => {
      if (mounted) setOffers(data);
    }).catch(() => {
      if (mounted) setOffersError(true);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => setSearch(getSearch());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const filters = useMemo(() => parseOfferFilters(new URLSearchParams(search)), [search]);
  const offersVariant = useMemo(() => getOffersVariant(search), [search]);
  const preserveVariantParam = useMemo(() => siteEditionConfig.variantSelectionEnabled && new URLSearchParams(search).has("offersVariant"), [search]);
  const facets = useMemo(() => getListingFacets(offers), [offers]);
  const filterKey = useMemo(() => serializeOfferFilters(filters).toString(), [filters]);
  const filteredOffers = useMemo(() => getListingOffers(offers, filters), [filters, offers]);
  const displayedOffers = filteredOffers.slice(0, visibleCount);
  const chips = useMemo(() => getActiveFilterChips(filters, facets), [facets, filters]);

  useEffect(() => {
    setVisibleCount(OFFERS_PER_PAGE);
  }, [filterKey]);

  useEffect(() => {
    const update = () => {
      const bottom = filtersPanelRef.current?.getBoundingClientRect().bottom;
      setStickyVisible(Boolean(bottom != null && bottom < 116));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const applyFilters = (nextFilters) => {
    const normalized = parseOfferFilters(serializeOfferFilters(nextFilters));
    const changedFilter = findChangedOfferFilter(filters, normalized);
    if (changedFilter) trackEvent("filter_offers", { context: "listing", changed_filter: changedFilter });
    const href = getListingHref(normalized, { offersVariant, preserveVariantParam });
    window.history.pushState({}, "", href);
    setSearch(window.location.search);
  };

  const selectOffersVariant = (nextVariant) => {
    if (!siteEditionConfig.variantSelectionEnabled) return;
    const href = getListingHref(filters, { offersVariant: nextVariant, preserveVariantParam: true });
    window.history.pushState({}, "", href);
    setSearch(window.location.search);
  };

  const clearFilters = () => applyFilters(DEFAULT_OFFER_FILTERS);
  const removeChip = (key) => {
    const [field, value] = String(key).split(":", 2);
    if (["type", "location", "rooms"].includes(field) && value) {
      applyFilters({ ...filters, [field]: filters[field].filter((entry) => entry !== value) });
      return;
    }
    applyFilters({ ...filters, [key]: null });
  };
  const openFiltersDrawer = () => setMobileFiltersOpen(true);
  const closeFiltersDrawer = useCallback(() => setMobileFiltersOpen(false), []);

  return (
    <div className="offers-page">
      <SiteHeader />
      <OffersHero />
      <main className="offers-main">
        <div className="final-shell">
          <Reveal className="offers-filter-panel-reveal" {...REVEAL_MOTION.media} offset={34}>
            <section className="offers-filter-panel" ref={filtersPanelRef} aria-label="Wyszukiwanie ofert">
              <div className="offers-filter-panel__heading"><p>Znajdź po swojemu</p><span>Filtruj aktualne oferty</span></div>
              <OffersFilters filters={filters} facets={facets} onChange={applyFilters} chips={chips} onRemove={removeChip} onClear={clearFilters} />
            </section>
          </Reveal>

          <div className="offers-mobile-toolbar">
            <button type="button" onClick={openFiltersDrawer}><SlidersHorizontal aria-hidden="true" />Filtry{chips.length ? ` (${chips.length})` : ""}</button>
          </div>
          <div className="offers-mobile-active-filters"><ActiveFilterChips chips={chips} onRemove={removeChip} onClear={clearFilters} /></div>

          <section className="offers-results" aria-labelledby="offers-results-title">
            <div className="offers-results__toolbar">
              <p id="offers-results-title" aria-live="polite"><strong>{loading || offersError ? "—" : filteredOffers.length}</strong><span>{!loading && !offersError && pluralizeOffers(filteredOffers.length)}</span></p>
              <OffersSortDropdown value={filters.sort} onChange={(sort) => applyFilters({ ...filters, sort })} />
            </div>
            {siteEditionConfig.variantSelectionEnabled && <OffersVariantSwitcher activeVariant={offersVariant} onChange={selectOffersVariant} />}

            {loading ? (
              <div className="offers-grid offers-grid--loading">{Array.from({ length: 6 }, (_, index) => <OffersCardSkeleton key={index} />)}</div>
            ) : offersError ? (
              <div className="offers-empty-state runtime-offers-error" role="alert"><p>Oferty</p><h2>Nie możemy teraz pobrać<br />aktualnych ofert.</h2><span>Odśwież stronę i spróbuj ponownie.</span></div>
            ) : filteredOffers.length ? (
              <div className={`offers-grid offers-grid--variant-${offersVariant}`}>
                {displayedOffers.map((offer, index) => (
                  <OfferListingReveal className="offers-grid__item offers-grid__item--listing" index={index} key={`${filterKey}-${offersVariant}-${offer.id}`}>
                    {offersVariant === 3 ? <OfferCardVariant3 offer={offer} href={buildOfferPathWithSearch(offer, search)} priority={index < 3} /> : offersVariant === 2 ? <OfferCardVariant2 offer={offer} href={buildOfferPathWithSearch(offer, search)} priority={index < 3} /> : <OffersListingCard offer={offer} href={buildOfferPathWithSearch(offer, search)} priority={index < 3} />}
                  </OfferListingReveal>
                ))}
              </div>
            ) : (
              <div className="offers-empty-state"><p>PropertyCorp</p><h2>Nie znaleźliśmy ofert<br />dla tych kryteriów.</h2><span>Spróbuj poszerzyć zakres wyszukiwania lub usunąć część filtrów.</span><button type="button" onClick={clearFilters}>Wyczyść filtry <ArrowRight aria-hidden="true" /></button></div>
            )}

            {!loading && filteredOffers.length > displayedOffers.length && <div className="offers-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + OFFERS_PER_PAGE)}>Pokaż więcej <ArrowRight aria-hidden="true" /></button><span>Wyświetlasz {displayedOffers.length} z {filteredOffers.length}</span></div>}
          </section>
        </div>
      </main>
      <OffersStickyFilterBar visible={stickyVisible} resultCount={loading || offersError ? null : filteredOffers.length} chips={chips} filters={filters} onChange={applyFilters} onRemove={removeChip} onOpenFilters={openFiltersDrawer} />
      <MobileFiltersSheet open={mobileFiltersOpen} filters={filters} offers={offers} facets={facets} onClose={closeFiltersDrawer} onApply={applyFilters} />
      <SiteFooter />
    </div>
  );
}
