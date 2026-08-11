---
title: "SubTrack — destylacja domeny (ubiquitous language, subdomeny, rozjazdy model-vs-kod)"
created: 2026-08-11
type: domain-distillation
---

# Destylacja domeny SubTrack

## KROK 0 — Kontekst projektu

Źródła: `context/foundation/prd.md` (PRD, status accepted), `context/foundation/tech-stack.md`, `AGENTS.md`, `context/foundation/test-plan.md`. Stack: Astro 6 SSR + React 19 islands + Supabase (auth + Postgres/RLS) + Cloudflare Workers.

Warstwy, w których żyje logika:

| Warstwa | Lokalizacja |
|---|---|
| Domena (czyste funkcje) | `src/lib/billing.ts`, `src/lib/duplicates.ts`, `src/lib/lifecycle.ts` |
| Walidacja (wspólna klient/serwer) | `src/lib/validation/subscriptions.ts` |
| Serwis / persystencja | `src/lib/services/subscriptions.ts`, `src/lib/supabase.ts`, `supabase/migrations/` |
| API | `src/pages/api/subscriptions/*`, `src/pages/api/auth/*` |
| UI (SSR + wyspy) | `src/pages/*.astro`, `src/components/subscriptions/*.tsx` |
| Typy | `src/types.ts` (aliasy nad generowanym `src/db/database.types.ts`) |

Teza PRD o rdzeniu produktu: „the value is not the list — it is the arithmetic" (prd.md:24) oraz guardrail „totals and renewal dates must never be silently wrong" (prd.md:43).

## KROK 1 — Ubiquitous Language

| Pojęcie | Definicja | Źródło (cytat) | Gdzie w kodzie |
|---|---|---|---|
| **Subscription** (subskrypcja) | Cykliczny koszt użytkownika: nazwa, kwota+waluta, cykl, data startu, kategoria, status, notatka | prd.md:101 (FR-004) | `src/types.ts:6` — ale jako alias wiersza DB (patrz rozjazd R5) |
| **Billing cycle** (cykl rozliczeniowy) | weekly / monthly / yearly / custom every N months | prd.md:101 | enum DB `subscription_billing_cycle` (migracja `20260808210821_create_subscriptions.sql:10`), `src/lib/validation/subscriptions.ts:12` |
| **Custom interval** (interwał N miesięcy) | Cykl „co N miesięcy"; para cykl⇔interwał jest niepodzielna | prd.md:101; BL §1 (prd.md:144) | pair-CHECK w migracji `:43-45`, transform `validation/subscriptions.ts:89-106`, guard `billing.ts:176-182` |
| **Normalized cost / monthly & yearly equivalent** | Kwota przeliczona na kanoniczny koszt miesięczny i roczny (52/12 dla weekly itd.) | BL §1 (prd.md:144) | `normalizeCost` `src/lib/billing.ts:28-41`, typ `NormalizedCost` `src/types.ts:21` |
| **Next renewal date** (najbliższe odnowienie) | Najwcześniejsze wystąpienie cyklu ≥ dziś, wyliczone z kotwicy | BL §2 (prd.md:145) | `nextRenewalDate` `src/lib/billing.ts:52-85` |
| **Anchor** (kotwica odnowień) | Oryginalna data startu, z której zawsze wyprowadza się wystąpienia; clamp nigdy nie nadpisuje kotwicy | US-02 AC (prd.md:66): „always computed from the original start date (anchor)" | tylko wewnętrznie: `occurrenceAtMonths` `billing.ts:227-232` + komentarze; **BRAK w kodzie** jako nazwany, eksportowany byt |
| **Clamping** (przycięcie do końca miesiąca / 29 lutego) | Dzień > długość miesiąca → ostatni dzień miesiąca; Feb 29 → Feb 28 w latach nieprzestępnych | prd.md:62-65 (US-02) | `billing.ts:231` (`Math.min(anchor.day, daysInMonth…)`) |
| **Aggregation / active-only totals** | Sumy (ogólne i per kategoria) wyłącznie aktywnych subskrypcji, per waluta, nigdy nie łączone/konwertowane | BL §3 (prd.md:146) | `summarizeActive` `billing.ts:88-108`, `summarizeByCategory` `billing.ts:120-137` |
| **Upcoming renewals** (nadchodzące odnowienia) | Aktywne subskrypcje z odnowieniem w oknie [dziś, dziś+30], najbliższe najpierw | BL §4 (prd.md:147) | `upcomingRenewals` `billing.ts:148-166`, `UPCOMING_WINDOW_DAYS` `billing.ts:25` |
| **Status / lifecycle** (active, paused, cancelled) | Paused/cancelled poza sumami i odnowieniami, ale widoczne na liście | prd.md:82-86 (US-04), FR-008 (prd.md:109) | enum DB (migracja `:8`), filtr `billing.ts:91,152`, akcje UI `src/lib/lifecycle.ts:22-32` |
| **Duplicate** (duplikat nazwy) | Zgodność znormalizowanej nazwy (trim, lowercase, zwinięte białe znaki); ostrzeżenie nigdy nie blokuje zapisu | US-03 (prd.md:69-77), BL §5 (prd.md:148) | `normalizeName`/`findDuplicateName` `src/lib/duplicates.ts:22-49`, endpoint `src/pages/api/subscriptions/duplicate-check.ts:29-58` |
| **Duplicate acknowledgement** („Save anyway") | Świadome nadpisanie ostrzeżenia przez użytkownika | prd.md:72-77: „can still choose to save it" | tylko stan Reacta: `SubscriptionForm.tsx:70-71` (`acknowledgedNameRef`); **BRAK w kodzie** po stronie serwera/domeny |
| **Category** (kategoria) | Zamknięta lista: Streaming, Software, Health & Fitness, News & Media, Other | prd.md:101, prd.md:168 | enum DB (migracja `:13-19`), `SUBSCRIPTION_CATEGORIES` `validation/subscriptions.ts:13` |
| **User / Account** (konto użytkownika) | Właściciel prywatnego zbioru subskrypcji; pełna izolacja | prd.md:30, prd.md:152 | **BRAK w kodzie** bytu domenowego — `App.Locals.user` to typ SDK: `src/env.d.ts:3` (`import("@supabase/supabase-js").User`) |
| **Portfolio / zbiór subskrypcji użytkownika** | „their subscriptions" — jednostka, względem której liczy się duplikaty i sumy | prd.md:35-36, prd.md:148 („the user's existing subscriptions") | **BRAK w kodzie** — wszędzie luźne `Subscription[]` (np. `dashboard.astro:17`, `services/subscriptions.ts:16`) |
| **Isolation / privacy guardrail** | Dane jednego użytkownika nigdy niewidoczne dla innego | prd.md:42, prd.md:131 | RLS: migracja `:83-117`; testy `src/tests/integration/rls-isolation.test.ts` |

