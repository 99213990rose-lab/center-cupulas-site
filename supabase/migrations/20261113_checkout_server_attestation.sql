-- Server-to-server checkout attestation. A public browser can preview
-- prices but cannot independently prepare an order for payment.
-- Tokens are short-lived, single-use and never returned to shoppers.
create table if not exists public.center_checkout_attestations (
  token uuid primary key default gen_random_uuid(),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '120 seconds'),
  consumed_at timestamptz
);
alter table public.center_checkout_attestations enable row level security;
revoke all on table public.center_checkout_attestations from public, anon, authenticated;
grant select, insert, update on public.center_checkout_attestations to service_role;

create or replace function public.center_issue_checkout_attestation(
  p_payload_sha256 text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_token uuid;
begin
  if p_payload_sha256 is null or
     p_payload_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_attestation_payload';
  end if;
  insert into public.center_checkout_attestations(payload_sha256)
  values(p_payload_sha256)
  returning token into v_token;
  return v_token;
end;
$fn$;

create or replace function public.center_consume_checkout_attestation(
  p_token uuid, p_payload_sha256 text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_token uuid;
begin
  if p_token is null or p_payload_sha256 is null or
     p_payload_sha256 !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  -- Atomic compare-and-consume prevents replay even under concurrency.
  update public.center_checkout_attestations
  set consumed_at = now()
  where token = p_token
    and payload_sha256 = p_payload_sha256
    and consumed_at is null
    and expires_at > now()
  returning token into v_token;
  return v_token is not null;
end;
$fn$;

revoke all on function public.center_issue_checkout_attestation(text)
  from public, anon, authenticated;
revoke all on function public.center_consume_checkout_attestation(uuid,text)
  from public, anon, authenticated;
grant execute on function public.center_issue_checkout_attestation(text)
  to service_role;
grant execute on function public.center_consume_checkout_attestation(uuid,text)
  to service_role;
comment on function public.center_issue_checkout_attestation(text)
  is 'Server-side one-use proof for privileged payment quote preparation.';
comment on function public.center_consume_checkout_attestation(uuid,text)
  is 'Server-side atomic proof validation before payment quote side effects.';
