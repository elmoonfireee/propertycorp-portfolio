# PropertyCorp Description Format V1

Status: normatywny kontrakt dla nowych i świadomie przepisywanych opisów IMO.

Słowa **MUSI**, **NIE MOŻE**, **POWINIEN** i **MOŻE** określają odpowiednio wymaganie, zakaz, rekomendację i możliwość. Ten dokument opisuje format autorski. Zachowania dla transportu IMO i danych historycznych są wyraźnie oznaczone jako nienormatywne.

## 1. Purpose

Format V1 ma pozostać czytelnym plain textem w IMO i na portalach, a równocześnie dawać PropertyCorp jednoznaczne granice sekcji, akapitów, list, podnagłówków oraz metraży. Ma działać dla mieszkań, domów, lokali, inwestycji i przyszłych rodzajów ofert bez zamkniętego słownika nagłówków.

V1 nie wymaga HTML ani ręcznego rich textu i nie upoważnia autora do zmiany faktów, liczb, danych kontaktowych czy treści prawnej.

## 2. Authoring contract and compatibility boundary

Nowy opis MUSI używać wyłącznie kanonicznej składni poniżej. Nie twórz celowo form tolerowanych wyłącznie dla eksportu IMO lub danych historycznych.

W szczególności autor zapisuje `m²`, a nie `m` ani `m2`; używa literalnego `- `, a nie `-Text`, `•`, `–` ani `—`; nie stosuje HTML, Markdownowego pogrubienia czy podkreślenia jako nośnika struktury. Rozdziały 17–18 opisują wyłącznie nienormatywną kompatybilność parsera.

## 3. Core syntax

| Konstrukcja | Składnia plain text | Znaczenie |
| --- | --- | --- |
| Section heading | `NAZWA SEKCJI:` w osobnej linii | Początek nowej sekcji |
| Prose paragraph | Zwykły tekst bez składni strukturalnej | Akapit narracyjny |
| List item | `- Treść` | Jedna równorzędna wartość |
| Labeled list item | `- Etykieta: opis` | Wartość z krótką etykietą |
| Key/value row | `Etykieta: wartość` | Pojedynczy fakt poza listą |
| Measurement row | `- Pomieszczenie: 12,50 m²` | Kanoniczny metraż |
| Measurement note row | `- Pomieszczenie: 12,50 m² | dodatkowy opis` | Metraż i drugi opis |
| Subheading | `Parter:` w sekcji | Grupa wewnątrz bieżącej sekcji |
| Summary row | `SUMA: 74,64 m²` | Podsumowanie metrażu bez list marker |

Nie używa się znaczników technicznych takich jak `[SECTION]`, `[/SECTION]` czy `<pc-list>`.

## 4. Sections and headings

Section heading MUSI:

- być w osobnej linii;
- mieć wszystkie litery zapisane wielkimi literami;
- kończyć się jednym ASCII `:` i nie mieć treści po nim;
- zawierać co najmniej jedną literę;
- nie zaczynać się od markera listy.

```text
LOKALIZACJA:
UKŁAD POMIESZCZEŃ:
OTOCZENIE BUDYNKU:
```

Nagłówki są otwarte — poprawny nagłówek nie musi być znany parserowi. Często używane i semantycznie rozpoznawane są między innymi:

```text
MIESZKANIE:
APARTAMENT:
DOM:
LOKAL:
BUDYNEK:
INWESTYCJA:
ATUTY:
ATUTY LOKALIZACJI:
ATUTY APARTAMENTU:
UDOGODNIENIA I STANDARD WYKOŃCZEŃ:
MOŻLIWE PRZEZNACZENIE:
MOŻLIWE PRZEZNACZENIE LOKALU:
PRZYKŁADOWE PRZEZNACZENIE:
PRZYKŁADOWE PRZEZNACZENIE LOKALU:
KOSZTY:
DLA KOGO:
WAŻNE:
KONTAKT I PREZENTACJA:
INFORMACJE PRAWNE:
```

Parser rozpoznaje również warianty `MOŻLIWE PRZEZNACZENIE LOKALU:`, `PRZYKŁADOWE PRZEZNACZENIE:` i `PRZYKŁADOWE PRZEZNACZENIE LOKALU:` jako tę samą semantykę przeznaczenia. Lista przykładów nie zamyka dozwolonych nagłówków.

