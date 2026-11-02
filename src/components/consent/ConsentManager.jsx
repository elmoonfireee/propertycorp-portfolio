import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useConsent } from "../../consent/ConsentProvider.jsx";

const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";

function PolicyLinks() {
  return <p className="consent-ui__links"><a href="/polityka-cookies">Polityka cookies</a><a href="/polityka-prywatnosci">Polityka prywatności</a></p>;
}

function CookieBanner() {
  const { acceptAll, rejectOptional, openConsentPreferences } = useConsent();
  return <aside className="consent-banner" aria-label="Ustawienia prywatności">
    <div className="consent-banner__copy"><p>Prywatność i cookies</p><span>Używamy niezbędnych technologii do prawidłowego działania strony. Za Twoją zgodą możemy również korzystać z narzędzi analitycznych oraz usług zewnętrznych, takich jak Mapy Google. Swój wybór możesz w każdej chwili zmienić.</span><PolicyLinks /></div>
    <div className="consent-banner__actions"><button type="button" className="consent-button consent-button--quiet" onClick={rejectOptional}>Odrzuć opcjonalne</button><button type="button" className="consent-button consent-button--quiet" data-consent-settings-trigger onClick={openConsentPreferences}>Ustawienia</button><button type="button" className="consent-button" onClick={acceptAll}>Akceptuję wszystkie <Check aria-hidden="true" /></button></div>
  </aside>;
}

function ConsentToggle({ label, copy, checked, disabled = false, onChange }) {
  return <label className={`consent-preferences__item${disabled ? " is-required" : ""}`}>
    <span className="consent-preferences__item-copy"><strong>{label}</strong><small>{copy}</small></span>
    <span className="consent-switch"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} /><i aria-hidden="true" /></span>
  </label>;
}

function ConsentPreferences() {
  const {
    consent,
    hasDecision,
    acceptAll,
    rejectOptional,
    savePreferences,
    closeConsentPreferences,
  } = useConsent();
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [draft, setDraft] = useState(() => ({ analytics: consent.analytics, externalMedia: consent.externalMedia }));

  useEffect(() => {
    setDraft({ analytics: consent.analytics, externalMedia: consent.externalMedia });
  }, [consent.analytics, consent.externalMedia]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConsentPreferences();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll(focusableSelector);
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      const previousFocus = previousFocusRef.current;
      if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus();
      else document.querySelector("[data-consent-settings-trigger]")?.focus();
    };
  }, [closeConsentPreferences]);

  const close = () => closeConsentPreferences();
  const reject = () => rejectOptional();
  const accept = () => acceptAll();
  const save = () => savePreferences(draft);

  const dialog = <div className="consent-preferences-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} className="consent-preferences" role="dialog" aria-modal="true" aria-labelledby="consent-preferences-title" tabIndex={-1}>
      <header><div><p>Ustawienia cookies</p><h2 id="consent-preferences-title">Ty decydujesz o dodatkowych usługach.</h2></div><button type="button" aria-label="Zamknij ustawienia cookies" onClick={close}><X aria-hidden="true" /></button></header>
      <div className="consent-preferences__items">
        <ConsentToggle label="Niezbędne" checked copy="Zapewniają podstawowe działanie strony oraz zapamiętują Twój wybór dotyczący prywatności." disabled />
        <ConsentToggle label="Analityczne" checked={draft.analytics} onChange={(analytics) => setDraft((current) => ({ ...current, analytics }))} copy="Pomagają nam zrozumieć sposób korzystania ze strony, popularność ofert oraz skuteczność jej funkcji za pomocą Google Analytics." />
        <ConsentToggle label="Mapy i treści zewnętrzne" checked={draft.externalMedia} onChange={(externalMedia) => setDraft((current) => ({ ...current, externalMedia }))} copy="Pozwalają wczytywać Mapy Google. Po włączeniu przeglądarka komunikuje się bezpośrednio z usługami Google." />
      </div>
      <footer><PolicyLinks /><div className="consent-preferences__actions"><button type="button" className="consent-button consent-button--quiet" onClick={reject}>Odrzuć opcjonalne</button><button type="button" className="consent-button consent-button--quiet" onClick={save}>Zapisz wybór</button><button type="button" className="consent-button" onClick={accept}>Akceptuję wszystkie <Check aria-hidden="true" /></button></div></footer>
      {!hasDecision && <span className="consent-preferences__note">Niezbędne technologie pozostają zawsze aktywne.</span>}
    </section>
  </div>;
  return createPortal(dialog, document.body);
}

export function ConsentManager() {
  const { hasDecision, preferencesOpen } = useConsent();
  return <>{!hasDecision && !preferencesOpen && <CookieBanner />}{preferencesOpen && <ConsentPreferences />}</>;
}

export function CookieSettingsButton({ className = "" }) {
  const { openConsentPreferences } = useConsent();
  return <button type="button" className={`cookie-settings-button ${className}`.trim()} onClick={openConsentPreferences}><SlidersHorizontal aria-hidden="true" />Ustawienia cookies</button>;
}
