import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Instagram, Menu, X } from "lucide-react";
import { SOCIAL_LINKS } from "../../config/siteLinks.js";
import { BrandMark } from "./BrandMark.jsx";
import { trackEvent } from "../../analytics/googleAnalytics.js";
import { siteEditionConfig } from "../../config/siteEdition.js";

const navigation = [
  ["Oferty", "/oferty"],
  ["Jak pracujemy", "#jak-pracujemy"],
  ["O nas", "#o-nas"],
  ["Opinie", "#opinie"],
  ["FAQ", "#faq"],
  ["Kontakt", "#kontakt"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 28);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("site-menu-open", open);
    const onKeyDown = (event) => {
      if (open && event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("site-menu-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);
  const isHome = window.location.pathname === "/";
  const resolvedNavigation = navigation.map(([label, href]) => [label, href.startsWith("#") && !isHome ? `/${href}` : href]);
  const contactHref = isHome ? "#kontakt" : "/#kontakt";

  return (
    <header className={`final-header ${scrolled ? "is-scrolled" : ""}`}>
      <a href="/" className="final-header__brand" aria-label="PropertyCorp — strona główna">
        <BrandMark tone="dark" />
      </a>
      <nav className="final-header__nav" aria-label="Główna nawigacja">
        {resolvedNavigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <div className="final-header__actions">
        {siteEditionConfig.variantSelectionEnabled && <span className="final-header__edition">Wersja demonstracyjna — wybierz wariant</span>}
        <a
          href={SOCIAL_LINKS.instagram}
          className="final-header__instagram"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PropertyCorp na Instagramie"
          title="PropertyCorp na Instagramie"
          onClick={() => trackEvent("click_instagram", { context: "header" })}
        >
          <Instagram aria-hidden="true" />
        </a>
        <a href={contactHref} className="final-header__cta">Porozmawiajmy <ArrowUpRight aria-hidden="true" /></a>
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="final-header__toggle"
        aria-expanded={open}
        aria-controls="final-mobile-menu"
        aria-label={open ? "Zamknij menu" : "Otwórz menu"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X /> : <Menu />}
      </button>
      {typeof document !== "undefined" && createPortal(
        <div id="final-mobile-menu" className={`final-mobile-menu ${open ? "is-open" : ""}`}>
          <nav aria-label="Nawigacja mobilna">
            {resolvedNavigation.map(([label, href]) => <a key={href} href={href} onClick={closeMenu}>{label}</a>)}
            <a href={SOCIAL_LINKS.instagram} className="final-mobile-menu__instagram" target="_blank" rel="noopener noreferrer" onClick={() => { trackEvent("click_instagram", { context: "header_mobile" }); closeMenu(); }}>
              <Instagram aria-hidden="true" />
              Instagram
            </a>
          </nav>
          <div className="final-mobile-menu__contact">
            {siteEditionConfig.variantSelectionEnabled && <span className="final-mobile-menu__edition">Wersja demonstracyjna — wybierz wariant</span>}
            <span>PropertyCorp · Wrocław</span>
            <span>Kontakt niedostępny w demonstracji</span>
            <span>Dane kontaktowe są fikcyjne</span>
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
}
