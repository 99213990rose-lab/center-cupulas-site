-- Private, auditable shipment tracking registration for paid Center website orders.
-- No financial, price, product or manufacturing fields are changed.
create table if not exists public.center_fulfillment_tracking_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  actor_id uuid not null,
  tracking_codes jsonb not null check (jsonb_typeof(tracking_codes) = 'array'),
  recorded_at timestamptz not null default now()
);
alter table public.center_fulfillment_tracking_events enable row level security;
revoke all on public.center_fulfillment_tracking_events from public, anon, authenticated;
grant select, insert on public.center_fulfillment_tracking_events to service_role;

create or replace function public.center_record_order_tracking_once(
  p_order_code text,
  p_tracking_codes text[],
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_org constant uuid := 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b';
  v_order public.orders%rowtype;
  v_first text;
  v_existing text;
  v_new jsonb;
begin
  if p_actor_id is null or
     not exists (
       select 1 from public.organization_members m
       where m.organization_id = v_org and m.user_id = p_actor_id
         and m.role in ('owner', 'admin')
     )
  then raise exception 'not_authorized'; end if;

  if p_order_code is null or length(p_order_code) < 4 or length(p_order_code) > 85 or
     p_tracking_codes is null or array_length(p_tracking_codes,1) is null or
     array_length(p_tracking_codes,1) > 8 or
     exists (
       select 1 from unnest(p_tracking_codes) as c(code)
       where c.code is null or c.code !~ '^[A-Za-z0-9._/-]{5,80}$'
     ) or
     (select count(distinct c.code) from unnest(p_tracking_codes) c(code)) <>
       array_length(p_tracking_codes,1)
  then raise exception 'invalid_tracking_input'; end if;

  select o.* into v_order from public.orders o
    where o.organization_id = v_org and o.code = p_order_code
      and o.quote_id is not null and o.payment_status = 'paid'
    for update;
  if not found then raise exception 'paid_order_not_found'; end if;

  v_first := p_tracking_codes[1];
  v_new := to_jsonb(p_tracking_codes);
  v_existing := nullif(v_order.shipping->>'tracking_code','');
  if v_existing is not null then
    if v_existing = v_first and
       (v_order.shipping->'tracking_codes' is null or
        v_order.shipping->'tracking_codes' = v_new)
    then
      return jsonb_build_object('ok',true,'reused',true,'order_code',v_order.code,
        'tracking_codes',coalesce(v_order.shipping->'tracking_codes',v_new));
    end if;
    raise exception 'tracking_already_registered';
  end if;

  update public.orders set
    shipping = coalesce(v_order.shipping,'{}'::jsonb) || jsonb_build_object(
      'tracking_code',v_first,
      'tracking_codes',v_new,
      'tracking_registered_at',now()
    )
  where id = v_order.id and organization_id = v_org;

  insert into public.center_fulfillment_tracking_events (
    organization_id,order_id,actor_id,tracking_codes
  ) values(v_org,v_order.id,p_actor_id,v_new);

  return jsonb_build_object('ok',true,'reused',false,'order_code',v_order.code,
    'tracking_codes',v_new);
end;
$fn$;

revoke all on function public.center_record_order_tracking_once(text,text[],uuid)
  from public, anon, authenticated;
grant execute on function public.center_record_order_tracking_once(text,text[],uuid)
  to service_role;
comment on function public.center_record_order_tracking_once(text,text[],uuid)
  is 'Private service-only one-time tracking registration, with owner role and audit log.';
