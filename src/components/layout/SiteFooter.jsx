import React from "react";
import { ArrowUpRight, Instagram } from "lucide-react";
import { SOCIAL_LINKS } from "../../config/siteLinks.js";
import { BrandMark } from "./BrandMark.jsx";
import { CookieSettingsButton } from "../consent/ConsentManager.jsx";
import { trackEvent } from "../../analytics/googleAnalytics.js";
import { Reveal, REVEAL_MOTION } from "../home/Reveal.jsx";

export function SiteFooter() {
  return (
    <footer className="final-footer">
      <div className="final-footer__top final-shell">
        <Reveal className="final-footer__identity" {...REVEAL_MOTION.media} offset={36}>
          <a href="/" className="final-footer__brand-link" aria-label="PropertyCorp — strona główna"><BrandMark className="final-footer__brand-mark" tone="dark" /></a>
        </Reveal>
        <Reveal className="final-footer__column" {...REVEAL_MOTION.heading} offset={30}><span>Biuro</span><address>Projekt demonstracyjny<br />Dane fikcyjne</address></Reveal>
        <Reveal className="final-footer__column" {...REVEAL_MOTION.copy} offset={30}><span>Kontakt</span><span>Kontakt niedostępny w demonstracji</span><span>Dane kontaktowe są fikcyjne</span></Reveal>
        <Reveal className="final-footer__column" {...REVEAL_MOTION.action} offset={30}><span>Nawigacja</span><a href="/oferty">Oferty</a><a href="/#jak-pracujemy">Jak pracujemy</a><a href="/#kontakt">Kontakt</a></Reveal>
        <Reveal className="final-footer__column" delay={760} duration={REVEAL_MOTION.action.duration} offset={30}>
          <span>Social media</span>
          <a href={SOCIAL_LINKS.instagram} className="final-footer__social-link" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("click_instagram", { context: "footer" })}>
            <Instagram aria-hidden="true" />
            <span>Instagram</span>
            <ArrowUpRight aria-hidden="true" />
          </a>
        </Reveal>
      </div>
      <div className="final-footer__bottom final-shell">
        <span className="final-footer__bottom-item">© {new Date().getFullYear()} PropertyCorp</span>
        <a className="final-footer__bottom-item" href="/polityka-prywatnosci">Polityka prywatności</a>
        <a className="final-footer__bottom-item" href="/polityka-cookies">Polityka cookies</a>
        <CookieSettingsButton className="final-footer__bottom-item final-footer__cookie-settings" />
      </div>
    </footer>
  );
}