**Bilans „BRAK w kodzie": 4 pojęcia** — Anchor (jako byt), Duplicate acknowledgement (po stronie serwera), domenowy User, Portfolio subskrypcji.

## KROK 2 — Klasyfikacja subdomen

| Obszar / pojęcia | Kategoria | Uzasadnienie (odwołanie do PRD) |
|---|---|---|
| Arytmetyka rozliczeń: normalizacja, kotwica+clamp, agregacja active-only, okno 30 dni (`billing.ts`) | **Core** | „the value is not the list — it is the arithmetic" (prd.md:24); guardrail poprawności (prd.md:43); success criteria (prd.md:35-36) |
| Wykrywanie duplikatów (`duplicates.ts`) | **Core** (strażnik rdzenia) | FR-014: „double-tracked costs directly corrupt the totals the product exists to get right" (prd.md:125) — chroni poprawność sum |
| CRUD subskrypcji, lifecycle statusów, formularz, formatowanie (`services/`, `lifecycle.ts`, `format.ts`) | **Supporting** | Konieczne, ale nie stanowi przewagi; FR-005–FR-008 to obsługa danych wejściowych rdzenia |
| Auth (e-mail+hasło), izolacja RLS, persystencja | **Generic** | Rozwiązane przez Supabase (tech-stack.md:29-33); płaski model ról (prd.md:152); żadnej własnej logiki poza gate'owaniem |
| UI primitives (shadcn), hosting (Cloudflare) | **Generic** | Wygenerowane / kupione; jawnie wyłączone z testów (test-plan §7) |

## KROK 3 — Kandydaci na agregaty i niezmienniki

| Kandydat | Niezmiennik (cytat) | Status egzekwowania |
|---|---|---|
| **SubscriptionPortfolio** (zbiór subskrypcji jednego użytkownika) | „On add (and on rename), the new name is normalized … a match produces a warning the user may override" (prd.md:148) | **Ignorowany na ścieżce zapisu**: POST `api/subscriptions/index.ts:20-50` i PATCH `api/subscriptions/[id].ts:24-63` nie znają reguły; jedynym strażnikiem jest klient (`SubscriptionForm.tsx:137-149`), i to fail-open (`:98-117`) |
| **Subscription** (pojedyncza) | „(billing_cycle = 'custom') = (billing_interval_months is not null)" (migracja `:43-45`); amount > 0 (prd.md:56) | **Egzekwowany 3-warstwowo i spójnie**: zod (`validation/subscriptions.ts:89-106,135-164`), DB CHECK, guard `billing.ts:176` |
| **RenewalSchedule** (harmonogram odnowień) | „Occurrences are always computed from the original start date (anchor), never from a previously clamped date" (prd.md:66) | **Egzekwowany**: jedna czysta funkcja `billing.ts:52-85` + testy jednostkowe i property (`billing.test.ts`, `billing.properties.test.ts`) |
| Izolacja per-user | „one user's data is never visible to another" (prd.md:42) | **Egzekwowany w DB**: RLS migracja `:94-117` + testy integracyjne na realnym Postgresie |

