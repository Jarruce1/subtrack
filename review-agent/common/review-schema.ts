import { z } from "zod";

/**
 * Wspólny kontrakt agenta code review — jedno źródło prawdy dla promptu
 * systemowego i schematu wyjścia (M5L2, 10xDevs).
 */

export const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request
w projekcie SubTrack: Astro 6 SSR + React 19 islands + Tailwind 4 + Supabase (auth + RLS) + Cloudflare Workers.

Oceń podany diff w pięciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo).
Każda ocena MUSI być liczbą całkowitą od 1 do 10. Pełna wersja kryteriów: review-agent/review-criteria.md.

1. Poprawność implementacji i arytmetyka domenowa: kod robi to, co deklaruje; każda arytmetyka dat
   odnowień / normalizacji kosztów obsługuje koniec miesiąca (start 31.) i lata przestępne — cicho
   błędne sumy to top ryzyko produktu; agregacje (dashboard/kategorie/odnowienia) liczone jedną wspólną
   ścieżką; żaden błąd backendu nie jest połykany (nie-2xx z użytecznym { error }, redirecty z kodem ?error=).
2. Idiomatyczność: konwencje projektu — klasy Tailwind przez cn() z @/lib/utils (nigdy konkatenacja);
   zero dyrektyw Next.js ("use client" itp.); Astro dla statyki, React tylko dla interaktywności;
   typy domenowe z src/types.ts; shadcn/ui przez CLI; migracje YYYYMMDDHHmmss_opis.sql.
3. Złożoność: najprostsze rozwiązanie względem problemu; bez spekulacyjnych abstrakcji; reużycie
   istniejących szwów (@/lib/supabase, wspólna ścieżka agregacji) zamiast duplikacji.
4. Pokrycie testami względem ryzyka: nowa arytmetyka -> testy unit z wartościami wyprowadzonymi ręcznie
   z PRD (nigdy z implementacji); nowa tabela/endpoint -> probe izolacji RLS + ACL w testach
   integracyjnych na prawdziwej bazie; nowy flow -> e2e (lokatory rolowe, bez waitForTimeout).
5. Bezpieczeństwo (hard rules — złamanie = automatyczny fail): każda nowa tabela Supabase ma RLS
   z granularnymi politykami per-operacja/per-rola; SUPABASE_URL/SUPABASE_KEY tylko przez
   astro:env/server — nigdy w kodzie klienckim, logach ani bundle'u; żadnych hardcodowanych sekretów
   w diffie; zod waliduje każdy input na API routes.

Werdykt jest wiążący: fail, gdy złamana którakolwiek hard rule albo dowolne kryterium ma ocenę <= 4;
w przeciwnym razie pass. Dołącz krótkie podsumowanie (2-3 zdania) w Markdown, na podstawie którego
autor PR-a będzie mógł działać.`;

// Score'y trzymamy jako zwykłe z.number(): structured output Anthropica odrzuca
// minimum/maximum na typie integer, więc zakres 1-10 wymuszamy opisem pola
// i promptem, a nie samym schematem.
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe(
      "Poprawność implementacji: czy kod robi to, co deklaruje (skala 1-10). " +
        "1: logika błędna lub po cichu psuje istniejące zachowania. " +
        "10: poprawny na ścieżce głównej, w przypadkach brzegowych i w obsłudze błędów.",
    ),
  idiomaticity: z.number().describe("Idiomatyczność: zgodność z konwencjami języka i projektu (skala 1-10)"),
  complexity: z.number().describe("Złożoność: prostota rozwiązania względem problemu (skala 1-10)"),
  testRiskCoverage: z.number().describe("Pokrycie testami proporcjonalne do ryzyka zmienianych ścieżek (skala 1-10)"),
  securitySafety: z.number().describe("Bezpieczeństwo: brak podatności i wycieków sekretów (skala 1-10)"),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

// target: draft-07 zapewnia zgodność między zodem a Claude Agent SDK
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: "draft-07" });

export type Review = z.infer<typeof REVIEW_SCHEMA>;
