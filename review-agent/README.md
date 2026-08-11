# review-agent — niezależny agent code review (M5L2/M5L3)

Samodzielna paczka z agentem code review na Claude Agent SDK: czyta diff, ocenia go
w pięciu kryteriach SubTracka (patrz `review-criteria.md`) i zwraca structured output
(zod, `common/review-schema.ts`) z wiążącym werdyktem `pass`/`fail` — na nim stoi
bramka w CI (`.github/workflows/review.yml`).

## Uruchomienie agenta

```sh
cd review-agent
npm ci

git -C .. diff | npx tsx review.ts     # diff ze stdin
npx tsx review.ts data/sample.diff     # diff z pliku (zepsuty przykład)
npx tsx review.ts data/clean.diff      # diff z pliku (czysty przykład)
```

- JSON (`{ review, metrics }`) idzie na **stdout** — do maszynowego użycia w pipeline.
- Ludzkie podsumowanie i metryki (koszt, tury, tokeny) idą na **stderr**.
- Twardy limit kosztu pojedynczego przebiegu: `maxBudgetUsd = 0.5`.

Auth: lokalnie SDK przejmuje credentiale aktywnej sesji Claude Code — nie trzeba
niczego ustawiać. W CI ustaw sekret `ANTHROPIC_API_KEY`.

## Evale promptfoo (porównanie modeli)

`promptfooconfig.yaml` przepuszcza ten sam prompt (`prompts/review.txt`) przez trzy
modele obok siebie (Sonnet 4.6 — obecny model agenta, Sonnet 5, Haiku 4.5) na dwóch
diffach testowych:

- `data/sample.diff` — celowo zepsuty (hardcodowany token, `var`, brak walidacji,
  test happy-path) → asercje wymagają `verdict: "fail"` i wskazania sekretu,
- `data/clean.diff` — idiomatyczny helper + testy z ręcznie wyprowadzonymi
  oracle'ami → asercje wymagają `verdict: "pass"`.

Wymaga **prawdziwego klucza API** w env (promptfoo woła API bezpośrednio — nie
korzysta z sesji Claude Code):

```sh
cd review-agent
export ANTHROPIC_API_KEY=sk-ant-...
npx promptfoo eval        # macierz pass/fail + koszt + czas per model
npx promptfoo view        # wyniki w przeglądarce
```

Zestaw zostaje jako bramka regresji: po każdej zmianie promptu/modelu odpal
`npx promptfoo eval` — jeden nieprzechodzący przypadek = czerwona ewaluacja
(próg poluzujesz przez `PROMPTFOO_PASS_RATE_THRESHOLD=95`).

## Pliki

| Plik | Rola |
| --- | --- |
| `review.ts` | agent: diff → structured review + metryki, bramka kosztowa |
| `common/review-schema.ts` | jedno źródło prawdy: system prompt + schemat zod/JSON |
| `review-criteria.md` | 5 kryteriów akceptacji PR dla stacku SubTrack |
| `prompts/review.txt` | wersja promptu dla promptfoo (trzymaj w synchronizacji z `review-schema.ts`) |
| `promptfooconfig.yaml` | konfiguracja evali (3 modele × 2 diffy + asercje) |
| `data/sample.diff` | zepsuty diff testowy | 
| `data/clean.diff` | czysty diff testowy |