## KROK 4 — Rozjazdy MODEL vs KOD

| # | Dokument mówi | Kod robi | Dowód |
|---|---|---|---|
| R1 | Duplikat sprawdzany „on add (and on rename)" (prd.md:148) | Serwerowe ścieżki zapisu nie wykonują żadnego sprawdzenia; reguła żyje tylko w wyspie klienta + osobnym advisory GET | `api/subscriptions/index.ts:37-49` (brak wywołania `findDuplicateName`), `api/subscriptions/[id].ts:46-62` (jw.), `SubscriptionForm.tsx:137-149` |
| R2 | „a match produces a warning" — ostrzeżenie ma nastąpić (prd.md:148) | Check jest fail-open: timeout 2 s, błąd sieci lub non-200 → zapis bez ostrzeżenia | `SubscriptionForm.tsx:98-117` (komentarz: „Fail-open by contract") |
| R3 | FR-008: zmiana statusu „between active, paused, and cancelled" — bez ograniczeń (prd.md:109) | Trzy różne grafy przejść: UI nie oferuje cancelled→paused (`lifecycle.ts:31`), API dopuszcza wszystko (`validation/subscriptions.ts:128`), PRD dopuszcza wszystko | `src/lib/lifecycle.ts:22-32` vs `validation/subscriptions.ts:119-131` |
| R4 | „sign-out is available from any page" (prd.md:152) | Sign-out jest tylko na dashboardzie i landingu; brak na /subscriptions, /subscriptions/new, /subscriptions/[id]/edit (grep `signout` w tych plikach: 0 trafień) | `dashboard.astro:85-92`, `Topbar.astro` używany tylko w `Welcome.astro:30` |
| R5 | Subscription jako pojęcie domenowe (prd.md:101) | Encja = surowy alias wiersza PostgREST; model anemiczny, wszystkie reguły w funkcjach obok bytu | `src/types.ts:6` (`Database["public"]["Tables"]["subscriptions"]["Row"]`) |
| R6 | Użytkownik/konto jako byt domeny (prd.md:28-30, 152) | Typ SDK `@supabase/supabase-js` jest typem domenowym w całej aplikacji | `src/env.d.ts:3` |

## KROK 5 — Ranking refaktoru

1. **SubscriptionPortfolio / niezmiennik duplikatu (R1+R2)** — rdzeniowy (chroni guardrail poprawności sum, prd.md:125), a egzekwowany wyłącznie przez najłatwiejszy do ominięcia element systemu (klient, fail-open). Największy rozjazd wartość/egzekwowanie → **#1**; szczegóły w `02-invariant-aggregate-refactor.md`.
2. **Granica z SDK Supabase (R5+R6)** — nie łamie reguły biznesowej, ale kształt zależności jest modelem domeny w 5 warstwach → temat ACL, szczegóły w `03-anti-corruption-layer.md`.
3. **Ujednolicenie grafu lifecycle (R3)** — tani porządek językowy (jedno źródło prawdy o przejściach), niskie ryzyko, niska pilność (PRD nie ogranicza przejść).
4. **Sign-out na każdej stronie (R4)** — trywialna niezgodność UI z Access Control; poprawka kosmetyczna.
5. **RenewalSchedule / arytmetyka** — rdzeń wzorowo zabezpieczony (jedno miejsce + testy property); nie ruszać.

---

**Podsumowanie.** Artefakt zawiera słownik 16 pojęć domeny SubTrack z dowodami plik:linia, klasyfikację subdomen (Core = arytmetyka rozliczeń + wykrywanie duplikatów), 4 kandydatów na agregaty z niezmiennikami i 6 rozjazdów model-vs-kod. Kod jest nietypowo dobrze zestrojony z PRD w rdzeniu arytmetycznym — cała matematyka żyje w jednym czystym module z testami property. Cztery pojęcia mają adnotację „BRAK w kodzie": kotwica odnowień jako byt, serwerowe potwierdzenie duplikatu, domenowy użytkownik i portfel subskrypcji. Najważniejszy wniosek: jedyna rdzeniowa reguła bez strażnika po stronie serwera to wykrywanie duplikatów (FR-014) — jej jedynym egzekutorem jest fail-openowa wyspa Reacta, a ścieżki zapisu POST/PATCH są na nią ślepe. To naturalny kandydat #1 na agregat.
