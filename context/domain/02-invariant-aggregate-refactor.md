---
title: "SubTrack — niezmiennik #1 (wykrywanie duplikatów FR-014) i agregat SubscriptionPortfolio"
created: 2026-08-11
type: refactor-plan
---

# Plan refaktoru: niezmiennik → agregat-strażnik

> Dokument analityczny — żadnych zmian w kodzie produkcyjnym. Wejście: `01-domain-distillation.md`.

## KROK 0 — Kontekst

Stack i warstwy: patrz `01-domain-distillation.md` (KROK 0). Kluczowe deklaracje PRD: guardrail „totals and renewal dates must never be silently wrong" (prd.md:43), Business Logic §1–§5 (prd.md:144-148).

## KROK 1 — Zidentyfikowane niezmienniki

| ID | Niezmiennik | Źródło | Gdzie żyje w kodzie |
|---|---|---|---|
| N1 | Normalizacja kosztów wg formuł §1 (weekly ×52/12 itd.) | prd.md:144 | `src/lib/billing.ts:28-41` |
| N2 | Odnowienia zawsze z kotwicy, clamp nie nadpisuje kotwicy | prd.md:66, 145 | `src/lib/billing.ts:52-85,227-232` |
| N3 | Sumy liczą wyłącznie subskrypcje `active`, per waluta, nigdy nie konwertowane | prd.md:146 | `src/lib/billing.ts:88-137` |
| N4 | Okno nadchodzących odnowień = [dziś, dziś+30], sortowane rosnąco | prd.md:147 | `src/lib/billing.ts:148-166` |
| N5 | **Przy każdym add i rename znormalizowana nazwa jest porównana z istniejącymi; trafienie generuje ostrzeżenie, które użytkownik może świadomie nadpisać; ostrzeżenie nigdy nie blokuje zapisu** | prd.md:148 (BL §5), prd.md:69-77 (US-03), prd.md:124-125 (FR-014) | `src/lib/duplicates.ts:22-49` (czysta reguła), `api/subscriptions/duplicate-check.ts:29-58` (advisory GET), `SubscriptionForm.tsx:98-149` (jedyne wywołanie na ścieżce zapisu) |
| N6 | Dane jednego użytkownika niewidoczne dla innych | prd.md:42,131 | RLS: migracja `20260808210821_create_subscriptions.sql:83-117` |
| N7 | `billing_cycle='custom'` ⇔ `billing_interval_months` obecny | migracja `:43-45` | zod `validation/subscriptions.ts:89-106,135-164` + DB CHECK + `billing.ts:176-182` |
| N8 | Każdy wyświetlony total spójny ze stanem magazynu w chwili renderu („no stale aggregates") | prd.md:132 | konwencja pełnego przeładowania po mutacji: `StatusActions.tsx:44-56`, `SubscriptionForm.tsx:157-159`; SSR recompute `dashboard.astro:29-43` |

## KROK 2 — Klasyfikacja (trzy osie) i wybór #1

Osie: (a) rdzeniowość dla sensu produktu, (b) rozsmarowanie po warstwach, (c) realne egzekwowanie.

| ID | (a) rdzeniowość | (b) rozsmarowanie | (c) egzekwowanie |
|---|---|---|---|
| N1, N2, N4 | najwyższa („the value is … the arithmetic", prd.md:24) | zerowe — jedna czysta funkcja na regułę w `billing.ts` | **twarde**: unit + property testy (`billing.test.ts`, `billing.properties.test.ts`), oracle z PRD |
| N3 | najwyższa | niskie — `summarizeByCategory` deleguje do `summarizeActive` (`billing.ts:120-137`), więc reguła jest w 1 miejscu; e2e cross-view pilnuje widoków | **twarde** |
| N5 | **wysoka** — FR-014 uzasadnione wprost: „double-tracked costs directly corrupt the totals the product exists to get right" (prd.md:125); pęknięcie = ciche złamanie guardraila prd.md:43 | **wysokie** — reguła czysta w `duplicates.ts`, ale jej *wywołanie* rozczłonkowane: osobny GET endpoint + wyspa Reacta; ścieżki zapisu (`POST index.ts:20-50`, `PATCH [id].ts:24-63`) reguły w ogóle nie znają | **naruszalne** — jedynym strażnikiem jest klient, i to celowo fail-open (`SubscriptionForm.tsx:98-117`); każdy bezpośredni POST/PATCH (curl, inny klient, przyszła wyspa) zapisuje duplikat bez śladu ostrzeżenia |
| N6 | guardrail | zerowe (DB) | **twarde**: RLS + testy integracyjne na realnym Postgresie |
| N7 | średnia | 3 warstwy, ale **spójnie** (zod + CHECK + guard) | **twarde** |
| N8 | wysoka | średnie — konwencja `window.location.reload()` w każdej wyspie; nic jej nie wymusza | **konwencja** (deklarowany), ale SSR-recompute minimalizuje ryzyko |

**Wybór #1: N5 — wykrywanie duplikatów na ścieżce zapisu.** Jedyny niezmiennik, który jest jednocześnie rdzeniowy (chroni arytmetykę sum — sedno produktu) i realnie naruszalny (klient = jedyny strażnik, fail-open by design, serwer ślepy). N8 jest słabiej egzekwowany formalnie, ale chroni go mechanizm SSR-recompute; N1–N4, N6, N7 są wzorcowo twarde.

Ocena reguły #1 na trzech osiach (wprost):
- **rdzeniowość: wysoka** — bez niej podwójnie wpisany Spotify po cichu zawyża totale, czyli łamie jedyny powód istnienia produktu (prd.md:43,125);
- **rozsmarowanie: 4 pliki / 3 warstwy** — czysta reguła (`duplicates.ts`), advisory endpoint (`duplicate-check.ts`), wyspa (`SubscriptionForm.tsx`), oraz *nieobecność* w POST/PATCH (to też forma rozsmarowania: wiedza o tym, że reguły „nie trzeba" wołać, jest niezapisana);
- **egzekwowanie: naruszalne** — deklarowane w PRD i komentarzach, egzekwowane wyłącznie po stronie klienta z jawnym fail-open.

Uwaga o naturze reguły: N5 to niezmiennik *procesu*, nie stanu — duplikat w bazie jest legalny (US-03: „two legitimate same-name subscriptions are allowed", prd.md:76). Niezmiennikiem jest: **żaden zapis add/rename nie dokonuje się bez rozstrzygnięcia kwestii duplikatu (wykryto → ostrzeżono → użytkownik potwierdził albo nazwa była czysta)**. Dziś serwer nie umie tego zagwarantować.

## KROK 3 — Diagnoza: gdzie reguła żyje dziś

| Warstwa | Stan | Dowód |
|---|---|---|
| Domena (czysta reguła) | OK — `normalizeName` + `findDuplicateName`, przetestowane | `src/lib/duplicates.ts:22-49`, `duplicates.test.ts` |
| API — advisory read | Istnieje, ale jest *opcjonalnym* bocznym torem; nic nie wymusza jego użycia | `src/pages/api/subscriptions/duplicate-check.ts:29-58` |
| API — POST (add) | **Nie egzekwuje**: walidacja zod → `createSubscription` → 201; zero logiki duplikatu | `src/pages/api/subscriptions/index.ts:37-49` |
| API — PATCH (rename) | **Nie egzekwuje**, mimo że PRD wymaga sprawdzenia „on rename" (prd.md:148) | `src/pages/api/subscriptions/[id].ts:46-62` |
| UI (jedyny strażnik) | Wywołuje check przed fetchen zapisu; `acknowledgedNameRef` pamięta potwierdzenie tylko w pamięci komponentu | `SubscriptionForm.tsx:137-149` (gate), `:70-71` (ack), `:385-393` („Save anyway") |
| UI — połknięcie błędu | **Fail-open by contract**: timeout 2 s / non-200 / błąd sieci → `null` → zapis bez ostrzeżenia (komentarz jawnie to deklaruje) | `SubscriptionForm.tsx:92-117` |
| DB | Nic — brak indeksu/triggera na znormalizowanej nazwie (celowo: duplikaty legalne) | migracja `20260808210821_create_subscriptions.sql:23-46` |

Klasyczny obraz z lekcji: reguła „wszędzie i nigdzie" — dokument i głowy ją znają, czysta funkcja istnieje, ale jedyny punkt egzekucji to najłatwiejszy do ominięcia element systemu, z jawnym cichym przełykaniem błędu.

## KROK 4 — Projekt agregatu-strażnika: `SubscriptionPortfolio`

Root agregatu = portfel subskrypcji jednego użytkownika (byt dziś nieobecny — „BRAK w kodzie", patrz 01, KROK 1). Jedyne miejsce egzekwowania N5; przy okazji naturalny dom dla przyszłych reguł portfelowych.

### Byty i błędy domenowe (`src/lib/domain/portfolio.ts` — nowy)

```
// Nazwany wynik domenowy — nie wyjątek "500", tylko zatrzymanie operacji
// z pełną informacją do podjęcia decyzji przez użytkownika.
class DuplicateNameUnacknowledged extends Error {
  readonly match: { id: string; name: string };
}

interface AddDecision  { input: CreateSubscriptionInput; acknowledgeDuplicate: boolean }
interface RenameDecision { id: string; patch: UpdateSubscriptionInput; acknowledgeDuplicate: boolean }

class SubscriptionPortfolio {
  private constructor(private readonly names: readonly NamedEntry[]) {}

  static fromNames(names: readonly NamedEntry[]): SubscriptionPortfolio

  // precondition: brak nierozstrzygniętego duplikatu
  // Zwraca zwalidowany input do persystencji albo rzuca DuplicateNameUnacknowledged.
  add({ input, acknowledgeDuplicate }: AddDecision): CreateSubscriptionInput {
    const match = findDuplicateName(input.name, this.names);          // reuse duplicates.ts
    if (match && !acknowledgeDuplicate) throw new DuplicateNameUnacknowledged(match);
    return input;
  }

  // rename: ta sama precondition, z excludeId = id edytowanego wiersza
  rename({ id, patch, acknowledgeDuplicate }: RenameDecision): UpdateSubscriptionInput {
    if (patch.name === undefined) return patch;                       // nie-rename przechodzi
    const match = findDuplicateName(patch.name, this.names, id);
    if (match && !acknowledgeDuplicate) throw new DuplicateNameUnacknowledged(match);
    return patch;
  }
}
```

Reguła „ostrzeżenie nigdy nie blokuje" jest zachowana: operacja z `acknowledgeDuplicate: true` zawsze przechodzi — agregat wymusza jedynie, żeby rozstrzygnięcie *nastąpiło i było jawne*, po stronie serwera.

### Repozytorium (`src/lib/services/portfolio.ts` — nowy, obok istniejącego serwisu)

```
loadPortfolio(store): Promise<SubscriptionPortfolio>
  // = SubscriptionPortfolio.fromNames(await listSubscriptionNames(store))  — reuse services/subscriptions.ts:25

saveNew(store, input): Promise<Subscription>        // deleguje do createSubscription (:44)
saveRename(store, id, patch): Promise<Subscription | null>  // deleguje do updateSubscription (:56)
```

**Atomowość:** PostgREST nie daje transakcji wielostanowiskowej, więc między `loadPortfolio` a `saveNew` istnieje okno TOCTOU. Dla reguły *advisory* (duplikat legalny) to akceptowalne — przegrana wyścigu daje co najwyżej brakujące ostrzeżenie w skrajnym wyścigu dwóch kart. Jeśli kiedyś reguła stanie się twarda, przejście na funkcję Postgres (`create_subscription_checked(...)` w jednej transakcji) — decyzja zapisywana wtedy w repozytorium, nie w routach.

### Cienkie API (before/after kontraktu)

- `POST /api/subscriptions` (`index.ts:37-49`): body zyskuje opcjonalne `acknowledge_duplicate: boolean` (default false). Flow: zod parse → `loadPortfolio` → `portfolio.add(...)` → persist → 201. `DuplicateNameUnacknowledged` mapuje się na **409** `{ error: "duplicate_name_unacknowledged", match }` — operacja ZATRZYMANA, nie zapisana po cichu (fail-fast), a klient może powtórzyć z flagą.
- `PATCH /api/subscriptions/[id]` (`[id].ts:46-62`): identycznie dla `rename` (PRD wymaga „on rename" — dziś w ogóle nieobsłużone serwerowo).
- `GET duplicate-check` zostaje jako tani pre-check UX (ostrzeżenie zanim user kliknie), ale przestaje być strażnikiem.
- `SubscriptionForm.tsx:137-149`: gate klientowy upraszcza się — zamiast pre-fetch + ref, formularz wysyła zapis, a na 409 pokazuje ostrzeżenie i ponawia z `acknowledge_duplicate: true` po „Save anyway". Fail-open znika, bo strażnik jest na serwerze.

### Before / after (miejsca reguły)

| Miejsce | Before | After |
|---|---|---|
| `SubscriptionForm.tsx:98-117` | fail-open advisory fetch + timeout | brak — obsługa odpowiedzi 409 |
| `SubscriptionForm.tsx:70-71` | `acknowledgedNameRef` w pamięci komponentu | jawna flaga w payloadzie ponowienia |
| `api/subscriptions/index.ts:37-49` | ślepy na duplikaty | jedyny przepływ przez `portfolio.add` |
| `api/subscriptions/[id].ts:46-62` | ślepy na rename-duplikaty | `portfolio.rename` |
| `duplicate-check.ts` | de facto strażnik | opcjonalny UX pre-check |

## KROK 5 — Plan faz i testy

Projekt ma dyscyplinę test-first (test-plan §1, lefthook + CI) — fazy 1–3 idą red→green.

1. **Faza 1 (test-first, unit):** `src/lib/domain/portfolio.test.ts` — przypadki: add czystej nazwy → przechodzi; add duplikatu bez ack → `DuplicateNameUnacknowledged` z poprawnym `match`; add duplikatu z ack → przechodzi; rename na własną niezmienioną nazwę → przechodzi (excludeId); rename na cudzą nazwę bez ack → błąd; patch bez pola `name` → przechodzi; nazwa normalizująca się do pustej → przechodzi (spójnie z `duplicates.ts:40-42`).
2. **Faza 2 (test-first, integration):** rozszerzenie wzorca `error-contracts.test.ts` (§6.4 test-planu) — POST/PATCH z duplikatem bez flagi → 409 z `{ error, match }` i **brak nowego wiersza** (oracle: re-read liczby wierszy); z flagą → 201/200; kontrakt 409 nie wycieka detali DB.
3. **Faza 3:** przepięcie routów + uproszczenie formularza; e2e „duplicate warning" (US-03) na istniejącym wzorcu `seed.spec.ts` — warning widoczny, „Save anyway" zapisuje.
4. **Faza 4:** usunięcie martwego fail-open kodu; wpis do `lessons.md` (klasa błędu: „klient jako jedyny strażnik reguły biznesowej").

**Nowe nazwy load-bearing** (do rejestru kontraktów, jeśli prowadzony): `SubscriptionPortfolio`, `DuplicateNameUnacknowledged`, `acknowledge_duplicate` (pole wire), kod błędu `duplicate_name_unacknowledged`, HTTP 409 na ścieżkach zapisu.

---

**Podsumowanie.** Z ośmiu zidentyfikowanych niezmienników SubTrack siedem jest twardo egzekwowanych (arytmetyka w jednym czystym module z testami property, izolacja w RLS, pair-rule w trzech spójnych warstwach). Wyjątkiem jest N5 — reguła duplikatów z FR-014: rdzeniowa (chroni poprawność sum, sedno produktu), a egzekwowana wyłącznie przez fail-openową wyspę Reacta, podczas gdy serwerowe ścieżki POST/PATCH są na nią całkowicie ślepe, a wymagany przez PRD wariant „on rename" nie istnieje nigdzie poza klientem. Proponowany agregat `SubscriptionPortfolio` przenosi egzekucję na serwer jako jedyne miejsce rozstrzygania duplikatów, z nazwanym błędem domenowym `DuplicateNameUnacknowledged` mapowanym na 409 — fail-fast zamiast cichego zapisu, przy zachowaniu litery PRD, że ostrzeżenie nigdy nie blokuje (jawna flaga `acknowledge_duplicate`). Plan jest czterofazowy, test-first, z przypadkami legalnymi i nielegalnymi oraz oracle'ami niezależnymi od implementacji.
