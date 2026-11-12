-- Transactional order email outbox. No public reads/writes; only the server's service role can access it.
create table if not exists public.center_order_email_outbox (
  order_id uuid primary key references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'retry', 'sent', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.center_order_email_outbox enable row level security;
revoke all on public.center_order_email_outbox from anon, authenticated;
grant select, insert, update, delete on public.center_order_email_outbox to service_role;
create index if not exists center_order_email_outbox_queue_idx
  on public.center_order_email_outbox (status, created_at);

-- Enqueue only newly paid Center website orders, and only with a checkout email.
-- Existing orders are deliberately NOT backfilled: avoid unexpected late emails.
create schema if not exists private;
create or replace function private.enqueue_center_paid_order_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
     and new.payment_status = 'paid'
     and new.metadata ->> 'source' = 'center_checkout_pro'
     and nullif(btrim(new.shipping ->> 'customer_email'), '') is not null then
    insert into public.center_order_email_outbox (order_id)
    values (new.id)
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_center_paid_order_email() from public, anon, authenticated;
drop trigger if exists center_paid_order_email_enqueue on public.orders;
create trigger center_paid_order_email_enqueue
  after insert or update of payment_status on public.orders
  for each row execute function private.enqueue_center_paid_order_email();
