---
title: "Raport architektoniczny — moduł 4 (ścieżka 10xArchitect)"
created: 2026-08-11
sources:
  - "L2: oss/tldraw/context/map/repo-map.md"
  - "L3: oss/tldraw/context/changes/schema-persistence-flow/research.md"
  - "L4: oss/tldraw/context/changes/refactor-opportunities/{research,plan}.md"
  - "L5: app/context/domain/01-domain-distillation.md, 02-invariant-aggregate-refactor.md, 03-anti-corruption-layer.md"
---

# Raport architektoniczny — moduł 4

## 1. Opisane projekty

| Repo | Stack | Skala (orientacyjnie) | Artefakty |
|---|---|---|---|
| **tldraw** (OSS) | TypeScript monorepo (Yarn Berry + Lerna): SDK infinite canvas jako paczki npm (`packages/*`) + SaaS tldraw.com (Vite/React + Cloudflare Workers z Durable Objects) | 1598 commitów/12 mies. (~130/mies.), `Editor.ts` 11,9 tys. linii, analiza na HEAD `68667d639` | **L2** (mapa), **L3** (research ficzera), **L4** (plan refaktoryzacji) |
| **SubTrack** (moja aplikacja z kursu) | Astro 6 SSR + React 19 islands + Supabase (auth + Postgres/RLS) + Cloudflare Workers | MVP solo: ~71 testów unit + integracyjne na realnym Postgresie + 4 e2e; 14 plików serwerowych dotkniętych zależnością Supabase | **L5** (destylacja domeny, niezmiennik/agregat, ACL) |

## 2. Mapa projektu (L2, tldraw)

1. **Warstwy między pakietami czyste i jednokierunkowe, ból wewnątrz**: `Editor.ts` to god-object (11,9 tys. linii, fan-in 46 + fan-out 63, 88 commitów/rok), a `tlschema` ma 105 cykli importów.
2. **Najdroższe zmiany** to schema danych (każdy commit w `tlschema` może oznaczać migrację danych użytkowników na produkcji) i publiczne API SDK — grube barrele `index.ts` (210/139 importów) czynią każdy eksport kontraktem semver.
3. **Najsilniejsze sprzężenie**: `editor` ↔ `tldraw` — 148 wspólnych commitów + 279 importów; zmiana rdzenia niemal zawsze pociąga UI.
4. **Pułapka historii**: najgorętszy katalog roku (`fairy`, 1356 zmian plików) nie istnieje — usunięty w #7809; rankingi aktywności bez weryfikacji istnienia plików kłamią.
5. **Koncentracja wiedzy**: 4 osoby z tldraw Inc. odpowiadają za ~76% zmian rdzenia; kluczowy unknown mapy — brak grafu importów dla workerów Cloudflare i migracji SQL `zero-cache`.

## 3. Analiza ficzera (L3, tldraw)

**Badany przepływ**: persystencja i migracje rekordów `tlschema → store → (IndexedDB / .tldr / sync)` — wybrany, bo mapa wskazuje schemę danych jako strefę ryzyka nr 1 (105 cykli, zmiana record-typu = migracje + dane użytkowników na produkcji).

**Feature overview**: schema powstaje w build-time z 13 typów shape'ów z dwupoziomowymi migracjami (root + props) i globalnym sortem topologicznym. Każdy zapis idzie przez `Store.put` z walidacją (fast-path deltowy dla update'ów); snapshot zapisuje rekordy **razem z serializowaną schemą** do IndexedDB/.tldr/sync. Przy odczycie starych danych obowiązuje niezmiennik architektury: migracja zawsze PRZED walidacją — żadna z 7 ścieżek wejściowych nie woła `put` przed `migrateStoreSnapshot`. W sync migracja jest per-rekord up/down; brakująca migracja `down` to nie błąd typów, tylko rozłączenie starych klientów na produkcji.

**Technical debt (2-3 ryzyka, weryfikacja ast-grep 0.45.1: 17 twierdzeń — 11 potwierdzonych, 6 doprecyzowanych, 0 obalonych):**

- **D1 — barrel rozlewa kontrakt schemy na 3 paczki npm** *(potwierdzone ast-grepem)*: dokładnie 1 wystąpienie `export * from '@tldraw/tlschema'` (`packages/editor/src/index.ts:10`) i 1 `export * from '@tldraw/editor'` (`packages/tldraw/src/index.ts:57`); 151 plików importuje bezpośrednio z tlschema. Każdy publiczny typ schemy to kontrakt semver trzech paczek.
- **D2 — dług siedzi w konsumentach migracji, nie w silniku** *(potwierdzone ast-grepem)*: silnik pokryty wzorowo (CI wymusza test każdej migracji), ale parser `.tldr` (`file.ts`) ma **0 wywołań w testach** przy 6 produkcyjnych konsumentach na 3 platformach (dotcom, vscode, mcp-app); brak też golden-testu `schema.serialize()`.
- **D3 — blast radius zmiany propsa shape'a**: ~7 warstw ręcznych + 2 generowane; 94 commity dotknęły `tlschema` w 12 mies., commit-dowód `b31c2efcb` (flipX/flipY) = 23 pliki; migracje danych miewają ogon bugfixów (brak idempotencji naprawiany osobno).

## 4. Plan refaktoryzacji (L4, tldraw)

**Wybrana opcja: R1 + R2 (guard-first, zero zmian w kodzie produkcyjnym).** Archeologia commitów odrzuciła wszystkich „efektownych" kandydatów strukturalnych — barrel, martwe kody błędów, fast-path bez kopii i `retroactive: true` okazały się świadomymi decyzjami z dowodami w historii (#8258, #8084, #1663, #6036). R1 = charakteryzacja parsera `.tldr` (jedyna niepokryta ścieżka z produkcyjnymi konsumentami; silnik migracji aktywnie zmieniany — #9689). R2 = golden-test `schema.serialize()` (nic nie wykrywa przypadkowego bumpa wersji sekwencji; koszt: godziny).

