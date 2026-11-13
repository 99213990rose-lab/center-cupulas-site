-- Idempotent quote preparation for repeat browser checkout attempts.
-- No existing quote or payment is modified. A repeated attempt with the same
-- authoritative payload gets its original quote; changed data fails closed.
create table if not exists public.center_checkout_attempts (
  attempt_id uuid primary key,
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  payload_hash text not null check (length(payload_hash) = 32),
  created_at timestamptz not null default now()
);
alter table public.center_checkout_attempts enable row level security;
revoke all on public.center_checkout_attempts from public, anon, authenticated;
grant select, insert on public.center_checkout_attempts to service_role;

create or replace function public.center_create_checkout_quote_once(
  p_attempt_id uuid,
  p_quote_payload jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_hash text;
  v_existing public.center_checkout_attempts%rowtype;
  v_quote_id uuid;
  v_quote_code text;
  v_status text;
begin
  if p_attempt_id is null or p_quote_payload is null or
     jsonb_typeof(p_quote_payload) <> 'object' or
     jsonb_typeof(p_quote_payload->'line_items') <> 'array' or
     jsonb_array_length(p_quote_payload->'line_items') < 1 or
     jsonb_typeof(p_quote_payload->'shipping') <> 'object' or
     p_quote_payload->>'currency' <> 'BRL' or
     nullif(p_quote_payload->>'customer_name','') is null or
     nullif(p_quote_payload->>'customer_phone','') is null or
     coalesce((p_quote_payload->>'total')::numeric, 0) <= 0
  then
    raise exception 'invalid_checkout_quote';
  end if;

  v_hash := md5(p_quote_payload::text);
  -- Lock on the UUID to serialize two concurrent retries of the same request.
  perform pg_advisory_xact_lock(hashtextextended(p_attempt_id::text, 0));
  select a.* into v_existing
    from public.center_checkout_attempts a
   where a.attempt_id = p_attempt_id
   for update;

  if found then
    if v_existing.payload_hash <> v_hash then
      raise exception 'checkout_attempt_conflict';
    end if;
    select q.id, q.code, q.status
      into v_quote_id, v_quote_code, v_status
      from public.quotes q
     where q.id = v_existing.quote_id
       and q.organization_id = 'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid;
    if v_quote_id is null then raise exception 'checkout_quote_missing'; end if;
    return jsonb_build_object(
      'id',v_quote_id,'code',v_quote_code,'status',v_status,'reused',true
    );
  end if;

  v_quote_code := 'WEB-' || to_char(now() at time zone 'UTC', 'YYMMDD') ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.quotes (
    organization_id, lead_id, code, status, line_items, subtotal,
    freight, total, currency, customer_name, customer_phone, shipping, notes
  ) values (
    'e3cb8002-ebaa-4d3a-acd3-46a678815e7b'::uuid,
    nullif(p_quote_payload->>'lead_id','')::uuid,
    v_quote_code, 'draft', p_quote_payload->'line_items',
    (p_quote_payload->>'subtotal')::numeric,
    (p_quote_payload->>'freight')::numeric,
    (p_quote_payload->>'total')::numeric,
    'BRL', p_quote_payload->>'customer_name', p_quote_payload->>'customer_phone',
    p_quote_payload->'shipping', p_quote_payload->>'notes'
  ) returning id into v_quote_id;

  insert into public.center_checkout_attempts(attempt_id, quote_id, payload_hash)
  values(p_attempt_id, v_quote_id, v_hash);

  return jsonb_build_object(
    'id',v_quote_id,'code',v_quote_code,'status','draft','reused',false
  );
end;
$fn$;

revoke all on function public.center_create_checkout_quote_once(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.center_create_checkout_quote_once(uuid,jsonb)
  to service_role;
comment on function public.center_create_checkout_quote_once(uuid,jsonb)
  is 'Service-role only: create or reuse one Center checkout quote per attempt and payload.';
