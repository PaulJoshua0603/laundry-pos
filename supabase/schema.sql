-- WashHub POS — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query → Run).

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
create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own orders" on orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pay_settings" on pay_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sms_templates" on sms_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notifications" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
