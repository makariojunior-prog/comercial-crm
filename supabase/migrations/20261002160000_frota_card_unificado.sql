-- Card unificado de Frota (Alertas + Rastreamento) no dashboard.
-- 1) Admin escolhe quais veículos aparecem no card.
-- 2) Registro rápido de hodômetro (km + data), ligado ao veículo.

alter table public.crm_vehicles
  add column if not exists exibir_no_dashboard boolean not null default true;

create table if not exists public.frota_odometro_registros (
  id                  uuid primary key default gen_random_uuid(),
  vehicle_id          uuid not null references public.crm_vehicles(id) on delete cascade,
  km                  integer not null check (km >= 0),
  data                date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  registrado_por      uuid default auth.uid(),
  registrado_por_nome text,
  created_at          timestamptz not null default now()
);

create index if not exists frota_odometro_registros_vehicle_data_idx
  on public.frota_odometro_registros (vehicle_id, data desc, created_at desc);

alter table public.frota_odometro_registros enable row level security;

drop policy if exists frota_odometro_all on public.frota_odometro_registros;
create policy frota_odometro_all on public.frota_odometro_registros
  for all to authenticated
  using ((select public.crm_is_member()))
  with check ((select public.crm_is_member()));

grant select, insert, update, delete on public.frota_odometro_registros to authenticated;

-- Preenche o nome de quem registrou e mantém crm_vehicles.km_atual no maior km já informado
-- (mesma regra usada pelas manutenções e custos: o km atual nunca recua sozinho).
create or replace function public.frota_odometro_registro_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.registrado_por_nome is null then
    select nome into new.registrado_por_nome from public.crm_users where id = auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists frota_odometro_before on public.frota_odometro_registros;
create trigger frota_odometro_before before insert on public.frota_odometro_registros
  for each row execute function public.frota_odometro_registro_trg();

create or replace function public.frota_odometro_after_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_vehicles
     set km_atual = new.km
   where id = new.vehicle_id and (km_atual is null or km_atual < new.km);
  return new;
end $$;

drop trigger if exists frota_odometro_after on public.frota_odometro_registros;
create trigger frota_odometro_after after insert on public.frota_odometro_registros
  for each row execute function public.frota_odometro_after_trg();