Sekcja zaczyna się na nagłówku i kończy bezpośrednio przed następnym nagłówkiem albo na końcu opisu. Podnagłówek, pusta linia, lista, CTA, podpis lub zmiana stylu nie kończą sekcji. Gdy zmienia się temat, autor MUSI utworzyć nowy heading.

Nie twórz dwóch top-level sections o tym samym headingu dla różnych celów. Połącz powiązane punkty w jedną sekcję `WAŻNE:`; disclaimer należy do odrębnej sekcji `INFORMACJE PRAWNE:`.

## 5. Prose and whitespace

Prose jest dozwolone przed pierwszą sekcją i w sekcji. Używaj go dla narracji, nie dla kilku równorzędnych parametrów. Dwa osobne akapity POWINNY być rozdzielone jednym pustym wierszem.

Pusty wiersz może wystąpić po nagłówku, między akapitami, przed kolejną sekcją lub podnagłówkiem. Nie może wystąpić między kolejnymi elementami tej samej listy. Metraż w zwykłym zdaniu pozostaje prose i nie staje się automatycznie measurement row.

## 6. Lists

Każdy list item MUSI zaczynać się od ASCII hyphen-minus U+002D i dokładnie jednej spacji: `- `. Marker bez spacji albo inny znak nie jest V1.

```text
ATUTY LOKALIZACJI:

- Komunikacja: szybki dojazd do centrum
- Tereny zielone: park i miejsca rekreacyjne
```

Niedozwolone jako marker V1 są `-Tekst`, `– Tekst`, `— Tekst`, `• Tekst`, `+Tekst` i `\- Tekst`. Lista należy do jawnej sekcji; list item poza sekcją jest błędem authoringu.

Jeżeli sekcja zawiera kilka równorzędnych wartości, każda MUSI być osobnym list itemem. Nie wolno udawać listy kilkoma krótkimi akapitami.

## 7. Label and value

Preferowana postać równoległego parametru to:

```text
- Etykieta: opis
```

Etykieta i opis MUSZĄ być niepuste. Etykieta POWINNA być krótka i jednoznacznie wynikać ze źródła; nie może wprowadzać nowego faktu.

```text
KOSZTY:

- Cena najmu: 56,27 zł netto/m²
- Czynsz administracyjny: około 16 zł netto/m²
- Energia: według zużycia
- Miejsca parkingowe: możliwość wynajęcia za dodatkową opłatą dwóch miejsc w garażu podziemnym
```

Dozwolony jest również pojedynczy key/value row w sekcji, `Etykieta: wartość`. Równoległe parametry POWINNY jednak pozostać w jednolitym formacie listy. Nie zamieniaj zwykłej narracji w sztuczną etykietę.

## 8. Layout and measurements

Jedyny kanoniczny metraż V1 ma postać:

```text
12,50 m²
```

Formalnie:

```text
<area> ::= <digits> "," <two-digits> " m²"
<measurement> ::= <area> | "ok. " <area>
```

Wymagane są przecinek, dokładnie dwie cyfry po przecinku, jedna spacja i `²`. Wartość przybliżona zachowuje `ok.`. Autor nie wykonuje obliczeń, nie zmienia liczb i nie dopisuje `SUMA`, jeśli nie ma jej w źródle.

W równorzędnym układzie pomieszczeń każde pomieszczenie MUSI być list itemem:

```text
UKŁAD POMIESZCZEŃ:

- Salon: 28,61 m²
- Kuchnia: 8,40 m²
- Sypialnia: 13,97 m²
- Łazienka: 6,10 m²
```

Pomieszczenie bez podanego metrażu nadal może być zwykłym list itemem. Wiele pomieszczeń lub metraży w jednym wierszu nie jest kanonicznym układem; należy je rozdzielić, gdy źródło pozwala zrobić to bez zgadywania.

## 9. Measurement + secondary note

Jeżeli źródło podaje dla jednego pomieszczenia metraż i drugi opis, jedyna kanoniczna postać to:

```text
- Gabinet 1: 14,40 m² | Prywatne biuro lub pokój konsultacyjny
- Pokój: ok. 17,80 m² | Dodatkowy opis
```

`|` jest jednym strukturalnym separatorem między `measurement` i `secondary note`. Po obu stronach MUSI być jedna spacja. Notatka MUSI zawierać rzeczywistą informację ze źródła. Autor nie może wymyślać notatki, usuwać jej dla uproszczenia ani używać `|` w innym celu.

Niedozwolone są na przykład:

```text
- Gabinet 1: 14,40 m² – Prywatne biuro
- Gabinet 1: 14,40 m² - Prywatne biuro
- Gabinet 1: 14,40 m² Prywatne biuro
```

