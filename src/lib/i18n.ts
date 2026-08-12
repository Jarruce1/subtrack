// UI i18n (EN default / PL opt-in). The language lives in the "subtrack-lang"
// cookie so SSR renders the right strings on first paint; the Topbar toggle
// sets the cookie client-side and reloads (see Layout's inline script).
// Data values (category/status enums, currencies) stay English in the store —
// only their DISPLAY labels are translated here.

import type { AstroCookies } from "astro";
import type { BillingCycle, SubscriptionStatus } from "@/types";

export const LANGS = ["en", "pl"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_COOKIE = "subtrack-lang";

export function getLang(cookies: AstroCookies): Lang {
  return cookies.get(LANG_COOKIE)?.value === "pl" ? "pl" : "en";
}

const en = {
  // layout / nav
  skip: "Skip to content",
  "nav.dashboard": "Dashboard",
  "nav.subscriptions": "Subscriptions",
  "nav.signout": "Sign out",
  "nav.signin": "Sign in",
  "nav.signup": "Sign up",
  "nav.theme": "Toggle color theme",
  "nav.lang": "Przełącz na polski",
  "meta.description":
    "Track every subscription in one place: true monthly and yearly totals across mixed billing cycles, plus exact upcoming renewal dates.",

  // landing
  "land.badge": "Subscription cost & renewal tracker",
  "land.title.pre": "Know what your subscriptions",
  "land.title.highlight": "really cost",
  "land.lead":
    "Streaming, SaaS, gym, cloud storage — every cycle normalized to one true monthly and yearly total, with every renewal date computed exactly. No spreadsheet, no surprises.",
  "land.cta.start": "Start tracking — it's free",
  "land.cta.signin": "Sign in",
  "land.cta.dashboard": "Go to dashboard",
  "land.summary.aria": "Example dashboard summary",
  "land.summary.monthly": "Monthly total",
  "land.summary.monthly.sub": "12 active subscriptions",
  "land.summary.yearly": "Yearly total",
  "land.summary.yearly.sub": "across all cycles",
  "land.summary.next": "Next renewal",
  "land.summary.next.sub": "Netflix · PLN 43.00",
  "land.summary.next.value": "Aug 15",
  "land.f1.title": "One true total",
  "land.f1.body":
    "Weekly, monthly, yearly, every-3-months — mixed billing cycles normalized into a single monthly and yearly cost you can trust.",
  "land.f2.title": "Never miss a renewal",
  "land.f2.body":
    "Exact next-renewal dates — month-end and leap-year cases included — plus a 30-day upcoming list so you can cancel before you're charged.",
  "land.f3.title": "Private by design",
  "land.f3.body": "Your account, your data — enforced at the database level. Nobody else ever sees what you pay for.",
  "land.how.title": "How it works",
  "land.how.s1.title": "Add your subscriptions",
  "land.how.s1.body": "Name, price, billing cycle, start date — thirty seconds per entry, any currency.",
  "land.how.s2.title": "See the true cost",
  "land.how.s2.body": "Mixed cycles collapse into one honest monthly and yearly total, per currency and per category.",
  "land.how.s3.title": "Cancel in time",
  "land.how.s3.body": "The 30-day renewal list shows exactly what charges next — cancel before the money leaves.",
  "land.footer.note": "Built with Astro, Supabase and Cloudflare Workers.",

  // dashboard
  "dash.title": "Dashboard",
  "dash.add": "Add subscription",
  "dash.empty.title": "No subscriptions yet",
  "dash.empty.body":
    "Add your first subscription and this dashboard will show its true monthly and yearly cost plus the next renewal date — across all your billing cycles.",
  "dash.empty.cta": "Add your first subscription",
  "dash.totals": "Active totals",
  "dash.totals.none": "No active subscriptions.",
  "dash.categories": "Costs by category",
  "dash.upcoming": "Upcoming renewals",
  "dash.upcoming.window": "next 30 days",
  "dash.upcoming.none": "No renewals in the next 30 days.",
  "dash.subscriptions": "Subscriptions",
  "dash.perMonth": " / month",
  "dash.perYear": " / year",
  "dash.monthly": "Monthly",
  "dash.yearly": "Yearly",
  "dash.nextRenewal": "Next renewal",
  "dash.savings": "Paused savings",
  "dash.savings.hint": "monthly cost of subscriptions you have paused",
  noSupabase: "Supabase is not configured.",

  // subscriptions list
  "subs.title": "Subscriptions",
  "subs.empty.title": "No subscriptions yet",
  "subs.empty.body": "Once you add subscriptions, this is where you manage them — edit any field or delete an entry.",
  "subs.edit": "Edit",
  "subs.filter.legend": "Filter and sort",
  "subs.filter.search": "Search",
  "subs.filter.search.placeholder": "Search by name…",
  "subs.filter.status": "Status",
  "subs.filter.all": "All statuses",
  "subs.filter.sort": "Sort by",
  "subs.sort.name": "Name",
  "subs.sort.monthly": "Monthly cost",
  "subs.filter.apply": "Apply",
  "subs.filter.none": "No subscriptions match these filters.",
  "subs.export": "Export CSV",

  // subscription form pages
  "form.add.title": "Add subscription",
  "form.edit.title": "Edit subscription",
  "form.backDashboard": "← Back to dashboard",
  "form.backSubs": "← Back to subscriptions",
  "notfound.title": "Not found",
  "notfound.body": "This subscription does not exist.",

  // subscription form fields
  "f.name": "Name",
  "f.amount": "Amount",
  "f.currency": "Currency",
  "f.cycle": "Billing cycle",
  "f.cycle.placeholder": "Pick a billing cycle",
  "f.interval": "Every N months",
  "f.startDate": "Start date",
  "f.category": "Category",
  "f.category.placeholder": "Pick a category",
  "f.status": "Status",
  "f.status.placeholder": "Pick a status",
  "f.note": "Note (optional)",
  "f.note.placeholder": "Family plan, shared with…",
  "f.save.pending": "Saving…",
  "f.save.anyway": "Save anyway",
  "f.save.changes": "Save changes",
  "f.save.add": "Add subscription",
  "f.err.gone": "This subscription no longer exists.",
  "f.err.invalid": "Invalid input.",
  "f.err.save": "Something went wrong while saving. Please try again.",
  "f.err.network": "Could not reach the server. Please try again.",
  "f.dup.pre": "You already track a subscription named “",
  "f.dup.post": "”. You can save anyway — duplicates are allowed.",

  // cycles / statuses / categories (display labels)
  "cycle.weekly": "Weekly",
  "cycle.monthly": "Monthly",
  "cycle.yearly": "Yearly",
  "cycle.custom": "Custom (every N months)",
  "status.active": "active",
  "status.paused": "paused",
  "status.cancelled": "cancelled",
  "cat.Streaming": "Streaming",
  "cat.Software": "Software",
  "cat.Health & Fitness": "Health & Fitness",
  "cat.News & Media": "News & Media",
  "cat.Other": "Other",

  // list actions
  "act.pause": "Pause",
  "act.resume": "Resume",
  "act.cancel": "Cancel",
  "act.reactivate": "Reactivate",
  "act.cancelConfirm.pre": 'Cancel "',
  "act.cancelConfirm.post": '"? It stays in your list as cancelled and leaves totals and renewals.',
  "act.err.status": "Could not update status. Please try again.",
  "del.button": "Delete",
  "del.pending": "Deleting…",
  "del.confirm.pre": 'Delete "',
  "del.confirm.post": '"? This cannot be undone.',
  "del.err": "Could not delete. Please try again.",

  // auth
  "auth.signin.title": "Sign in",
  "auth.signin.pending": "Signing in...",
  "auth.signin.noAccount": "Don't have an account?",
  "auth.signup.title": "Sign up",
  "auth.signup.submit": "Create account",
  "auth.signup.pending": "Creating account...",
  "auth.signup.hasAccount": "Already have an account?",
  "auth.email": "Email",
  "auth.email.placeholder": "you@example.com",
  "auth.password": "Password",
  "auth.password.placeholder": "Your password",
  "auth.password.min.placeholder": "Min. 6 characters",
  "auth.confirm": "Confirm password",
  "auth.confirm.placeholder": "Re-enter your password",
  "auth.show": "Show password",
  "auth.hide": "Hide password",
  "auth.err.emailRequired": "Email is required",
  "auth.err.emailInvalid": "Enter a valid email address",
  "auth.err.passwordRequired": "Password is required",
  "auth.err.passwordMin": "Password must be at least 6 characters",
  "auth.err.confirmRequired": "Please confirm your password",
  "auth.err.confirmMismatch": "Passwords do not match",
  "auth.confirmed.title": "Registration successful",
  "auth.confirmed.body": "Your account has been created. You can now sign in.",
  "auth.confirmed.link": "Go to sign in",
  "auth.checkEmail.title": "Check your email",
  "auth.checkEmail.body": "We've sent a confirmation link to your email address. Click it to activate your account.",
  "auth.checkEmail.link": "Back to sign in",
} as const;

export type MessageKey = keyof typeof en;

const pl: Record<MessageKey, string> = {
  skip: "Przejdź do treści",
  "nav.dashboard": "Pulpit",
  "nav.subscriptions": "Subskrypcje",
  "nav.signout": "Wyloguj się",
  "nav.signin": "Zaloguj się",
  "nav.signup": "Załóż konto",
  "nav.theme": "Przełącz motyw kolorystyczny",
  "nav.lang": "Switch to English",
  "meta.description":
    "Wszystkie subskrypcje w jednym miejscu: prawdziwe sumy miesięczne i roczne przy różnych cyklach rozliczeń oraz dokładne daty nadchodzących odnowień.",

  "land.badge": "Śledzenie kosztów i odnowień subskrypcji",
  "land.title.pre": "Zobacz, ile naprawdę kosztują",
  "land.title.highlight": "Twoje subskrypcje",
  "land.lead":
    "Streaming, SaaS, siłownia, chmura — każdy cykl znormalizowany do jednej prawdziwej sumy miesięcznej i rocznej, z dokładnie wyliczoną datą każdego odnowienia. Bez arkusza, bez niespodzianek.",
  "land.cta.start": "Zacznij śledzić — za darmo",
  "land.cta.signin": "Zaloguj się",
  "land.cta.dashboard": "Przejdź do pulpitu",
  "land.summary.aria": "Przykładowe podsumowanie pulpitu",
  "land.summary.monthly": "Suma miesięczna",
  "land.summary.monthly.sub": "12 aktywnych subskrypcji",
  "land.summary.yearly": "Suma roczna",
  "land.summary.yearly.sub": "łącznie ze wszystkich cykli",
  "land.summary.next": "Najbliższe odnowienie",
  "land.summary.next.sub": "Netflix · 43,00 zł",
  "land.summary.next.value": "15 sie",
  "land.f1.title": "Jedna prawdziwa suma",
  "land.f1.body":
    "Tygodniowo, miesięcznie, rocznie, co 3 miesiące — mieszane cykle rozliczeń znormalizowane do jednego wiarygodnego kosztu miesięcznego i rocznego.",
  "land.f2.title": "Żadnego przegapionego odnowienia",
  "land.f2.body":
    "Dokładne daty następnych odnowień — z końcem miesiąca i latami przestępnymi włącznie — plus lista na 30 dni do przodu, żeby zdążyć anulować przed obciążeniem.",
  "land.f3.title": "Prywatność w standardzie",
  "land.f3.body":
    "Twoje konto, Twoje dane — wymuszone na poziomie bazy danych. Nikt inny nigdy nie zobaczy, za co płacisz.",
  "land.how.title": "Jak to działa",
  "land.how.s1.title": "Dodaj swoje subskrypcje",
  "land.how.s1.body": "Nazwa, cena, cykl rozliczeń, data startu — trzydzieści sekund na wpis, dowolna waluta.",
  "land.how.s2.title": "Zobacz prawdziwy koszt",
  "land.how.s2.body":
    "Mieszane cykle zwijają się do jednej uczciwej sumy miesięcznej i rocznej — per waluta i kategoria.",
  "land.how.s3.title": "Anuluj na czas",
  "land.how.s3.body": "Lista odnowień na 30 dni pokazuje, co obciąży Cię następne — anuluj zanim pieniądze wyjdą.",
  "land.footer.note": "Zbudowane na Astro, Supabase i Cloudflare Workers.",

  "dash.title": "Pulpit",
  "dash.add": "Dodaj subskrypcję",
  "dash.empty.title": "Brak subskrypcji",
  "dash.empty.body":
    "Dodaj pierwszą subskrypcję, a pulpit pokaże jej prawdziwy koszt miesięczny i roczny oraz datę następnego odnowienia — dla wszystkich cykli rozliczeń.",
  "dash.empty.cta": "Dodaj pierwszą subskrypcję",
  "dash.totals": "Sumy aktywnych",
  "dash.totals.none": "Brak aktywnych subskrypcji.",
  "dash.categories": "Koszty wg kategorii",
  "dash.upcoming": "Nadchodzące odnowienia",
  "dash.upcoming.window": "najbliższe 30 dni",
  "dash.upcoming.none": "Brak odnowień w ciągu najbliższych 30 dni.",
  "dash.subscriptions": "Subskrypcje",
  "dash.perMonth": " / mies.",
  "dash.perYear": " / rok",
  "dash.monthly": "Miesięcznie",
  "dash.yearly": "Rocznie",
  "dash.nextRenewal": "Następne odnowienie",
  "dash.savings": "Wstrzymane oszczędności",
  "dash.savings.hint": "miesięczny koszt subskrypcji, które wstrzymano",
  noSupabase: "Supabase nie jest skonfigurowane.",

  "subs.title": "Subskrypcje",
  "subs.empty.title": "Brak subskrypcji",
  "subs.empty.body": "Gdy dodasz subskrypcje, tutaj będziesz nimi zarządzać — edytować dowolne pole lub usuwać wpisy.",
  "subs.edit": "Edytuj",
  "subs.filter.legend": "Filtruj i sortuj",
  "subs.filter.search": "Szukaj",
  "subs.filter.search.placeholder": "Szukaj po nazwie…",
  "subs.filter.status": "Status",
  "subs.filter.all": "Wszystkie statusy",
  "subs.filter.sort": "Sortuj wg",
  "subs.sort.name": "Nazwa",
  "subs.sort.monthly": "Koszt miesięczny",
  "subs.filter.apply": "Zastosuj",
  "subs.filter.none": "Żadna subskrypcja nie pasuje do filtrów.",
  "subs.export": "Eksport CSV",

  "form.add.title": "Dodaj subskrypcję",
  "form.edit.title": "Edytuj subskrypcję",
  "form.backDashboard": "← Wróć do pulpitu",
  "form.backSubs": "← Wróć do subskrypcji",
  "notfound.title": "Nie znaleziono",
  "notfound.body": "Taka subskrypcja nie istnieje.",

  "f.name": "Nazwa",
  "f.amount": "Kwota",
  "f.currency": "Waluta",
  "f.cycle": "Cykl rozliczeń",
  "f.cycle.placeholder": "Wybierz cykl rozliczeń",
  "f.interval": "Co N miesięcy",
  "f.startDate": "Data startu",
  "f.category": "Kategoria",
  "f.category.placeholder": "Wybierz kategorię",
  "f.status": "Status",
  "f.status.placeholder": "Wybierz status",
  "f.note": "Notatka (opcjonalna)",
  "f.note.placeholder": "Plan rodzinny, dzielony z…",
  "f.save.pending": "Zapisywanie…",
  "f.save.anyway": "Zapisz mimo to",
  "f.save.changes": "Zapisz zmiany",
  "f.save.add": "Dodaj subskrypcję",
  "f.err.gone": "Ta subskrypcja już nie istnieje.",
  "f.err.invalid": "Nieprawidłowe dane.",
  "f.err.save": "Coś poszło nie tak przy zapisie. Spróbuj ponownie.",
  "f.err.network": "Brak połączenia z serwerem. Spróbuj ponownie.",
  "f.dup.pre": "Śledzisz już subskrypcję o nazwie „",
  "f.dup.post": "”. Możesz mimo to zapisać — duplikaty są dozwolone.",

  "cycle.weekly": "Co tydzień",
  "cycle.monthly": "Co miesiąc",
  "cycle.yearly": "Co rok",
  "cycle.custom": "Własny (co N miesięcy)",
  "status.active": "aktywna",
  "status.paused": "wstrzymana",
  "status.cancelled": "anulowana",
  "cat.Streaming": "Streaming",
  "cat.Software": "Oprogramowanie",
  "cat.Health & Fitness": "Zdrowie i fitness",
  "cat.News & Media": "Prasa i media",
  "cat.Other": "Inne",

  "act.pause": "Wstrzymaj",
  "act.resume": "Wznów",
  "act.cancel": "Anuluj",
  "act.reactivate": "Przywróć",
  "act.cancelConfirm.pre": "Anulować „",
  "act.cancelConfirm.post": "”? Zostanie na liście jako anulowana i zniknie z sum oraz odnowień.",
  "act.err.status": "Nie udało się zmienić statusu. Spróbuj ponownie.",
  "del.button": "Usuń",
  "del.pending": "Usuwanie…",
  "del.confirm.pre": "Usunąć „",
  "del.confirm.post": "”? Tej operacji nie można cofnąć.",
  "del.err": "Nie udało się usunąć. Spróbuj ponownie.",

  "auth.signin.title": "Zaloguj się",
  "auth.signin.pending": "Logowanie...",
  "auth.signin.noAccount": "Nie masz konta?",
  "auth.signup.title": "Załóż konto",
  "auth.signup.submit": "Utwórz konto",
  "auth.signup.pending": "Tworzenie konta...",
  "auth.signup.hasAccount": "Masz już konto?",
  "auth.email": "E-mail",
  "auth.email.placeholder": "ty@example.com",
  "auth.password": "Hasło",
  "auth.password.placeholder": "Twoje hasło",
  "auth.password.min.placeholder": "Min. 6 znaków",
  "auth.confirm": "Potwierdź hasło",
  "auth.confirm.placeholder": "Wpisz hasło ponownie",
  "auth.show": "Pokaż hasło",
  "auth.hide": "Ukryj hasło",
  "auth.err.emailRequired": "E-mail jest wymagany",
  "auth.err.emailInvalid": "Podaj poprawny adres e-mail",
  "auth.err.passwordRequired": "Hasło jest wymagane",
  "auth.err.passwordMin": "Hasło musi mieć co najmniej 6 znaków",
  "auth.err.confirmRequired": "Potwierdź hasło",
  "auth.err.confirmMismatch": "Hasła się nie zgadzają",
  "auth.confirmed.title": "Rejestracja udana",
  "auth.confirmed.body": "Twoje konto zostało utworzone. Możesz się zalogować.",
  "auth.confirmed.link": "Przejdź do logowania",
  "auth.checkEmail.title": "Sprawdź pocztę",
  "auth.checkEmail.body": "Wysłaliśmy link potwierdzający na Twój adres e-mail. Kliknij go, aby aktywować konto.",
  "auth.checkEmail.link": "Wróć do logowania",
};

const messages: Record<Lang, Record<MessageKey, string>> = { en, pl };

/** Translator bound to a language: `const t = translator(lang); t("dash.title")`. */
export function translator(lang: Lang) {
  return (key: MessageKey): string => messages[lang][key];
}

export function statusLabel(lang: Lang, status: SubscriptionStatus): string {
  return translator(lang)(`status.${status}`);
}

export function categoryLabel(lang: Lang, category: string): string {
  const key = `cat.${category}`;
  return key in messages[lang] ? messages[lang][key as MessageKey] : category;
}

/** Localized human cycle phrase for list rows (EN mirrors lib/format.ts). */
export function cyclephrase(lang: Lang, cycle: BillingCycle, intervalMonths: number | null): string {
  const n = String(intervalMonths ?? "?");
  if (lang === "pl") {
    switch (cycle) {
      case "weekly":
        return "co tydzień";
      case "monthly":
        return "co miesiąc";
      case "yearly":
        return "co rok";
      case "custom":
        return `co ${n} mies.`;
    }
  }
  switch (cycle) {
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
    case "custom":
      return `every ${n} months`;
  }
}

/** "today" / "tomorrow" / "in N days" chip label for upcoming renewals. */
export function renewalCountdown(lang: Lang, days: number): string {
  if (lang === "pl") {
    if (days <= 0) return "dzisiaj";
    if (days === 1) return "jutro";
    return `za ${String(days)} dni`;
  }
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${String(days)} days`;
}
