-- =====================================================================
-- CuentaClara — esquema de base de datos (Supabase / Postgres)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Cada usuario (tú, tu mamá) solo ve sus propios clientes y datos (RLS).
-- =====================================================================

create extension if not exists pgcrypto;

-- Clientes (negocios a los que se les lleva la contabilidad)
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  business_desc text,
  tax_form      text not null check (tax_form in ('schedule_c','1120s','1065','1120')),
  tax_year      int,
  created_at    timestamptz not null default now()
);

-- Archivos subidos (statements de banco o tarjeta)
create table if not exists public.statements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  file_name    text,
  account_name text,
  txn_count    int not null default 0,
  created_at   timestamptz not null default now()
);

-- Transacciones. amount < 0 = sale dinero, amount > 0 = entra dinero
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id         uuid not null references public.clients(id) on delete cascade,
  statement_id      uuid references public.statements(id) on delete cascade,
  txn_date          date not null,
  description       text not null,
  amount            numeric(14,2) not null,
  category_code     text,
  status            text not null default 'new'
                    check (status in ('new','auto','pending','confirmed')),
  source            text check (source in ('rule','ai','user')),
  confidence        numeric(4,3),
  question          text,
  suggested_pattern text,
  note              text,
  hash              text not null,           -- evita duplicados al subir el mismo statement dos veces
  created_at        timestamptz not null default now(),
  unique (client_id, hash)
);
create index if not exists transactions_client_status_idx on public.transactions (client_id, status);
create index if not exists transactions_client_date_idx   on public.transactions (client_id, txn_date);

-- Reglas aprendidas: "si la descripción contiene X → categoría Y"
create table if not exists public.category_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  pattern       text not null,
  direction     text not null default 'any' check (direction in ('in','out','any')),
  category_code text not null,
  created_at    timestamptz not null default now(),
  unique (client_id, pattern, direction)
);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.clients        enable row level security;
alter table public.statements     enable row level security;
alter table public.transactions   enable row level security;
alter table public.category_rules enable row level security;

drop policy if exists clients_own on public.clients;
create policy clients_own on public.clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists statements_own on public.statements;
create policy statements_own on public.statements
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  );

drop policy if exists transactions_own on public.transactions;
create policy transactions_own on public.transactions
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  );

drop policy if exists rules_own on public.category_rules;
create policy rules_own on public.category_rules
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  );
