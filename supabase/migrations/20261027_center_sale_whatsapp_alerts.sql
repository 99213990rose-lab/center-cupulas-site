-- WhatsApp sale alerts for Center Cúpulas (owner-only, server side).
-- No historical backfill: old test purchases must not trigger surprise alerts.
create table if not exists public.center_sale_whatsapp_outbox (
  order_id uuid primary key references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','retry','sent','needs_review')),
  attempts integer not null default 0 check (attempts >= 0),
  attempted_at timestamptz,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists center_sale_whatsapp_outbox_queue_idx
  on public.center_sale_whatsapp_outbox(status,created_at);
alter table public.center_sale_whatsapp_outbox enable row level security;
revoke all on public.center_sale_whatsapp_outbox from public, anon, authenticated;
grant select, insert, update on public.center_sale_whatsapp_outbox to service_role;

create or replace function public.center_enqueue_sale_whatsapp_alert()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
     and new.payment_status = 'paid'
     and new.payment_method = 'mercado_pago'
     and new.metadata->>'source' = 'center_checkout_pro'
  then
    insert into public.center_sale_whatsapp_outbox(order_id)
    values (new.id) on conflict (order_id) do nothing;
  end if;
  return new;
exception when others then
  -- A notification failure must never abort an approved payment/order.
  raise warning 'center_sale_whatsapp_enqueue_failed (SQLSTATE %)', sqlstate;
  return new;
end;
$;
drop trigger if exists center_paid_sale_whatsapp_alert on public.orders;
create trigger center_paid_sale_whatsapp_alert after insert on public.orders
for each row execute function public.center_enqueue_sale_whatsapp_alert();

-- Claims are atomic; duplicate Mercado Pago webhooks cannot send twice.
-- Called only by the server with the Supabase service-role key.
create or replace function public.claim_center_sale_whatsapp_alert(p_order_id uuid)
returns jsonb language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claim uuid;
  v_code text;
  v_total numeric;
  v_items jsonb;
  v_quantity integer;
begin
  update public.center_sale_whatsapp_outbox
     set status='sending',attempts=attempts+1,
         attempted_at=now(),updated_at=now(),last_error_code=null
   where order_id=p_order_id
     and attempts < 6
     and (status='pending'
       or (status='retry' and (attempted_at is null or attempted_at < now() - interval '5 minutes')))
  returning order_id into v_claim;
  if v_claim is null then return null; end if;

  select o.code,o.total,coalesce(o.metadata->'line_items','[]'::jsonb)
    into v_code,v_total,v_items from public.orders o
    where o.id=v_claim and o.organization_id='e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid
    and o.payment_status='paid';
  if v_code is null then
    update public.center_sale_whatsapp_outbox
      set status='needs_review',last_error_code='order_not_found',updated_at=now()
      where order_id=p_order_id;
    return null;
  end if;

  select coalesce(sum(greatest(0,coalesce((item->>'quantity')::integer,0))),0)::int
    into v_quantity from jsonb_array_elements(v_items) as item;
  return jsonb_build_object('code',v_code,'amount',v_total,'quantity',v_quantity);
end;
$$;
revoke all on function public.claim_center_sale_whatsapp_alert(uuid) from public, anon, authenticated;
grant execute on function public.claim_center_sale_whatsapp_alert(uuid) to service_role;
