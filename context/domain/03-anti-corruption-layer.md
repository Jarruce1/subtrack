---
title: "SubTrack — Anti-Corruption Layer dla SDK Supabase"
created: 2026-08-11
type: refactor-plan
---

# Plan refaktoru: ACL na granicy z Supabase

> Dokument analityczny — żadnych zmian w kodzie produkcyjnym.

## KROK 0 — Kontekst

Zależności zewnętrzne (package.json): `@supabase/ssr@^0.10.3`, `@supabase/supabase-js@^2.99.1` (package.json:28-29; CLI `supabase@^2.23.4` jako devDependency, package.json:63) oraz `zod`, React, Astro, Tailwind/shadcn. Deklaracje o separacji w dokumentach:

- AGENTS.md („Structure & conventions"): „app code imports domain types from `src/types.ts`, **never from the generated file**" — jawna intencja odizolowania wygenerowanego kształtu DB;
- `src/types.ts:3-4`: „Domain entity/DTO aliases curated from the generated Database types. Later slices import from here, never from src/db/database.types.ts directly";
- `src/lib/services/subscriptions.ts:4-6`: „All reads/writes of the subscriptions table go through this module — no page or endpoint calls `.from("subscriptions")` directly" — intencja pojedynczego szwu persystencji.

Intencja więc istnieje — i jest częściowo dotrzymana (nikt poza `types.ts` i `lib/supabase.ts` nie importuje wygenerowanego pliku; nikt poza serwisem nie woła `.from("subscriptions")`). Kod nie dotrzymuje jej jednak na poziomie **klienta SDK i jego typów**, które rozłażą się po wszystkich warstwach serwerowych.

## KROK 1 — Identyfikacja przeciekających zależności

Kandydaci: (a) SDK Supabase, (b) zod, (c) shadcn/ui. Zod przecieka celowo i nisko-ryzykownie (wspólny schemat klient/serwer to świadoma decyzja, `validation/subscriptions.ts:4-10`); shadcn jest wyłącznie w warstwie UI. **Jedynym poważnym przeciekiem jest SDK Supabase.**

Inwentarz zweryfikowany grepem (`grep -rnE '@supabase/|@/lib/supabase|db/database.types' src` — kod produkcyjny, bez `src/tests` i `*.test.ts`): **14 plików w 6 rolach/warstwach** zna dziś Supabase:

| Warstwa | Plik:linia | Co przecieka |
|---|---|---|
| Infrastruktura (OK — to przyszły adapter) | `src/lib/supabase.ts:1,4` | import `@supabase/ssr` + generowany `Database` |
| Typy globalne | `src/env.d.ts:3` | `App.Locals.user: import("@supabase/supabase-js").User` — **typ SDK jest typem domenowym użytkownika w całej aplikacji** |
| Typy domenowe | `src/types.ts:1` | `Subscription = Database[...]["Row"]` — kształt PostgREST *jest* encją domeny (alias, nie mapowanie) |
| Middleware | `src/middleware.ts:2,10,15` | `createClient` + `supabase.auth.getUser()` — fluent API SDK |
| API auth (3 pliki) | `api/auth/signin.ts:3,14`, `signup.ts:3,14`, `signout.ts:2,10` | `supabase.auth.signInWithPassword/signUp/signOut` — kontrakt SDK wprost w routach |
| API subscriptions (3 pliki) | `api/subscriptions/index.ts:3,25`, `[id].ts:3,29,70`, `duplicate-check.ts:3,34` | każdy route sam konstruuje klienta SDK (`createClient(headers, cookies)`) i obsługuje jego `null` |
| Strony SSR (3 pliki) | `dashboard.astro:4,13`, `subscriptions/index.astro:5,17`, `subscriptions/[id]/edit.astro:5,15` | jw. — warstwa UI konstruuje klienta persystencji |
| Serwis | `src/lib/services/subscriptions.ts:1,14,17…` | sygnatury przyjmują `TypedSupabaseClient` (typ SDK w porcie!), fluent API `.from().select()…`, wiedza o kodzie PostgREST `PGRST116` (:14) |

Dobra wiadomość (zweryfikowana): **SDK nie przecieka do bundla klienta** — żaden plik w `src/components/` go nie importuje, a `scripts/scan-secrets.mjs` + CI pilnują sekretów w `dist/client/**`. Przeciek jest w całości serwerowy, ale obejmuje wszystkie warstwy serwera.

## KROK 2 — Klasyfikacja i wybór #1

| Oś | Ocena |
|---|---|
| (a) Liczba dotkniętych warstw/plików | 6 warstw, 14 plików produkcyjnych (+ generowany `src/db/database.types.ts`) |
| (b) Ryzyko/koszt wymiany dziś | Wymiana Supabase (np. na własny Postgres+Lucia albo inny BaaS) dotyka middleware, 6 routów API, 3 stron SSR, typów globalnych i serwisu — praktycznie całego serwera. Duplikacja wzorca `createClient → if (!supabase) 500` w 9 miejscach (np. `api/subscriptions/index.ts:25-28`, `[id].ts:29-32,70-73`, `duplicate-check.ts:34-37`, `dashboard.astro:13-17`) |
| (c) Rozjazd intencja-vs-kod | Deklaracje izolacji istnieją (KROK 0) i są dotrzymane dla *wygenerowanego pliku*, ale nie dla *klienta i typów SDK* — klasyczny przeciek „przez alias": `types.ts` re-eksportuje kształt biblioteki pod domenową nazwą |

**Wybór #1: SDK Supabase** (`@supabase/ssr` + `@supabase/supabase-js` + generowane typy `Database`). Jedyna zależność spełniająca wszystkie sygnały przecieku z lekcji: ten sam pakiet w wielu warstwach, typy biblioteki w sygnaturach domenowych (`TypedSupabaseClient` w serwisie, `User` w `App.Locals`), zduplikowana rekonstrukcja obiektu (9× `createClient` + obsługa `null`).

## KROK 3 — Diagnoza (duplikacja i najgroźniejsze przecieki)

1. **Typ SDK jako tożsamość domeny**: `env.d.ts:3` — każdy kod czytający `locals.user` (middleware, wszystkie routy, strony) jest typowo związany z `@supabase/supabase-js`. Wymiana auth = zmiana typu w całej aplikacji.
2. **Encja = wiersz PostgREST**: `types.ts:6-8` — `Subscription`, `SubscriptionInsert`, `SubscriptionUpdate` to aliasy, nie mapowania; snake_case kolumn DB (`billing_interval_months`, `start_date`) jest językiem UI (`SubscriptionForm.tsx:82-88`) i wire-kontraktem API (`api/subscriptions/index.ts:44-45` zwraca surowy wiersz jako JSON). Zmiana schematu DB = zmiana kontraktu API i propsów komponentów.
3. **Duplikacja konstrukcji klienta**: 9 miejsc powtarza `createClient(headers, cookies)` + gałąź `!supabase` (m.in. `middleware.ts:10-19`, `api/subscriptions/index.ts:25-28`, `dashboard.astro:13-17`, `edit.astro:15`). Wiedza „skąd się bierze sesyjny klient" żyje w każdej warstwie.
4. **Wiedza o protokole PostgREST poza adapterem**: kod błędu `PGRST116` interpretowany w serwisie (`services/subscriptions.ts:13-14,63`).
5. **Fluent API auth w routach**: `signin.ts:14`, `signup.ts:14`, `signout.ts:10`, `middleware.ts:15` — kontrakt `{ data, error }` SDK obsługiwany ręcznie w warstwie HTTP.

## KROK 4 — Projekt ACL

Katalog ACL: **`src/lib/acl/supabase/`** — jedyne miejsce, które zna pakiety `@supabase/*`, generowany `Database` i protokół PostgREST.

### Value objects / encje domenowe (jedyne miejsce wiedzy o kształcie zależności)

```
// src/types.ts (po refaktorze: definicje własne, zero importu Database)
interface DomainUser { id: string; email: string | null }        // zamiast supabase-js User
interface Subscription { id, name, amount, currency, billingCycle, intervalMonths,
                         startDate, category, status, note, createdAt, updatedAt }  // camelCase, własność domeny

// src/lib/acl/supabase/mappers.ts — JEDYNE mapowanie kształtów
toDomainSubscription(row: Database[...]["Row"]): Subscription
toRowInsert(input: CreateSubscriptionInput): Database[...]["Insert"]
toDomainUser(user: import("@supabase/supabase-js").User): DomainUser
// + test zgodności mapperów z wygenerowanymi typami (kompilacyjny AssertAssignable,
//   wzorzec już istniejący w validation/subscriptions.ts:113-114)
```

### Wąskie porty (język domeny, zero typów SDK)

```
// src/lib/ports.ts
interface SubscriptionStore {                       // dzisiejszy serwis minus TypedSupabaseClient
  list(): Promise<Subscription[]>
  listNames(): Promise<{ id: string; name: string }[]>
  get(id: string): Promise<Subscription | null>
  create(input: CreateSubscriptionInput): Promise<Subscription>
  update(id: string, patch: UpdateSubscriptionInput): Promise<Subscription | null>
  remove(id: string): Promise<boolean>
}
interface IdentityProvider {
  currentUser(): Promise<DomainUser | null>
  signIn(email, password): Promise<AuthResult>      // AuthResult: ok | nazwany błąd domenowy
  signUp(email, password): Promise<AuthResult>
  signOut(): Promise<AuthResult>
}
// Fabryka per request (zastępuje 9× createClient):
resolveSession(request: Request, cookies: AstroCookies): { store: SubscriptionStore;
  identity: IdentityProvider } | ConfigurationMissing
```

### Adapter

`src/lib/acl/supabase/adapter.ts` implementuje oba porty przez `createServerClient` z `@supabase/ssr`; tam trafiają: obsługa cookies, `PGRST116 → null`, mapowanie `{ data, error }` na wyniki domenowe, mapowanie wierszy przez mappers. Obecny `src/lib/services/subscriptions.ts` jest w ~80% gotowym ciałem adaptera — refaktor to głównie zwężenie sygnatur (usunięcie `TypedSupabaseClient` z portu) i przeniesienie pliku.

## KROK 5 — Dowód izolacji + before/after

Po refaktorze wymiana Supabase dotyka wyłącznie `src/lib/acl/supabase/**` (adapter + mappers + generowane typy). Nie dotyka: tabel pojęciowo (schemat zostaje w migracjach — to własność produktu, nie SDK), wire-kontraktu API (routy mówią typami domeny), UI (strony/wyspy dostają `Subscription` domenowe), middleware (woła `identity.currentUser()`).

| Plik | Before (zna SDK) | After |
|---|---|---|
| `middleware.ts` | `createClient` + `auth.getUser()` | `resolveSession(...).identity.currentUser()` |
| `env.d.ts` | `import("@supabase/supabase-js").User` | `DomainUser` |
| `types.ts` | alias `Database[...]["Row"]` | własne definicje domenowe |
| 3× `api/auth/*` | `supabase.auth.*` + `{ data, error }` | `identity.signIn/signUp/signOut` → mapowanie na `?error=` kody (auth-errors.ts bez zmian) |
| 3× `api/subscriptions/*` | `createClient` + przekazywanie klienta | `resolveSession(...).store.*` |
| 3× strony `.astro` | `createClient` + serwis | `store.list()/get()` |
| `services/subscriptions.ts` | port z typem SDK | staje się adapterem w `acl/supabase/` |

Warstwa UI dostaje gotowe dane domenowe — dziś `dashboard.astro:44-56` składa widok z surowych kolumn wiersza (`subscription.billing_cycle`, `billing_interval_months`); po refaktorze pola są domenowe i camelCase, a kształt DB nie jest wire-kontraktem.

Otwarte pytanie zależne od kontraktu biblioteki: zachowanie `@supabase/ssr` przy odświeżaniu tokenów w cookies (setAll podczas SSR) — rozstrzygnięcie wg dokumentacji `@supabase/ssr` i zakodowanie w adapterze (`acl/supabase/adapter.ts`), nie w middleware ani routach.

## KROK 6 — Weryfikacja (sprawdzalne kryterium) i plan

**Kryterium sukcesu:**

```
grep -rlE '@supabase/|db/database.types' src --include='*.ts' --include='*.tsx' --include='*.astro'
```

- **Dziś** (zweryfikowane, po wyłączeniu `src/tests/` i `*.test.ts`): **14 plików w 6 warstwach** — `env.d.ts`, `types.ts`, `middleware.ts`, `lib/supabase.ts`, `lib/services/subscriptions.ts`, 3× `api/auth/*`, 3× `api/subscriptions/*`, 3× strony `.astro` (pełna lista plik:linia w KROKU 1). Licząc szew pośredni `@/lib/supabase`, dokładnie te same 14 plików.
- **Po refaktorze**: grep zwraca **wyłącznie pliki w `src/lib/acl/supabase/`** (adapter, mappers, wygenerowany `database.types.ts` przeniesiony tamże). Dozwolone wyjątki poza katalogiem: `astro.config.mjs` (schemat zmiennych `SUPABASE_URL`/`SUPABASE_KEY` — konfiguracja, nie kod) oraz `src/tests/integration/**` i `e2e/**` (testy celowo gadają z realnym stackiem — testują adapter i RLS, nie domenę).

Pliki, które dziś znają zależność, a po refaktorze **przestają**: `env.d.ts`, `types.ts`, `middleware.ts`, `signin.ts`, `signup.ts`, `signout.ts`, `api/subscriptions/index.ts`, `[id].ts`, `duplicate-check.ts`, `dashboard.astro`, `subscriptions/index.astro`, `subscriptions/[id]/edit.astro` — 12 z 14.

**Plan faz** (konwencja projektu: `/10x-new` → `/10x-plan` → `/10x-implement`, test-first tam gdzie się da):

1. **Porty i typy domenowe** — zdefiniuj `ports.ts`, `DomainUser`, domenowe `Subscription`; mappers z testem kompilacyjnym zgodności (AssertAssignable). Bez zmian zachowania.
2. **Adapter** — przenieś `lib/supabase.ts` + `services/subscriptions.ts` do `acl/supabase/`, zaimplementuj porty; testy kontraktu błędów przepnij na port (wzorzec `error-contracts.test.ts` §6.4 zostaje ważny — mockowany szew przesuwa się na adapter).
3. **Konsumenci** — middleware, 6 routów, 3 strony na porty; usuń 9× duplikację `createClient`+`null`; `env.d.ts` na `DomainUser`.
4. **Domknięcie** — grep-kryterium jako skrypt (`scripts/check-acl.sh`, wzorem `scan-secrets`) w CI; wpis do `lessons.md`.

Ryzyko: kontrakt wire API zmienia casing pól (snake→camel) — wymaga skoordynowanej zmiany formularza i testów e2e; alternatywnie faza przejściowa zachowuje snake_case w DTO (mapper DTO w ACL) i zmienia tylko typy wewnętrzne.

---

**Podsumowanie.** Najgorszym przeciekiem w SubTrack jest SDK Supabase: zweryfikowany grepem inwentarz pokazuje 14 plików produkcyjnych w 6 warstwach (typy globalne, middleware, 6 routów API, 3 strony SSR, serwis, infra), które znają pakiety `@supabase/*`, klienta lub wygenerowane typy — w tym `App.Locals.user` będący wprost typem SDK i encję `Subscription` będącą aliasem wiersza PostgREST. Dokumenty projektu deklarują izolację („never from the generated file", pojedynczy szew serwisu) i kod dotrzymuje jej dla pliku wygenerowanego, ale nie dla klienta i typów — przeciek „przez alias". Pocieszające: SDK nie sięga bundla klienta (zero importów w `src/components/`, pilnowane skanem sekretów), więc groźny wariant z lekcji nie występuje. Proponowany ACL to katalog `src/lib/acl/supabase/` z dwoma wąskimi portami (`SubscriptionStore`, `IdentityProvider`), domenowymi `DomainUser`/`Subscription` i mapperami jako jedynym miejscem wiedzy o kształcie zależności; istniejący serwis jest już ~80% adaptera. Kryterium sukcesu jest mechaniczne: grep po `@supabase/|db/database.types` ma zwracać wyłącznie katalog ACL (plus testy integracyjne i konfigurację env) — dziś zwraca 14 plików, po refaktorze 12 z nich przestaje znać zależność.
