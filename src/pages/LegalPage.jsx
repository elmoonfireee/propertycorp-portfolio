import React from "react";
import { SiteFooter } from "../components/layout/SiteFooter.jsx";
import { SiteHeader } from "../components/layout/SiteHeader.jsx";

const POLICY_CONTENT = {
  cookies: {
    eyebrow: "Prywatność",
    title: "Polityka cookies",
    intro: "Ta strona używa wyłącznie niezbędnego pliku cookie do zapamiętania decyzji dotyczącej prywatności. Dodatkowe technologie są wczytywane dopiero po wyrażeniu odpowiedniej zgody.",
    sections: [
      ["Niezbędne", "pc_portfolio_demo_consent — przechowuje wybrany zakres zgód (niezbędne, analityczne, mapy i treści zewnętrzne). Wygasa po około 180 dniach. Jest potrzebny wyłącznie do zapamiętania Twojej decyzji."],
      ["Google Analytics", "Google Analytics może zostać wczytane wyłącznie po wyrażeniu zgody na kategorię Analityczne. Faktycznie używane pliki cookie, takie jak _ga lub _ga_<identyfikator>, zależą od konfiguracji Google Analytics i pojawiają się dopiero po tej zgodzie."],
      ["Mapy", "Mapa demonstracyjna korzysta z OpenStreetMap; wariant klienta może korzystać z Google Maps. Mapy są wczytywane wyłącznie po zgodzie na kategorię Mapy i treści zewnętrzne."],
      ["Zmiana decyzji", "W każdej chwili możesz otworzyć Ustawienia cookies w stopce strony i zmienić lub wycofać zgodę. Wycofanie zgody zatrzymuje dalsze ładowanie usług opcjonalnych po kontrolowanym odświeżeniu strony."],
    ],
  },
  privacy: {
    eyebrow: "Prywatność",
    title: "Polityka prywatności",
    intro: "To demonstracja techniczna. Tekst nie stanowi polityki prywatności dla wdrożenia produkcyjnego.",
    sections: [
      ["Google Analytics", "Za zgodą użytkownika korzystamy z Google Analytics 4, aby analizować korzystanie ze strony, popularność ofert oraz skuteczność funkcji. Do zdarzeń nie przekazujemy imienia, adresu e-mail, telefonu, treści formularza, adresu IP ani dokładnych współrzędnych ofert."],
      ["Mapy", "Za zgodą na Mapy i treści zewnętrzne przeglądarka może komunikować się bezpośrednio z OpenStreetMap lub Google w celu wyświetlenia mapy ofert."],
      ["Opinie Google", "Sekcja opinii pobiera dane przez serwerowy endpoint PropertyCorp do Google Business Profile. Przeglądarka użytkownika nie pobiera opinii bezpośrednio z Google."],
      ["Wycofanie zgody", "Ustawienia cookies w stopce pozwalają w każdej chwili włączyć lub wyłączyć Analitykę oraz Mapy i treści zewnętrzne."],
      ["Ważna informacja", "LEGAL REVIEW RECOMMENDED. Treść polityki wymaga sprawdzenia i zatwierdzenia przez osobę odpowiedzialną za obsługę prawną oraz ochronę danych w PropertyCorp."],
    ],
  },
};

export function LegalPage({ type }) {
  const policy = POLICY_CONTENT[type] || POLICY_CONTENT.privacy;
  return <div className="legal-page"><SiteHeader /><main id="main-content" className="legal-page__main"><div className="final-shell legal-page__content"><p>{policy.eyebrow}</p><h1>{policy.title}</h1><span>{policy.intro}</span><div>{policy.sections.map(([heading, copy]) => <section key={heading}><h2>{heading}</h2><p>{copy}</p></section>)}</div></div></main><SiteFooter /></div>;
}
