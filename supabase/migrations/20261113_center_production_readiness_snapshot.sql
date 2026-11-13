-- Upgrade existing service-only snapshot with a manufacturing completeness counter.
-- Existing paid orders and production jobs are read-only and remain unchanged.
-- Center Cúpulas operational and production-readiness snapshot.
-- Counts are computed inside Postgres, without transferring customer records to Vercel.
-- Intentionally invoker-rights, and callable by service_role only.
create or replace function public.center_checkout_integrity_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with paid_quotes as (
    select q.id
    from public.quotes q
    where q.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
      and q.status = 'paid'
  ),
  paid_orders as (
    select o.id, o.quote_id
    from public.orders o
    where o.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
      and o.payment_status = 'paid'
  ),
  payments as (
    select p.quote_id, p.reconciliation_status
    from public.center_checkout_payments p
  ),
  pending_email as (
    select e.created_at, e.attempts
    from public.center_order_email_outbox e
    where e.status = 'pending'
  )
  select jsonb_build_object(
    'paid_quotes_without_orders',
      (select count(*) from paid_quotes q
       where not exists (select 1 from paid_orders o where o.quote_id = q.id)),
    'paid_checkout_orders_without_jobs',
      (select count(*) from paid_orders o
       where o.quote_id is not null and not exists (
         select 1 from public.production_jobs j
         where j.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
           and j.order_id = o.id)),
    'applied_payments_without_paid_order',
      (select count(*) from payments p
       where p.reconciliation_status = 'applied'
         and (not exists (select 1 from paid_quotes q where q.id = p.quote_id)
           or not exists (select 1 from paid_orders o where o.quote_id = p.quote_id))),
    'duplicate_approved_charges',
      (select count(*) from payments p where p.reconciliation_status = 'duplicate_charge'),
    'pending_email_notifications',
      (select count(*) from pending_email),
    'stale_email_notifications',
      (select count(*) from pending_email e where e.created_at < now() - interval '24 hours'),
    'pending_emails_never_attempted',
      (select count(*) from pending_email e where e.attempts = 0),
    'active_online_orders_missing_fitting',
      (select count(distinct o.id)
       from paid_orders o
       join public.quotes q on q.id = o.quote_id
       join public.production_jobs j on j.order_id = o.id
       where j.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
         and j.status <> 'completed'
         and exists (
           select 1 from jsonb_array_elements(q.line_items) line
           where coalesce(
             nullif(btrim(line->>'fitting'), ''),
             nullif(btrim(line->>'encaixe'), ''),
             ''
           ) = ''
         ))
  );
$$;

revoke all on function public.center_checkout_integrity_snapshot()
  from public, anon, authenticated;
grant execute on function public.center_checkout_integrity_snapshot()
  to service_role;
comment on function public.center_checkout_integrity_snapshot()
  is 'Read-only Center checkout integrity counters; service_role only.';
