# PropertyCorp - demonstracja portfolio

Demonstracyjna aplikacja React 18 i Vite prezentująca katalog nieruchomości. Wszystkie oferty, ich opisy, zdjęcia, współrzędne i dane kontaktowe w tej kopii są fikcyjne. Grafiki strony, logo i zdjęcia zespołu pochodzą z oryginalnej aplikacji. To nie jest działająca strona biura ani oferta sprzedaży. Zdjęcia ofert są wygenerowanymi obrazami poglądowymi; nieruchomości nie istnieją jako rzeczywiste ogłoszenia.

## Uruchomienie

Wymagania: Node.js 22 i pnpm 9.15.9.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Serwer demonstracyjny nasłuchuje domyślnie tylko na `127.0.0.1`. Domyślny profil to portfolio, a źródło to lokalny syntetyczny plik `_input/imo-current/oferty.json`. Nie trzeba konfigurować sekretów. Korzystaj ze skryptów `dev`, `build` i `preview` z `package.json`: bezpośrednie uruchomienie Vite bez wskazania edycji wybiera profil `client`, który przy dodatkowej konfiguracji może włączać integracje. `pnpm run build` i `pnpm run build:portfolio` budują profil portfolio; `pnpm run build:client` pozwala sprawdzić drugi wariant interfejsu.

## Funkcje

Lista, filtrowanie, sortowanie, szczegóły, galeria oraz parser opisów używają tego samego modelu danych co aplikacja źródłowa. Zmienne `VITE_OFFERS_REPOSITORY=local` i `runtime` wybierają istniejący adapter podczas buildu. Runtime wymaga własnego endpointu API z danymi testowymi; wariant local nie wymaga serwera API. Narzędzia importu i serwer są zachowane do testów, ale nie uruchamiają się podczas zwykłego startu demonstracji. Nie należy kierować ich na dane ani środowisko produkcyjne.

Mapa portfolio korzysta z OpenStreetMap i działa po zgodzie na mapy i treści zewnętrzne; wymaga połączenia z internetem, ale nie wymaga klucza Google. Punkty są fikcyjne i mają charakter wyłącznie poglądowy. Wariant klienta może korzystać z Google Maps po konfiguracji klucza. Formularz w profilu portfolio nie wysyła zapytań. Opinie, analityka, SMTP i integracje zewnętrzne nie są skonfigurowane ani wymagane do demonstracji. Adresy example.test i numery zerowe są fikcyjne.

## Struktura

- `src/pages` i `src/components` - widoki, komponenty i interakcje.
- `src/domain/offers` - normalizacja, filtry, sortowanie i parser opisów.
- `src/services/offers` - lokalny i serwerowy adapter ofert.
- `_input/imo-current` i `public/media` - syntetyczne dane ofert oraz grafiki strony i obrazy demonstracyjne.
- `scripts`, `server` i `api` - testy, narzędzia i opcjonalny serwer.

## Testy

Testy Node znajdują się w `scripts/test-*.mjs`; dodatkowe kontrole to `node scripts/verify-consent.mjs`, `node scripts/validate-offers.mjs` i `node scripts/audit-offer-layouts.mjs`. Część testów operacyjnych tworzy własne katalogi tymczasowe i lokalny serwer loopback. Pełna lista skryptów jest w `package.json`. Profil domyślny można obejrzeć po buildzie poleceniem `pnpm run preview`.
