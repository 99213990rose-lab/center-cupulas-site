-- Center Cúpulas: purchasing price per planned box, not freight or client surcharge.
-- Default values chosen from the higher end of the ranges supplied by the factory.
alter table public.packaging_rules
  add column if not exists box_small_cost_brl numeric(8,2) not null default 10.00,
  add column if not exists box_medium_cost_brl numeric(8,2) not null default 12.00,
  add column if not exists box_large_cost_brl numeric(8,2) not null default 15.00,
  add column if not exists box_small_product_max_cm numeric(7,2) not null default 35,
  add column if not exists box_medium_product_max_cm numeric(7,2) not null default 65;

update public.packaging_rules
set box_small_cost_brl=10.00, box_medium_cost_brl=12.00, box_large_cost_brl=15.00,
    box_small_product_max_cm=35, box_medium_product_max_cm=65,
    rule_version='v0.2-custos-caixas'
where organization_id='e3cb8002-ebaa-4d3a-acd3-46a678815e7b';

do $$
begin
 if not exists (select 1 from pg_constraint where conname='center_packaging_costs_positive') then
   alter table public.packaging_rules
     add constraint center_packaging_costs_positive
     check (box_small_cost_brl between 0 and 1000
        and box_medium_cost_brl between 0 and 1000
        and box_large_cost_brl between 0 and 1000
        and box_small_product_max_cm > 0
        and box_medium_product_max_cm > box_small_product_max_cm);
 end if;
end $$;
