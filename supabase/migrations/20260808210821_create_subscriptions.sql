-- F-01 private-subscription-store: full schema surface for public.subscriptions.
-- Enums, table with integrity constraints, updated_at trigger, user_id index,
-- and RLS with granular per-operation policies for the authenticated role.
-- Isolation is enforced by the database, not by application code.

-- 1. Enum types ---------------------------------------------------------------

create type public.subscription_status as enum ('active', 'paused', 'cancelled');

create type public.subscription_billing_cycle as enum ('weekly', 'monthly', 'yearly', 'custom');

-- Exact PRD category labels are the stored values (spaces and '&' included).
create type public.subscription_category as enum (
  'Streaming',
  'Software',
  'Health & Fitness',
  'News & Media',
  'Other'
);

-- 2. Table --------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null constraint subscriptions_name_check check (
    char_length(trim(name)) > 0
    and char_length(name) <= 120
  ),
  amount numeric(12, 2) not null constraint subscriptions_amount_check check (amount > 0),
  currency text not null constraint subscriptions_currency_check check (currency ~ '^[A-Z]{3}$'),
  billing_cycle public.subscription_billing_cycle not null,
  billing_interval_months smallint constraint subscriptions_billing_interval_months_check check (
    billing_interval_months between 1 and 120
  ),
  start_date date not null,
  category public.subscription_category not null,
  status public.subscription_status not null default 'active',
  note text constraint subscriptions_note_check check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- custom cycle requires an interval; non-custom cycles forbid one
  constraint subscriptions_cycle_interval_check check (
    (billing_cycle = 'custom') = (billing_interval_months is not null)
  )
);

-- 3. updated_at trigger -------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

-- 4. Index --------------------------------------------------------------------

-- Supports the RLS predicate and every domain query (all filter by user_id).
create index subscriptions_user_id_idx on public.subscriptions (user_id);

-- 5. Privileges ---------------------------------------------------------------

-- The Supabase postgres image's default privileges do NOT include DML for the
-- API roles, so the grant must be explicit. Only authenticated gets DML; RLS
-- (below) then narrows every operation to the caller's own rows.
-- Deliberately NO grant for anon: unauthenticated access is denied at the
-- privilege layer as well as by the absence of any anon RLS policy.

grant select, insert, update, delete on table public.subscriptions to authenticated;

-- 6. Row Level Security -------------------------------------------------------

alter table public.subscriptions enable row level security;

-- Granular per-operation policies, scoped to the authenticated role only.
-- The (select auth.uid()) subselect form is evaluated once per statement
-- (initplan) instead of per row — Supabase's documented RLS performance guidance.
--
-- Deliberately NO policies for anon: with RLS enabled, absence of a policy is
-- deny-all, which implements FR-003/Access Control at the data layer.
-- Deliberately NO policies for service_role: it bypasses RLS by design and the
-- app never uses it.

create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy subscriptions_insert_own
on public.subscriptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy subscriptions_update_own
on public.subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy subscriptions_delete_own
on public.subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);
