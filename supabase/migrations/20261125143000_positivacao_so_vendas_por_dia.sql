-- Positivação conta só venda efetivada, uma compra por dia (pedido do gestor em 25/11/2026).
--
-- 1) Fora da conta: venda ainda na etapa "Orçamento" no Fácil 123 e remessa em bonificação,
--    doação ou brinde. O sync grava tudo da API como tipo='PEDIDO' (só cancelamento muda o tipo),
--    por isso a regra olha a etapa e a operação em atacado_pedidos_api. Quando a venda muda de
--    etapa e é sincronizada, volta a contar sozinha. Pedido sem registro na API (histórico da
--    planilha) continua contando.
-- 2) Pedidos do mesmo cliente no mesmo dia são uma única compra (ex.: uma venda dividida em dois
--    pedidos por linha de produto). O dia é a data de entrega ou, sem ela, a de emissão no
--    horário de Brasília. O valor continua sendo a soma de todos os pedidos.
--
-- Só muda o progresso de quem ainda não foi confirmado: o que já foi enviado ao RH não é
-- recalculado. A coluna n_pedidos mantém o nome (contrato da função), mas passa a contar compras.
-- Faturamento, Revenda, Dashboard e Comitê não mudam.

create or replace function public.crm_positivacao_progresso(p_user uuid default null, p_client uuid default null)
returns table (client_id uuid, n_pedidos integer, total numeric, elegivel boolean, pode_comissao boolean)
language sql stable set search_path = public as $$
  with cfg as (select meta_pedidos, meta_valor, janela_dias from public.positivacao_config limit 1),
  base as (
    select c.id as cid, p.valor,
           coalesce(p.data_entrega, (p.data_emissao at time zone 'America/Sao_Paulo')::date) as dt
      from public.crm_clients c
      join public.atacado_pedidos p on p.crm_client_id = c.id
       and p.tipo = 'PEDIDO' and p.ignorado = false
      left join public.atacado_pedidos_api a on a.id_venda = p.id_venda
     where c.indicador_user_id is not null and c.positivado is not true
       and (p_user is null or c.indicador_user_id = p_user)
       and (p_client is null or c.id = p_client)
       and a.etapa is distinct from 'Orçamento'
       and coalesce(a.operacao, '') not ilike 'Remessa em bonifica%'
  ),
  ped as (
    select base.*, min(base.dt) over (partition by base.cid) as primeiro from base
  ),
  agg as (
    select ped.cid, count(distinct ped.dt)::integer as n, coalesce(sum(ped.valor), 0) as t
      from ped cross join cfg
     where cfg.janela_dias is null or ped.dt <= ped.primeiro + cfg.janela_dias
     group by ped.cid
  )
  select c.id, coalesce(a.n, 0), coalesce(a.t, 0),
         coalesce(a.n, 0) >= cfg.meta_pedidos and coalesce(a.t, 0) >= cfg.meta_valor,
         not exists (select 1 from public.positivacao_indicadores_nao_elegiveis ne where ne.user_id = c.indicador_user_id)
    from public.crm_clients c
    cross join cfg
    left join agg a on a.cid = c.id
   where c.indicador_user_id is not null and c.positivado is not true
     and (p_user is null or c.indicador_user_id = p_user)
     and (p_client is null or c.id = p_client)
$$;

revoke execute on function public.crm_positivacao_progresso(uuid, uuid) from public, anon;
grant  execute on function public.crm_positivacao_progresso(uuid, uuid) to authenticated;
