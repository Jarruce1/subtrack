# Kryteria dobrego review — SubTrack (M5L3)

Pięć kryteriów akceptacji pull requesta dla stacku SubTrack (Astro 6 SSR + React 19
islands + Supabase RLS + Cloudflare Workers). Każde kryterium mapuje się 1:1 na pole
structured outputu agenta (`common/review-schema.ts`) i jest oceniane w skali 1–10.

Źródła prawdy: `AGENTS.md` (hard rules), `context/foundation/prd.md` (logika biznesowa),
`context/foundation/test-plan.md` (mapa ryzyk i cookbook testowy).

---

## 1. Poprawność implementacji i arytmetyka domenowa → `implementationCorrectness`

Kod robi to, co deklaruje — na ścieżce głównej, w przypadkach brzegowych i w obsłudze błędów.

- **Arytmetyka dat i kosztów** (top ryzyko produktu — "silently wrong totals"): każda zmiana
  w liczeniu dat odnowień lub normalizacji kosztów obsługuje **koniec miesiąca** (subskrypcja
  startująca 31.) i **lata przestępne** zgodnie z kryteriami akceptacji PRD.
- **Spójność agregacji**: dashboard, widok kategorii i widok odnowień liczą sumy jedną wspólną
  ścieżką (reguła "tylko aktywne"); PR nie może rozjechać tych widoków.
- **Uczciwe kontrakty błędów**: żaden błąd backendu nie jest połykany — nieudany zapis to
  odpowiedź nie-2xx z użytecznym `{ error }` (bez szczegółów backendu), form-posty redirectują
  z krótkim kodem `?error=` (nigdy fałszywy sukces).

**FAIL, gdy:** diff wprowadza arytmetykę dat/kosztów bez obsługi month-end/leap-year, rozjeżdża
agregację między widokami albo połyka błąd (sukces mimo porażki).

## 2. Idiomatyczność i konwencje projektu → `idiomaticity`

Zmiana wygląda jak reszta SubTracka:

- Klasy Tailwind łączone przez `cn()` z `@/lib/utils` — nigdy ręczna konkatenacja stringów.
- **Zero dyrektyw Next.js** (`"use client"` itp.) w komponentach React.
- Astro (`.astro`) dla statyki/layoutu; React tylko tam, gdzie potrzebna interaktywność.
- Alias `@/*`; typy domenowe z `src/types.ts` (nigdy bezpośrednio z wygenerowanego
  `src/db/database.types.ts`); serwisy w `src/lib/`, hooki w `src/components/hooks/`.
- Primitives shadcn/ui dodawane przez CLI (`npx shadcn@latest add`), nie pisane ręcznie.
- Migracje Supabase nazwane `YYYYMMDDHHmmss_short_description.sql`.

## 3. Złożoność względem problemu → `complexity`

Najprostsze rozwiązanie, które działa:

- Bez spekulacyjnych abstrakcji, feature flag i obsługi scenariuszy, które nie mogą wystąpić.
- Reużycie istniejących szwów zamiast duplikacji: jeden client-factory `@/lib/supabase`,
  jedna ścieżka agregacji w `src/lib/billing`, wspólne schematy walidacji.
- Zakres diffa odpowiada zadaniu — bez przemycanych refaktorów i martwego kodu.

## 4. Pokrycie testami proporcjonalne do ryzyka → `testRiskCoverage`

Testy tam, gdzie test-plan lokuje ryzyko — i z właściwą wyrocznią:

- **Nowa/zmieniona arytmetyka** → testy unit (`src/lib/**/*.test.ts`) z oczekiwanymi wartościami
  **wyprowadzonymi ręcznie z PRD** — nigdy skopiowanymi z implementacji pod testem.
- **Nowa tabela lub endpoint** → probe izolacji RLS na dwóch kontach + macierz ACL + parity
  CHECK-ów w testach integracyjnych (`src/tests/integration/`, prawdziwy lokalny Supabase —
  RLS nigdy nie jest mockowane).
- **Nowy flow przeglądarkowy** → e2e wg reguł projektu: lokatory rolowe, żadnych
  `waitForTimeout`, testy niezależne z unikalnymi id.
- Zmiana w obsłudze env/build → przechodzi skan sekretów (`npm run scan:secrets`).

**FAIL, gdy:** diff dotyka ryzykownej ścieżki (arytmetyka, RLS, auth) bez żadnego testu, albo
testy używają implementacji jako wyroczni.

## 5. Bezpieczeństwo: RLS, sekrety, walidacja wejścia → `securitySafety`

Hard rules z AGENTS.md — złamanie którejkolwiek to automatyczny werdykt `fail`:

- **RLS na każdej nowej tabeli** Supabase, z granularnymi politykami per-operacja i per-rola;
  ACL bez przywilejów omijających RLS (lekcja: domyślny grant TRUNCATE dla `authenticated`).
- **Sekrety wyłącznie server-side**: `SUPABASE_URL` / `SUPABASE_KEY` tylko przez
  `astro:env/server` — nigdy importowane do kodu klienckiego, nigdy w logach, error body
  ani bundle'u. Żadnych hardcodowanych kluczy/tokenów w diffie.
- **Zod na każdym API route**: każdy input walidowany server-side (payload abuse: oversized
  note, ujemne kwoty, non-ISO daty, script tagi, sfałszowane pary cycle/interval); dane
  renderowane bezpiecznie (bez obejść domyślnego escapowania).

---

## Reguła werdyktu

- `verdict: "fail"`, gdy złamana jest **którakolwiek hard rule** (RLS, sekrety, zod na API,
  arytmetyka month-end/leap-year) **albo** dowolne kryterium ma ocenę ≤ 4.
- W pozostałych przypadkach `verdict: "pass"`; uwagi niższej wagi trafiają do `summary`
  jako actionable feedback dla autora PR-a.
