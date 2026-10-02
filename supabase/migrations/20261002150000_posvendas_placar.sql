-- Card "Pós-Venda e Recompra hoje": barras por atendente.
-- Meta diária de Recompra configurável (admin); meta do Pós-Venda = pendentes (calculada na tela).

create table if not exists public.posvendas_metas (
  id                  integer primary key default 1 check (id = 1),
  meta_recompra_dia   integer not null default 40 check (meta_recompra_dia >= 0),
  updated_at          timestamptz not null default now()
);
insert into public.posvendas_metas (id) values (1) on conflict (id) do nothing;

alter table public.posvendas_metas enable row level security;

drop policy if exists posvendas_metas_select on public.posvendas_metas;
create policy posvendas_metas_select on public.posvendas_metas
  for select to authenticated using (public.crm_is_member());

drop policy if exists posvendas_metas_update on public.posvendas_metas;
create policy posvendas_metas_update on public.posvendas_metas
  for update to authenticated
  using (coalesce(public.crm_get_my_role(), '') = 'admin')
  with check (coalesce(public.crm_get_my_role(), '') = 'admin');

grant select, update on public.posvendas_metas to authenticated;

-- Atendimentos do dia por atendente e tipo (1 = Pós-Venda, 2 = Recompra). Inclui quem atendeu
-- nos últimos 14 dias mesmo sem nenhum hoje, para a barra zerada aparecer no gráfico.
create or replace function public.crm_posvendas_placar_hoje()
returns table (tipo integer, atendente text, hoje integer)
language sql stable set search_path = public as $$
  with lim as (
    select (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as ini_hoje
  )
  select i.tipo::integer,
         coalesce(nullif(trim(i.usuario_nome), ''), 'Sem nome') as atendente,
         count(*) filter (where i.created_at >= lim.ini_hoje)::integer as hoje
    from public.crm_posvendas_interacoes i cross join lim
   where i.tipo in (1, 2)
     and i.created_at >= lim.ini_hoje - interval '14 days'
   group by 1, 2
$$;

grant execute on function public.crm_posvendas_placar_hoje() to authenticated;

-- O card passa a ficar por padrão na "Visão Geral da Empresa" (seção fixa)
insert into public.dashboard_fixed_widgets (widget_id, visible, ordem, updated_at)
select 'posvendas', true, 5, now()
where not exists (select 1 from public.dashboard_fixed_widgets where widget_id = 'posvendas');
