-- MIGRAÇÃO FUTURA, NÃO EXECUTAR até aprovação da estrutura de pagamento.
-- Isolamento dos pagamentos online da Center sem mexer nos pedidos do Métodos Digitais.
-- Executar apenas no projeto Supabase da Center após revisão de segurança.
create table if not exists public.center_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project text not null default 'center-cupulas' check (project = 'center-cupulas'),
  checkout_attempt_id uuid not null unique,
  cart_fingerprint text not null check (length(cart_fingerprint) = 64),
  external_reference text not null unique,
  customer jsonb not null,
  items jsonb not null,
  shipping jsonb not null,
  packaging jsonb not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 50000000),
  currency text not null default 'BRL' check (currency = 'BRL'),
  payment_status text not null default 'checkout_created'
    check (payment_status in ('checkout_created','pending','paid','rejected','cancelled','refunded','charged_back','in_mediation','preference_error')),
  mp_preference_id text unique,
  mp_init_point text,
  mp_payment_id text unique,
  last_payment_status text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists center_checkout_orders_org_created_idx
  on public.center_checkout_orders(organization_id,created_at desc);
create index if not exists center_checkout_orders_payment_idx
  on public.center_checkout_orders(payment_status, created_at desc);

alter table public.center_checkout_orders enable row level security;

-- Sem políticas públicas: todas as operações passam por backend
-- autenticado com chave SECRETA em ambiente servidor. Nunca expor service_role.
revoke all on public.center_checkout_orders from anon, authenticated;
