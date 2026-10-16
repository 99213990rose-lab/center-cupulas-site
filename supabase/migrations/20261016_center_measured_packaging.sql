-- Pending until factory staff approves real measured dimensions and packed weights.
create table if not exists public.center_packaging_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_format text not null check(model_format in ('conica','bell','drum','piramidal-quadrada','cubo','oval')),
  top_cm numeric(7,2) not null check(top_cm > 0 and top_cm <= 150),
  bottom_cm numeric(7,2) not null check(bottom_cm > 0 and bottom_cm <= 150),
  height_cm numeric(7,2) not null check(height_cm > 0 and height_cm <= 150),
  units integer not null check(units between 1 and 30),
  box_width_cm numeric(7,2) not null check(box_width_cm > 0 and box_width_cm <= 300),
  box_length_cm numeric(7,2) not null check(box_length_cm > 0 and box_length_cm <= 300),
  box_height_cm numeric(7,2) not null check(box_height_cm > 0 and box_height_cm <= 300),
  packed_weight_kg numeric(7,3) not null check(packed_weight_kg > 0 and packed_weight_kg <= 60),
  approved boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint center_packaging_measurements_unique_config unique
    (organization_id,model_format,top_cm,bottom_cm,height_cm,units),
  constraint center_packaging_measurements_approved_needs_review
    check(not approved or (reviewed_at is not null
      and nullif(trim(coalesce(reviewed_by,'')),'') is not null))
);
create index if not exists center_packaging_measurements_approved_idx
  on public.center_packaging_measurements(organization_id,approved);
alter table public.center_packaging_measurements enable row level security;
revoke all on public.center_packaging_measurements from public,anon,authenticated;
grant select,insert,update,delete on public.center_packaging_measurements to service_role;