## 10. Subheadings and SUMA

Subheading grupuje treść wewnątrz aktualnej sekcji. Ma osobną linię, końcowy `:`, nie ma wartości po dwukropku i jest zapisany naturalnym mixed/sentence case, na przykład `Parter:`, `Piętro:`, `Poziom I:` lub `Strefa dzienna:`.

`SUMA` ma wyłącznie postać:

```text
SUMA: 74,64 m²
```

Nie poprzedzaj go `- `. Użyj go tylko wtedy, gdy suma jest podana w źródle; parser jej nie wylicza.

## 11. Legal, contact and factual preservation

Treść prawna i disclaimery MUSZĄ zachować swoje znaczenie. Gdy występują, POWINNY znaleźć się pod `INFORMACJE PRAWNE:`. Nie wolno tworzyć nowego disclaimera.

Dane kontaktowe ze źródła — w tym agent, telefon, e-mail, licencja i nazwa firmy — MUSZĄ zostać zachowane i mogą być uporządkowane pod `KONTAKT I PREZENTACJA:`. Dopuszczalna jest tylko drobna redakcja interpunkcji bez zmiany znaczenia.

Czysty grzecznościowy wstęp można zneutralizować tylko wtedy, gdy nie usuwa to żadnego opisu nieruchomości. Nie wolno automatycznie skracać zdań opisujących charakter, grupę docelową, komfort, otoczenie, funkcję, przydatność ani faktyczne cechy.

## 12. Plain text only

V1 jest plain textem. Autor nie używa `<b>`, `<strong>`, `<u>`, `**...**`, ręcznego formatowania HTML ani stylów jako sygnału strukturalnego. Prawidłowy heading, lista i metraż muszą być zrozumiałe wyłącznie z tekstu.

## 13. Authoring validation checklist

Przed zapisaniem opisu sprawdź:

- wszystkie fakty, liczby, warunki, kontakt i disclaimery są zachowane;
- nagłówki są uppercase, osobne i kończą się `:`;
- nie ma pustych ani niepotrzebnie powtórzonych top-level sections;
- listy mają literalne `- ` i żadnych pustych wierszy między punktami;
- metraże używają `m²`, a notatka używa `measurement | note`;
- nie ma HTML, Markdownowego stylowania, `•`, `-Text` ani celowego `m`/`m2`;
- etykiety nie tworzą nowych faktów, a `SUMA` nie została obliczona przez autora.

## 14. Full example conventions

Poniższe przykłady są pełnymi, poprawnymi fixtures V1. Pokazują różne rodzaje ofert bez narzucania zamkniętej listy sekcji.

## 15. Examples

### A. Mieszkanie

```text
Jasne, trzypokojowe mieszkanie po remoncie, gotowe do zamieszkania.

LOKALIZACJA:

Nieruchomość znajduje się blisko parku i komunikacji miejskiej.

ATUTY MIESZKANIA:

- Remont: wymienione instalacje i nowe podłogi
- Balkon: przestrzeń do odpoczynku
- Winda: wygodny dostęp do szóstego piętra

UKŁAD POMIESZCZEŃ:

- Salon: 20,40 m²
- Kuchnia: 8,10 m²
- Sypialnia 1: 11,20 m²
- Sypialnia 2: 9,30 m²
- Łazienka: 4,00 m²

SUMA: 53,00 m²

KONTAKT I PREZENTACJA:

Zapraszamy do kontaktu w celu umówienia prezentacji.
```

### B. Dom z kondygnacjami

```text
DOM:

Wolnostojący dom z ogrodem i garażem w bryle budynku.

UKŁAD POMIESZCZEŃ:

Parter:

- Wiatrołap: 4,20 m²
- Salon: 30,00 m²
- Kuchnia: 10,00 m²

Piętro:

- Sypialnia: 12,00 m²
- Łazienka: 7,00 m²

SUMA: 63,20 m²
```

### C. Lokal komercyjny

```text
LOKAL:

Lokal usługowy na parterze ma witrynę oraz dwa niezależne wejścia.

MOŻLIWE PRZEZNACZENIE LOKALU:

- Biuro
- Showroom
- Gabinet medyczny
- Studio treningowe

KOSZTY:

- Czynsz najmu: 8 000 zł netto
- Opłata eksploatacyjna: 11 zł netto/m²
- Media: według zużycia
```

### D. Nowy, nieznany heading

