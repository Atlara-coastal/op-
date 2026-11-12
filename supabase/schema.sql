-- JocoAdmin - Supabase schema
-- Run this once in your project's SQL Editor (Supabase Dashboard > SQL Editor > New query).
--
-- Design: one table per local-storage collection, storing the whole item as
-- JSONB (same shape the app already uses) instead of a bespoke relational
-- schema per entity. This keeps js/db.js's sync layer generic and means the
-- UI components never had to change.
--
-- Access model: this app is single-tenant (one business). Every logged-in
-- user can read/write every row — there is no per-user data isolation by
-- design. If you later need multiple separate businesses sharing one
-- Supabase project, add a `business_id` column and scope the policies below
-- to auth.uid()'s business instead of "any authenticated user".

create table if not exists public.products (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.clients (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.sales (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.payments (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.quotes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Row Level Security: any authenticated user (i.e. anyone who logged in
-- through the app's username/password screen) can read and write. Nobody
-- unauthenticated (anon role) can touch these tables at all.
alter table public.products enable row level security;
alter table public.clients  enable row level security;
alter table public.sales    enable row level security;
alter table public.payments enable row level security;
alter table public.quotes   enable row level security;

-- No policies are created here on purpose: with RLS enabled and no policy the
-- tables deny everything, so a fresh project stays closed until the migrations
-- run. The real per-permission and per-tenant policies live in
-- supabase/migrations/0004_roles.sql and 0006_tenants.sql. Never re-add an
-- `using (true)` policy here.

-- Realtime: broadcast changes so every open device/tab updates live.
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.quotes;
