-- Center Cúpulas operational event history. No customer records, prices,
-- payment identifiers or contact information are stored in these tables.
create table if not exists public.center_ops_audit_runs (
  checked_day date primary key,
  first_checked_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  scan_count integer not null default 1 check (scan_count >= 1),
  status text not null check (status in ('healthy','attention','critical')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object')
);
alter table public.center_ops_audit_runs enable row level security;
revoke all on table public.center_ops_audit_runs from public, anon, authenticated;
grant select, insert, update on public.center_ops_audit_runs to service_role;

create table if not exists public.center_ops_incidents (
  incident_key text primary key check (incident_key in (
    'payment_integrity','unconfirmed_fittings','email_delivery'
  )),
  status text not null check (status in ('open','resolved')),
  current_count integer not null default 0 check (current_count >= 0),
  opened_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  observation_count integer not null default 1 check (observation_count >= 1)
);
alter table public.center_ops_incidents enable row level security;
revoke all on table public.center_ops_incidents from public, anon, authenticated;
grant select, insert, update on public.center_ops_incidents to service_role;

-- Called by the existing private checkout-audit cron. The original aggregate
-- continues to check the entire financial ledger. This RPC adds historical
-- continuity and missing queue states without sending any notifications.
create or replace function public.center_record_operational_audit()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_metrics jsonb;
  v_critical integer;
  v_fittings integer;
  v_email integer;
  v_status text;
  v_signal record;
begin
  perform pg_advisory_xact_lock(hashtextextended('center-operational-audit', 0));
  v_metrics := public.center_checkout_integrity_snapshot()
    || jsonb_build_object(
      'email_retry_notifications',
        (select count(*) from public.center_order_email_outbox where status = 'retry'),
      'email_failed_notifications',
        (select count(*) from public.center_order_email_outbox where status = 'skipped'),
      'email_stuck_sending_notifications',
        (select count(*) from public.center_order_email_outbox
          where status = 'sending' and updated_at < now() - interval '20 minutes')
    );

  v_critical :=
    (v_metrics->>'paid_quotes_without_orders')::integer +
    (v_metrics->>'paid_checkout_orders_without_jobs')::integer +
    (v_metrics->>'applied_payments_without_paid_order')::integer +
    (v_metrics->>'duplicate_approved_charges')::integer;
  v_fittings := (v_metrics->>'active_online_orders_missing_fitting')::integer;
  v_email :=
    (v_metrics->>'pending_email_notifications')::integer +
    (v_metrics->>'email_retry_notifications')::integer +
    (v_metrics->>'email_failed_notifications')::integer +
    (v_metrics->>'email_stuck_sending_notifications')::integer;
  v_status := case when v_critical > 0 then 'critical'
      when v_fittings > 0 or v_email > 0 then 'attention'
      else 'healthy' end;

  insert into public.center_ops_audit_runs(checked_day,status,metrics)
  values ((now() at time zone 'America/Sao_Paulo')::date,v_status,v_metrics)
  on conflict (checked_day) do update
    set last_checked_at = now(),
        scan_count = public.center_ops_audit_runs.scan_count + 1,
        status = excluded.status,
        metrics = excluded.metrics;

  for v_signal in
    select * from (values
      ('payment_integrity',v_critical),
      ('unconfirmed_fittings',v_fittings),
      ('email_delivery',v_email)
    ) as signals(incident_key,current_count)
  loop
    if v_signal.current_count > 0 then
      insert into public.center_ops_incidents(
        incident_key,status,current_count,opened_at,last_observed_at,
        resolved_at,observation_count
      ) values (
        v_signal.incident_key,'open',v_signal.current_count,now(),now(),null,1
      )
      on conflict (incident_key) do update
        set status='open',
            current_count=excluded.current_count,
            opened_at=case
              when public.center_ops_incidents.status='resolved'
                then now() else public.center_ops_incidents.opened_at end,
            last_observed_at=now(),
            resolved_at=null,
            observation_count=public.center_ops_incidents.observation_count+1;
    else
      update public.center_ops_incidents
      set status='resolved', current_count=0, last_observed_at=now(),
          resolved_at=now(),
          observation_count=observation_count+1
      where incident_key=v_signal.incident_key and status='open';
    end if;
  end loop;
  return v_metrics;
end;
$fn$;

revoke all on function public.center_record_operational_audit()
  from public, anon, authenticated;
grant execute on function public.center_record_operational_audit()
  to service_role;

-- Current operational pulse, available only to authenticated Center owners
-- through the server's existing operations route.
create or replace function public.center_operational_health_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'last_audit',(
      select jsonb_build_object(
        'checked_day',r.checked_day,'checked_at',r.last_checked_at,
        'scan_count',r.scan_count,'status',r.status,'metrics',r.metrics
      )
      from public.center_ops_audit_runs r
      order by r.checked_day desc limit 1
    ),
    'incidents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',i.incident_key,'status',i.status,'count',i.current_count,
        'opened_at',i.opened_at,'last_observed_at',i.last_observed_at,
        'resolved_at',i.resolved_at
      ) order by i.incident_key)
      from public.center_ops_incidents i
    ),'[]'::jsonb)
  );
$fn$;
revoke all on function public.center_operational_health_summary()
  from public, anon, authenticated;
grant execute on function public.center_operational_health_summary()
  to service_role;
