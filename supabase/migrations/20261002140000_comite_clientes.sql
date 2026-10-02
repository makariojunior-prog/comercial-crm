-- Comitê de clientes (atacado): relatório dos clientes NOVOS (primeira compra a partir de
-- 01/10/2026) que ainda não passaram pelo comitê, com as compras até agora, observações que
-- ficam no cadastro e a marcação "Comitê realizado". Só Administrador.

alter table public.crm_clients
  add column if not exists comite_realizado_em timestamptz,
  add column if not exists comite_observacoes  text,
  add column if not exists comite_por          uuid;

-- Clientes cuja PRIMEIRA compra caiu em [p_ini, p_fim] e é >= 01/10/2026.
-- Compra = pedido de tipo PEDIDO, não ignorado (bonificação e correção não contam).
create or replace function public.crm_comite_clientes(p_ini date, p_fim date, p_incluir_realizados boolean default false)
returns table (
  client_id uuid, nome text, tipo text, rota text, carteira text,
  primeira_compra date, n_pedidos integer, total numeric, indicador_nome text,
  comite_realizado_em timestamptz, comite_observacoes text
)
language plpgsql stable security definer set search_path = public as $$
declare v_corte constant date := date '2026-10-01';
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê de clientes';
  end if;
  return query
  with ped as (
    select p.crm_client_id as cid, coalesce(p.data_entrega, p.data_emissao::date) as dt, p.valor
      from public.atacado_pedidos p
     where p.crm_client_id is not null and p.tipo = 'PEDIDO' and p.ignorado = false
  ),
  agg as (
    select cid, min(dt) as primeira, count(*)::integer as n, coalesce(sum(valor), 0) as total
      from ped group by cid
  )
  select c.id, c.nome, c.tipo, c.rota, c.carteira, a.primeira, a.n, a.total, u.nome,
         c.comite_realizado_em, c.comite_observacoes
    from agg a
    join public.crm_clients c on c.id = a.cid
    left join public.crm_users u on u.id = c.indicador_user_id
   where a.primeira >= v_corte and a.primeira between p_ini and p_fim
     and (p_incluir_realizados or c.comite_realizado_em is null)
   order by a.primeira, c.nome;
end $$;

-- Salva a observação (sempre) e, se p_realizado, marca o comitê como realizado.
create or replace function public.crm_comite_atualizar(p_client_id uuid, p_obs text, p_realizado boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê de clientes';
  end if;
  update public.crm_clients set
    comite_observacoes  = nullif(trim(coalesce(p_obs, '')), ''),
    comite_realizado_em = case when p_realizado then coalesce(comite_realizado_em, now()) else comite_realizado_em end,
    comite_por          = case when p_realizado then coalesce(comite_por, auth.uid()) else comite_por end
   where id = p_client_id;
  if not found then raise exception 'Cliente não encontrado'; end if;
end $$;

-- Desfaz o "Comitê realizado" (a observação é mantida).
create or replace function public.crm_comite_reabrir(p_client_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê de clientes';
  end if;
  update public.crm_clients set comite_realizado_em = null, comite_por = null where id = p_client_id;
  if not found then raise exception 'Cliente não encontrado'; end if;
end $$;

revoke execute on function public.crm_comite_clientes(date, date, boolean) from public, anon;
revoke execute on function public.crm_comite_atualizar(uuid, text, boolean) from public, anon;
revoke execute on function public.crm_comite_reabrir(uuid) from public, anon;
grant  execute on function public.crm_comite_clientes(date, date, boolean) to authenticated;
grant  execute on function public.crm_comite_atualizar(uuid, text, boolean) to authenticated;
grant  execute on function public.crm_comite_reabrir(uuid) to authenticated;

-- Endurece a regra da comissão: só pedido de tipo PEDIDO conta. O valor real do tipo de
-- bonificação é 'BONIFICAÇÃO' (com Ç) e a regra antiga comparava 'BONIFICACAO' (sem Ç), então
-- nunca excluía nada. Sem efeito hoje (os 374 pedidos de clientes indicados são todos PEDIDO).
create or replace function public.crm_positivacao_progresso(p_user uuid default null, p_client uuid default null)
returns table (client_id uuid, n_pedidos integer, total numeric, elegivel boolean, pode_comissao boolean)
language sql stable set search_path = public as $$
  with cfg as (select meta_pedidos, meta_valor, janela_dias from public.positivacao_config limit 1),
  ped as (
    select c.id as cid, p.valor,
           coalesce(p.data_entrega, p.data_emissao::date) as dt,
           min(coalesce(p.data_entrega, p.data_emissao::date)) over (partition by c.id) as primeiro
      from public.crm_clients c
      join public.atacado_pedidos p on p.crm_client_id = c.id
       and p.tipo = 'PEDIDO' and p.ignorado = false
     where c.indicador_user_id is not null and c.positivado is not true
       and (p_user is null or c.indicador_user_id = p_user)
       and (p_client is null or c.id = p_client)
  ),
  agg as (
    select ped.cid, count(*)::integer as n, coalesce(sum(ped.valor), 0) as t
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
