# Matryca pokrycia testami — SubTrack

> Stan na 2026-08-11. Warstwy: U = unit (103), I = integration na realnym
> lokalnym Supabase (40), E = e2e Playwright (8), X = eksploracyjne
> (skrypt `scripts/explore.mjs`, sesyjne przeklikanie), S = smoke prod.
> Ryzyka: numeracja z test-plan §2.

| # | Obszar / scenariusz | Ryzyko | U | I | E | X | S |
|---|---------------------|--------|---|---|---|---|---|
| 1 | Arytmetyka: normalizacja cykli (weekly/monthly/yearly/custom) | #1 | ✅ | — | ✅ | ✅ | — |
| 2 | Arytmetyka: month-end (start 31.) i leap-year | #1 | ✅ | — | — | ✅ | — |
| 3 | Spójność sum między widokami (dashboard/kategorie/odnowienia) | #1 | — | — | ✅ | — | — |
| 4 | Agregacja tylko-active (pause wyklucza z sum) | #1 | ✅ | — | ✅ | ✅ | — |
| 5 | Izolacja RLS dwóch kont + anon + forged user_id | #2 | — | ✅ | — | — | — |
| 6 | Macierz ACL tabel (TRUNCATE itd.) | #2 | — | ✅ | — | — | — |
| 7 | Kontrakty błędów API (induced failures, 401/404/400) | #3 | — | ✅ | — | — | — |
| 8 | North-star: signup → add → dashboard (ręczne oracles) | #4 | — | — | ✅ | ✅ | — |
| 9 | Gating: nieuwierzytelniony → redirect signin | #4 | — | — | ✅ | ✅ | ✅ |
| 10 | Pełny lifecycle: create→edit→pause→resume→cancel→reactivate→delete | #4 | — | — | ✅ | ✅ | — |
| 11 | Walidacja klienta (ujemna kwota, brak pól) | #5 | ✅ | — | ✅ | ✅ | — |
| 12 | Walidacja serwera / parity zod + CHECK (abuse payloads) | #5 | ✅ | ✅ | — | — | — |
| 13 | Ostrzeżenie o duplikacie + „Save anyway" (FR-014) | #5 | ✅ | — | — | ✅ | — |
| 14 | Sekrety poza bundlem klienta (scan) | #6 | — | — | — | — | ✅* |
| 15 | Smoke prod: /, gating, API 401 | #7 | — | — | — | — | ✅ |
| 16 | Auth: zły login → komunikat błędu | #4 | — | — | — | ✅ | — |
| 17 | Signup: walidacja e-mail/hasła, potwierdzenie | #4 | — | — | ✅† | ✅ | — |
| 18 | Sign out kończy sesję | #3 | — | ✅ | — | ✅ | — |
| 19 | Edit nieistniejącego/cudzego id → 404 Not found | #2 | — | ✅ | — | ✅ | — |
| 20 | i18n: przełącznik PL/EN, trwałość cookie, render SSR | — | — | — | ✅ | ✅ | — |
| 21 | Motyw light/dark: przełącznik, trwałość, render widoków | — | — | — | — | ✅ | — |
| 22 | A11y: skip-link, focus ring, aria-invalid | — | — | — | ✅‡ | ✅ | — |
| 23 | RWD: mobile 375px bez poziomego scrolla | — | — | — | — | ✅ | — |
| 24 | Empty states (dashboard, lista) | — | — | — | ✅ | ✅ | — |
| 25 | Lista: szukajka/filtr statusu/sortowanie (SSR, query params) | — | — | — | ✅ | — | — |
| 26 | Eksport CSV (auth, nagłówki, zawartość) | #2 | — | — | ✅ | — | — |
| 27 | Karta „wstrzymane oszczędności" (summarizePaused) | #1 | ✅ | — | ✅ | — | — |
| 28 | Chipy pilności odnowień (daysUntil) | #1 | ✅ | — | — | ✅ | — |

\* scan `dist/client` w CI (`scan:secrets:dist`) + break-gate.
† `auth.setup.ts` przechodzi realny signup przez UI.
‡ `aria-invalid` w teście walidacji; skip-link/focus w eksploracji.

Świadomie NIE testujemy (test-plan §7): primitives shadcn, pixel snapshots,
load/perf, wnętrza Supabase Auth, progi coverage.