```text
UDOGODNIENIA OSIEDLA:

- Monitoring
- Plac zabaw
- Rowerownia
```

Parser zachowuje tę poprawną sekcję jako generic; nieznana nazwa nie jest błędem authoringu.

### E. `DLA KOGO` z wieloma wartościami

```text
DLA KOGO:

- Dla rodzin i singli szukających mieszkania w ścisłym centrum
- Dla inwestorów poszukujących lokalu pod wynajem lub działalność usługową
- Dla osób ceniących wygodę, komunikację i dostępność wszystkiego na miejscu

WAŻNE:

- Kupujący nie płaci prowizji
- Lokal dostępny od zaraz
```

### F. Mixed prose + list

```text
INWESTYCJA:

Kameralny budynek łączy współczesną architekturę z zielonym otoczeniem.

Najważniejsze cechy inwestycji przedstawiono poniżej.

- Niska zabudowa
- Prywatny park dla mieszkańców
- Monitoring części wspólnych

Materiały części wspólnych dobrano z myślą o trwałości i łatwym utrzymaniu.
```

### G. Measurement + `SUMA`

```text
UKŁAD POMIESZCZEŃ:

- Salon z aneksem: 28,61 m²
- Sypialnia: 13,97 m² | Prywatna strefa wypoczynku
- Łazienka: 6,10 m²
- Balkon: ok. 6,00 m²

SUMA: 48,68 m²
```

### H. Kontakt i końcowa treść prawna

```text
KONTAKT I PREZENTACJA:

Zapraszamy do kontaktu w celu umówienia prezentacji i uzyskania szczegółowych informacji.

Osoba Demo
000 000 000

INFORMACJE PRAWNE:

Tu pozostaje zatwierdzona przez PropertyCorp treść prawna.
```

## 16. Ambiguity resolution

| Wejście | Wynik V1 | Korekta lub uzasadnienie |
| --- | --- | --- |
| `SUMA: 74,64 m²` | summary row | Kanoniczny metraż jest w tej samej linii. |
| `SUMA:` | heading z ostrzeżeniem | Zamiast niego użyj pełnego summary albo `PODSUMOWANIE:`. |
| `Parter:` | subheading | Jest wewnątrz sekcji i ma mixed case. |
| `PARTER:` | section heading | Wszystkie litery są wielkie. |
| `Czynsz: 1000 zł` | key/value row | Treść po `:` wyklucza heading. |
| `LOKALIZACJA: Centrum` | key/value row z ostrzeżeniem | Heading musi być samodzielną linią. |
| `- Salon: 20,40 m²` | measurement list item | Kanoniczny metraż. |
| `- Salon: 20,40 m² | jasny i ustawny` | measurement note row | Lewa strona `|` jest kanonicznym metrażem. |
| `- Salon: 12,5m2` | niekanoniczna wartość | Popraw na `12,50 m²`; nie jest V1. |
| pogrubione zdanie | prose | Styl nie tworzy struktury V1. |

## 17. IMO transport compatibility (non-normative)

Rzeczywisty eksport IMO może zrzucić superscript z kanonicznego tekstu autora. Parser może zatem przyjąć `14,40 m` lub `14,40 m2` jako transportowy odpowiednik `14,40 m²`, również dla `ok. 17,80 …` i przed `|` w measurement-note row. Model i renderer normalizują taki ścisły odpowiednik do `m²`.

To zachowanie nie rozszerza składni authoringu. Jedna cyfra po przecinku, kropka dziesiętna, liczba całkowita, przypadkowy tekst z `m` i niepowiązane jednostki nie stają się przez to kanonicznymi measurement rows.

## 18. Legacy compatibility (non-normative)

Historyczne eksporty mogą zawierać rich HTML oraz częściowo uszkodzoną składnię, na przykład `<b>-Prestiżowy charakter inwestycji,</b>` lub `<u><b>Centrum miasta</b> - bliskość wszystkiego co najważniejsze`.

Po rozpoznaniu poprawnego V1 parser może zachowawczo odzyskać oczywiste `-Text`, `–Text`, `—Text`, `•Text` oraz krótkie dekorowane `Label - description`, `Label – description` i `Label — description` w znanych sekcjach listowych. Nie zmienia to normy V1, nie obejmuje dowolnego stylowanego prose i nie gwarantuje automatycznego odzyskania każdej treści historycznej. Autor przepisujący opis musi usunąć stare stylowanie, zachować fakty i użyć poprawnego `- ` oraz `- Label: description`.
