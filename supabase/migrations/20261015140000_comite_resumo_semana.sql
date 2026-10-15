-- Comitê semanal: resumo do varejo (vendas) e da Pós-Venda/Recompra de um período.
-- Só Administrador. As visitas e os negócios do comitê são lidos direto das tabelas
-- (visits, deals, crm_deal_history) pelo app, com data de corte em 12/10/2026.
--
-- Vendas do varejo = pedidos de varejo_pedidos com data_entrega no período, exceto os
-- cancelados (status_icon '❌'); valor = valor_liquido. Compara com o período anterior
-- de mesma duração. Pós-Venda = crm_posvendas_interacoes.tipo 1; Recompra = tipo 2.

create or replace function public.crm_comite_resumo_semana(p_ini date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dias   integer := (p_fim - p_ini) + 1;
  v_ant_i  date := p_ini - v_dias;
  v_ant_f  date := p_ini - 1;
  v_res    jsonb;
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê';
  end if;

  select jsonb_build_object(
    'varejo', jsonb_build_object(
      'pedidos',        coalesce(sum(1) filter (where v.data_entrega between p_ini and p_fim and v.status_icon is distinct from '❌'), 0),
      'faturamento',    coalesce(sum(v.valor_liquido) filter (where v.data_entrega between p_ini and p_fim and v.status_icon is distinct from '❌'), 0),
      'cancelados',     coalesce(sum(1) filter (where v.data_entrega between p_ini and p_fim and v.status_icon = '❌'), 0),
      'valor_cancelado',coalesce(sum(v.valor_liquido) filter (where v.data_entrega between p_ini and p_fim and v.status_icon = '❌'), 0),
      'anterior', jsonb_build_object(
        'pedidos',     coalesce(sum(1) filter (where v.data_entrega between v_ant_i and v_ant_f and v.status_icon is distinct from '❌'), 0),
        'faturamento', coalesce(sum(v.valor_liquido) filter (where v.data_entrega between v_ant_i and v_ant_f and v.status_icon is distinct from '❌'), 0)
      )
    )
  ) into v_res
  from public.varejo_pedidos v
  where v.data_entrega between v_ant_i and p_fim;

  v_res := jsonb_set(v_res, '{varejo,por_dia}', coalesce((
    select jsonb_agg(jsonb_build_object('dia', d.dia, 'pedidos', d.n, 'valor', d.total) order by d.dia)
      from (
        select v.data_entrega as dia, count(*) as n, coalesce(sum(v.valor_liquido), 0) as total
          from public.varejo_pedidos v
         where v.data_entrega between p_ini and p_fim and v.status_icon is distinct from '❌'
         group by v.data_entrega
      ) d
  ), '[]'::jsonb));

  v_res := v_res || jsonb_build_object('posvendas', jsonb_build_object(
    'pos_venda', (select count(*) from public.crm_posvendas_interacoes i where i.tipo = 1 and i.data_interacao between p_ini and p_fim),
    'recompra',  (select count(*) from public.crm_posvendas_interacoes i where i.tipo = 2 and i.data_interacao between p_ini and p_fim),
    'anterior', jsonb_build_object(
      'pos_venda', (select count(*) from public.crm_posvendas_interacoes i where i.tipo = 1 and i.data_interacao between v_ant_i and v_ant_f),
      'recompra',  (select count(*) from public.crm_posvendas_interacoes i where i.tipo = 2 and i.data_interacao between v_ant_i and v_ant_f)
    ),
    'por_usuario', coalesce((
      select jsonb_agg(jsonb_build_object('usuario', u.usuario, 'pos_venda', u.pv, 'recompra', u.rc) order by u.pv + u.rc desc, u.usuario)
        from (
          select coalesce(nullif(trim(i.usuario_nome), ''), '—') as usuario,
                 count(*) filter (where i.tipo = 1) as pv,
                 count(*) filter (where i.tipo = 2) as rc
            from public.crm_posvendas_interacoes i
           where i.tipo in (1, 2) and i.data_interacao between p_ini and p_fim
           group by 1
        ) u
    ), '[]'::jsonb)
  ));

  return v_res;
end $$;

revoke execute on function public.crm_comite_resumo_semana(date, date) from public, anon;
grant  execute on function public.crm_comite_resumo_semana(date, date) to authenticated;
