# Sources Test Plan

To jest operacyjny plan testow dla `http://127.0.0.1:3000/sources`.

Cel:

1. upewnic sie, ze dodawanie zrodel dziala od wejscia do zapisu
2. potwierdzic website autodiscovery, direct feed i expected failure
3. sprawdzic keyboard flow, focus continuity i podstawowa ergonomie
4. utrzymac powtarzalny evidence package dla regresji

## Jedno polecenie

Najprostsza sciezka:

```powershell
npm run qa:sources
```

To polecenie:

1. uruchamia `test:unit`
2. uruchamia `build`
3. stawia lokalny API i web runtime, jesli jeszcze nie dzialaja
4. naprawia stale lokalne listenery `3000` i `8000`, jesli sa zwiazane z RSSmasterem, ale health nie przechodzi
5. uruchamia `check_api`
6. uruchamia `check_health`
7. uruchamia browser smoke `check:sources`

To polecenie daje `fallback runtime green`, nie `canonical cold boot green`.

Jesli potrzebujesz prawdziwego clean boot proof na `127.0.0.1:3000` i `127.0.0.1:8000`, uruchom:

```powershell
npm run qa:sources -- --cold-start
```

W trybie `--cold-start` harness bezpiecznie zatrzymuje tylko rozpoznane runtime'y RSSmastera z tego repo, rowniez na fallback portach takich jak `3100` i `8100`. Nie zabija nieznanych procesow.

Jesli chcesz najpierw ustalic, co blokuje porty domyslne, uruchom:

```powershell
npm run check:ports
```

Jesli po testach chcesz od razu wejsc do przegladarki:

```powershell
python scripts/run_sources_qa.py --keep-running
```

## Zakres automatyczny

| ID | Obszar | Scenariusz | Oczekiwany wynik |
| --- | --- | --- | --- |
| SRC-AUTO-001 | boot | web i api sa zdrowe | `/api/health` i `/health` zwracaja `status: ok` |
| SRC-AUTO-002 | website | wpisanie adresu strony wykrywa pojedynczy feed | widoczny wynik `single match`, bez `pageErrors` |
| SRC-AUTO-003 | website | klik `Obserwuj` zapisuje kanal | UI pokazuje sukces i kanal trafia do biblioteki |
| SRC-AUTO-004 | website | ponowne sprawdzenie tego samego URL pokazuje stan istniejacego zrodla | widoczny stan `Juz obserwujesz` i akcja `Przejdz do feedu` |
| SRC-AUTO-005 | web_feed | manualny preview RSS/Atom dziala | po `Znajdz` fokus przechodzi do regionu wynikow |
| SRC-AUTO-006 | keyboard | skip link i input sa osiagalne klawiatura | focus trafia do `source-input` |
| SRC-AUTO-007 | keyboard | otwarcie `Opcje` ustawia focus na kategorii | focus trafia do `source-category-input` |
| SRC-AUTO-008 | preview race | szybka zmiana intencji nie pokazuje starego preview | stale response nie nadpisuje nowego wyniku |
| SRC-AUTO-009 | website | strona z wieloma feedami pokazuje kandydatow | widoczne `Alpha Feed` i `Beta Feed` |
| SRC-AUTO-010 | error UX | blad transportowy jest spokojny | polski komunikat, `consoleErrors=[]` |
| SRC-AUTO-011 | backoffice | `Zarzadzaj zrodlami` zachowuje focus continuity | fokus trafia do regionu backoffice |
| SRC-AUTO-012 | responsive | desktop, tablet i mobile nie maja oczywistej regresji | brak poziomego overflow i brak `pageErrors` |

Artefakty:

- `output/playwright/sources-qa.json`
- `output/playwright/sources-a11y-smoke.json`
- `output/playwright/sources-a11y-smoke.png`
- `output/playwright/sources-cold-boot.json`
- `output/playwright/qa-sources-api.log`
- `output/playwright/qa-sources-web.log`

`sources-a11y-smoke.json` zawiera teraz rowniez fokus-trail i selektywne accessibility snapshoty dla wejscia, wynikow i backoffice.

## Zakres manualny

| ID | Obszar | Scenariusz | Oczekiwany wynik |
| --- | --- | --- | --- |
| SRC-MAN-001 | website | dodanie prawdziwej produkcyjnej strony | feed zostaje wykryty i zapisany |
| SRC-MAN-002 | web_feed | dodanie prawdziwego bezposredniego RSS/Atom | preview i zapis dzialaja |
| SRC-MAN-003 | existing | `Przejdz do feedu` dla istniejacego zrodla | przejscie do wlasciwego feedu albo sensowny fallback |
| SRC-MAN-004 | existing | `Przestan obserwowac` | kanal zmienia stan zgodnie z produktem |
| SRC-MAN-005 | import | `Import OPML` na realnym pliku | import konczy sie poprawnie i zrodla pojawiaja sie w bibliotece |
| SRC-MAN-006 | capture | `Przechwyc link` | link trafia do produktu zgodnie z flow capture |
| SRC-MAN-007 | operators | `Sync aktywnych` z poziomu `/sources` | uruchamia sie sync i widoczny jest sensowny feedback |
| SRC-MAN-008 | localization | dluzsze copy i rozne domeny | layout nie peka, brak overflow |
| SRC-MAN-009 | keyboard | caly flow bez myszy | od wpisania adresu do zapisu i wejscia w backoffice |
| SRC-MAN-010 | screen reader | live region i dynamiczne stany | komunikaty sa czytelne i nie dubla sie |

## Czy potrzebne jest dodatkowe narzedzie

Do automatycznego QA nie potrzeba nowego narzedzia. Repo ma juz wszystko, czego potrzeba:

- `Vitest` do unitow web
- `check_api.py` do kontraktu i smoke API
- `check_health.py` do boot/health
- `Playwright` runtime do browser smoke `check:sources`

Dodatkowe narzedzie jest opcjonalne tylko dla finalnego a11y pass:

- `NVDA` na Windows albo `VoiceOver` na macOS do recznego screen reader smoke

Manualny protokol sign-offu jest opisany w `docs/runbooks/a11y-screen-reader-signoff.md`.

## Typowe problemy lokalne

- `127.0.0.1:3000` odmawia polaczenia: nie dziala web runtime. Uruchom `npm run qa:sources` albo `python scripts/run_sources_qa.py --keep-running`.
- `check_health.py` timeout na `8000`: prawdopodobnie masz stary listener API. Zrestartuj API runtime.
- `check:sources` pada na konsoli: sprawdz `output/playwright/sources-a11y-smoke.json` i logi `qa-sources-*.log`.