**Czego świadomie NIE robimy**: nie ruszamy barrel re-exportów (guard już istnieje: lint + api-check), nie usuwamy martwych `MigrationFailureReason` (back-compat publicznego API), nie zmieniamy fast-path ani domyślnego `retroactive: true` (naprawa realnego buga), nie ujednolicamy kontraktu błędów load-paths (K6 — osobna decyzja, dopiero po zbudowaniu siatki z faz 2-3), nie charakteryzujemy `TLLocalSyncClient` ani down-migracji realnych shape'ów (backlog, osobne zmiany).

**Fazy (każda = osobno odwracalny commit):**

1. Golden-test **struktury** serializowanej schemy w `tlschema` — auto: `yarn test run --grep "serialized schema"` zielone na HEAD; ręcznie: przegląd snapshotu vs `createTLSchema.ts`.
2. Fixtures + charakteryzacja happy-path parsera `.tldr` (round-trip, plik ze starą schemą) — auto: `yarn test run --grep "parseTldrawJsonFile"`; ręcznie: otwarcie fixture w aplikacji.
3. Charakteryzacja 5 wariantów błędów `TldrawFileParseError` (asercje wyłącznie na `error.type`, nie na treści komunikatów) — auto: testy; ręcznie: checklista 5/5.
4. Zaostrzenie golden-testu do exact-match wersji sekwencji + notka w README — auto: celowa zmiana wersji → test czerwony (sanity-check); ręcznie: przegląd instrukcji.

## 5. Domena wg DDD (L5, SubTrack)

**Ubiquitous language (z 16 pojęć słownika)**: **Subscription** (cykliczny koszt: kwota+waluta, cykl, kotwica startu), **Normalized cost** (kanoniczny ekwiwalent miesięczny/roczny), **Anchor** (odnowienia zawsze liczone z oryginalnej daty startu; clamp nigdy jej nie nadpisuje), **Duplicate + acknowledgement** (ostrzeżenie o zdublowanej nazwie, które użytkownik może świadomie nadpisać — nigdy nie blokuje), **SubscriptionPortfolio** (zbiór subskrypcji jednego użytkownika). Najważniejsze rozjazdy model-vs-kod (6 znalezionych, 4 pojęcia z adnotacją „BRAK w kodzie"): serwerowe ścieżki zapisu POST/PATCH w ogóle nie znają reguły duplikatów (żyje tylko w fail-openowej wyspie Reacta), a encja `Subscription` i użytkownik to surowe typy Supabase, nie byty domenowe.

**Niezmiennik #1 (N5)**: *żaden zapis add/rename nie dokonuje się bez rozstrzygnięcia kwestii duplikatu* — jedyny niezmiennik z ośmiu, który jest zarazem rdzeniowy (chroni arytmetykę sum — sedno produktu, prd.md:125) i realnie naruszalny (jedyny strażnik = klient, fail-open by design; każdy bezpośredni curl zapisuje duplikat bez śladu). Należy do agregatu **`SubscriptionPortfolio`** — bytu dziś nieobecnego w kodzie; projekt: `portfolio.add/rename` z nazwanym błędem `DuplicateNameUnacknowledged` mapowanym na 409 i jawną flagą `acknowledge_duplicate` (litera PRD zachowana: ostrzeżenie nie blokuje).

**Anti-Corruption Layer**: przecieka **SDK Supabase** (`@supabase/ssr` + `@supabase/supabase-js` + generowane typy `Database`) — zweryfikowany grepem inwentarz: **14 plików produkcyjnych w 6 warstwach** (typy globalne `env.d.ts`, typy domenowe `types.ts`, middleware, 6 routów API, 3 strony SSR, serwis), w tym `App.Locals.user` będący wprost typem SDK i 9× zduplikowana konstrukcja klienta. Docelowy ACL: `src/lib/acl/supabase/` z portami `SubscriptionStore`/`IdentityProvider`; kryterium mechaniczne: grep po `@supabase/|db/database.types` ma zwracać wyłącznie katalog ACL — 12 z 14 plików przestaje znać zależność. Pociecha: SDK nie sięga bundla klienta (0 importów w `src/components/`, pilnowane skanem sekretów w CI).

## 6. Decyzje, które należą do mnie

AI świetnie enumerowało kandydatów i zbierało dowody, ale to ja narzuciłem regułę „guard, nie przebudowa" i utrzymałem ją, gdy agent wskazywał efektowne cele strukturalne — dopiero wymuszona przeze mnie archeologia commitów pokazała, że barrel czy `retroactive: true` to świadome decyzje zespołu, nie śmieci. Sam rozstrzygnąłem wybór R1+R2 zamiast ambitniejszego K6: ujednolicanie publicznego kontraktu błędów bez charakteryzacji to refaktor bez siatki, więc odwróciłem kolejność. Wprowadziłem też zasadę warsztatową „każde zero z ast-grepa potwierdź grepem" — to ona dwukrotnie wykryła, że narzędzie w ogóle nie wystartowało i cicho raportowało fałszywe zera. W SubTracku to moja decyzja, że duplikat pozostaje regułą advisory (409 + jawna flaga, akceptowalne okno TOCTOU) zamiast twardego constraintu w DB, bo PRD wprost dopuszcza dwie legalne subskrypcje o tej samej nazwie. Zaakceptowałem również ryzyko zmiany casingu wire-kontraktu w planie ACL, wskazując fazę przejściową z DTO jako wariant awaryjny.
