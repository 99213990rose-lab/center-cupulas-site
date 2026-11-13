-- Center Cúpulas: technical fitting review is a production-only, immutable
-- operator confirmation. The paid quote, order, payment and prices are untouched.
create table if not exists public.center_production_fitting_reviews (
  job_id uuid primary key references public.production_jobs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  organization_id uuid not null,
  actor_id uuid not null,
  fittings jsonb not null check (jsonb_typeof(fittings) = 'array'),
  recorded_at timestamptz not null default now()
);
alter table public.center_production_fitting_reviews enable row level security;
revoke all on table public.center_production_fitting_reviews from public, anon, authenticated;
grant select, insert on public.center_production_fitting_reviews to service_role;

create or replace function public.center_record_production_fittings_once(
  p_order_code text,
  p_fittings text[],
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_org constant uuid := 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
  v_job public.production_jobs%rowtype;
  v_existing public.center_production_fitting_reviews%rowtype;
  v_items jsonb;
  v_new jsonb := '[]'::jsonb;
  v_item jsonb;
  v_old text;
  v_count integer;
  v_i integer;
begin
  if p_actor_id is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_org and m.user_id = p_actor_id
      and m.role in ('owner', 'admin')
  ) then raise exception 'not_authorized'; end if;

  if p_order_code is null or p_order_code !~ '^[A-Za-z0-9-]{4,85}$'
    or p_fittings is null or coalesce(array_length(p_fittings, 1),0) < 1
    or array_length(p_fittings, 1) > 25 or exists (
      select 1 from unnest(p_fittings) as value(fitting)
      where value.fitting is null or value.fitting not in (
        'nacional','importado','colonial','lira','sem_encaixe'
      )
    )
  then raise exception 'invalid_fitting_input'; end if;

  -- Lock the production record. Paid orders remain immutable.
  select j.* into v_job
  from public.production_jobs j
  join public.orders o on o.id = j.order_id
  where o.organization_id = v_org and j.organization_id = v_org
    and o.code = p_order_code and o.quote_id is not null
    and o.payment_status = 'paid' and j.status <> 'completed'
  order by j.created_at, j.id
  limit 1
  for update of j;

  if v_job.id is null then raise exception 'active_paid_job_not_found'; end if;

  v_items := v_job.specs->'line_items';
  if jsonb_typeof(v_items) <> 'array' then raise exception 'invalid_job_items'; end if;
  v_count := jsonb_array_length(v_items);
  if v_count < 1 or v_count <> array_length(p_fittings,1)
  then raise exception 'fitting_quantity_mismatch'; end if;

  select r.* into v_existing
    from public.center_production_fitting_reviews r
    where r.job_id = v_job.id for update;
  if found then
    if v_existing.fittings = to_jsonb(p_fittings) then
      return jsonb_build_object(
        'ok',true,'reused',true,'order_code',p_order_code,
        'fittings',v_existing.fittings
      );
    end if;
    raise exception 'fittings_already_confirmed';
  end if;

  for v_i in 0..v_count-1 loop
    v_item := v_items->v_i;
    if jsonb_typeof(v_item) <> 'object' then raise exception 'invalid_job_items'; end if;
    v_old := coalesce(nullif(btrim(v_item->>'encaixe'),''),
                      nullif(btrim(v_item->>'fitting'),''));
    if v_old is not null and v_old <> p_fittings[v_i+1]
    then raise exception 'existing_fitting_conflict'; end if;
    v_new := v_new || jsonb_build_array(
      v_item || jsonb_build_object('encaixe',p_fittings[v_i+1])
    );
  end loop;

  update public.production_jobs
  set specs = jsonb_set(
    jsonb_set(v_job.specs, '{line_items}', v_new, true),
    '{technical_fittings_review}',
    jsonb_build_object('confirmed',true,'confirmed_at',now()), true
  ), updated_at = now()
  where id = v_job.id and organization_id = v_org;

  insert into public.center_production_fitting_reviews(
    job_id,order_id,organization_id,actor_id,fittings
  ) values(v_job.id,v_job.order_id,v_org,p_actor_id,to_jsonb(p_fittings));

  return jsonb_build_object(
    'ok',true,'reused',false,'order_code',p_order_code,
    'fittings',to_jsonb(p_fittings)
  );
end;
$fn$;

revoke all on function public.center_record_production_fittings_once(text,text[],uuid)
from public, anon, authenticated;
grant execute on function public.center_record_production_fittings_once(text,text[],uuid)
to service_role;

-- Bounded, read-only exception queue: no addresses, phone numbers, amounts
-- or mutable customer notes are returned.
create or replace function public.center_pending_production_fitting_reviews()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
with pending as (
  select o.code as order_code, j.status as job_status, j.specs as specs, j.created_at
  from public.production_jobs j
  join public.orders o on o.id = j.order_id
  where o.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
    and j.organization_id = o.organization_id
    and o.payment_status = 'paid'
    and o.quote_id is not null
    and j.status <> 'completed'
    and exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(j.specs->'line_items')='array'
          then j.specs->'line_items' else '[]'::jsonb end
      ) line
      where coalesce(nullif(btrim(line->>'encaixe'),''),
                     nullif(btrim(line->>'fitting'),''),'') = ''
    )
  order by j.created_at asc
  limit 40
)
select coalesce(jsonb_agg(jsonb_build_object(
  'order_code',p.order_code,
  'job_status',p.job_status,
  'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'index', x.ordinality-1,
      'format', x.item->>'format',
      'material', x.item->>'material',
      'color', x.item->>'color',
      'dimensions', x.item->'dimensions',
      'quantity', x.item->'quantity',
      'encaixe', coalesce(x.item->>'encaixe',x.item->>'fitting')
    ) order by x.ordinality)
    from jsonb_array_elements(
      case when jsonb_typeof(p.specs->'line_items')='array'
        then p.specs->'line_items' else '[]'::jsonb end
    ) with ordinality as x(item,ordinality)
  ), '[]'::jsonb)
) order by p.created_at),'[]'::jsonb)
from pending p;
$fn$;

revoke all on function public.center_pending_production_fitting_reviews()
from public, anon, authenticated;
grant execute on function public.center_pending_production_fitting_reviews()
to service_role;

-- Count resolved production specifications, not immutable original quotes.
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
       join public.production_jobs j on j.order_id = o.id
       where j.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
         and j.status <> 'completed'
         and exists (
           select 1 from jsonb_array_elements(
             case when jsonb_typeof(j.specs->'line_items') = 'array'
               then j.specs->'line_items' else '[]'::jsonb end
           ) line
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

