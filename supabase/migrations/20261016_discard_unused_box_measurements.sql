-- Retire o experimento anterior de medidas físicas de caixas.
-- Somente execute se estiver sem dados. Nunca use CASCADE.
do $$ begin
  if to_regclass('public.center_packaging_measurements') is not null then
    if exists (select 1 from public.center_packaging_measurements limit 1) then
      raise exception 'Measured packaging table has data: manual review required';
    end if;
    drop table public.center_packaging_measurements;
  end if;
end $$;
