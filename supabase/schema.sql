-- WashHub POS — Supabase schema
-- Run in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query → Run).
--
-- This script is IDEMPOTENT: running it again on an existing project is safe
-- and changes nothing that is already correct. (Postgres has no
-- "create policy if not exists", so each policy is dropped and recreated —
-- that is why re-running an earlier version of this file failed with
-- 'policy "own profile" for table "profiles" already exists'.)
--
-- No order data is touched by any statement here.

create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  business text not null default 'My Laundry Shop',
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text,
  addr text,
  type text not null default 'walkin',
  pickup timestamptz,
  items jsonb not null default '[]',
  total numeric not null default 0,
  payment text not null default 'cash',
  time timestamptz not null default now(),
  status text not null default 'washing',
  paid boolean not null default false,
  amount_paid numeric not null default 0,
  paid_method text,
  paid_at timestamptz,
  auto_ready boolean not null default false,
  shop text,
  primary key (user_id, id)
);

create table if not exists pay_settings (
  user_id uuid references auth.users(id) on delete cascade primary key,
  gcash jsonb not null default '{"qr":null,"number":""}',
  maya jsonb not null default '{"qr":null,"number":""}'
);

create table if not exists sms_templates (
  user_id uuid references auth.users(id) on delete cascade primary key,
  paid text not null default '',
  unpaid text not null default ''
);

create table if not exists notifications (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  message text not null,
  type text not null default '',
  time timestamptz not null default now(),
  read boolean not null default false,
  primary key (user_id, id)
);

alter table profiles enable row level security;
alter table orders enable row level security;
alter table pay_settings enable row level security;
alter table sms_templates enable row level security;
alter table notifications enable row level security;

-- Each person can only ever read/write their own rows.
-- Dropped first so this file can be re-run: Postgres has no
-- "create policy if not exists", and re-creating a policy that already exists
-- is an error. Dropping and recreating leaves the same rules in place.
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own orders" on orders;
create policy "own orders" on orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own pay_settings" on pay_settings;
create policy "own pay_settings" on pay_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sms_templates" on sms_templates;
create policy "own sms_templates" on sms_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notifications" on notifications;
create policy "own notifications" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Orders are read back filtered by user_id and sorted by time on every load.
create index if not exists orders_user_time_idx on orders (user_id, time desc);
create index if not exists notifications_user_time_idx on notifications (user_id, time desc);

-- ══════════════════════════════════════════════════════════════════
-- REALTIME (required for cross-device sync)
--
-- Without this, a till only ever shows the orders it fetched when it
-- loaded: an order taken on the phone will not appear on the counter
-- PC until that page is refreshed. Adding the orders table to the
-- realtime publication lets every signed-in device update live.
--
-- (Row Level Security still applies, so each device only ever receives
-- its own account's rows.)
-- ══════════════════════════════════════════════════════════════════
do $$
begin
  alter publication supabase_realtime add table orders;
  raise notice 'Realtime enabled for the orders table.';
exception
  when duplicate_object then
    raise notice 'Realtime was already enabled for the orders table — nothing to do.';
  when undefined_object then
    raise notice 'No supabase_realtime publication found; skipped. The app falls back to polling.';
  when insufficient_privilege then
    raise notice 'Not permitted to alter the publication from here. Enable it in Dashboard → Database → Replication instead. The app falls back to polling until then.';
end $$;

-- Realtime only sends the full changed row (needed for the filter on
-- user_id) when the table's replica identity includes it.
alter table orders replica identity full;

-- ══════════════════════════════════════════════════════════════════
-- MIGRATIONS for projects created before these columns existed.
--
-- "create table if not exists" above does nothing when the table is
-- already there, so it can never add a missing column. These run
-- explicitly. All are no-ops on an up-to-date database, and none of
-- them touch existing order data.
-- ══════════════════════════════════════════════════════════════════
alter table orders add column if not exists amount_paid numeric not null default 0;
alter table orders add column if not exists paid_method text;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists auto_ready boolean not null default false;
alter table orders add column if not exists shop text;

-- Backfill only: orders already marked fully paid, but recorded before the
-- partial-payment column existed, would otherwise report ₱0 collected and
-- show up as owing their full total on the Unpaid screen.
update orders set amount_paid = total where paid = true and amount_paid = 0;
