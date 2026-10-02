-- Indicadores sem direito à comissão de positivação (ex.: sócio/administrador).
-- O progresso dos clientes continua sendo calculado normalmente; o indicador só deixa de
-- aparecer em "Elegíveis" (fila de confirmação, aviso do menu e envio em lote) e o servidor
-- recusa a confirmação. Tabela própria, por ID de usuário, para sobreviver à centralização
-- de usuários no portal.

create table if not exists public.positivacao_indicadores_nao_elegiveis (
  user_id    uuid primary key,
  motivo     text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.positivacao_indicadores_nao_elegiveis enable row level security;

drop policy if exists pos_nao_eleg_select on public.positivacao_indicadores_nao_elegiveis;
create policy pos_nao_eleg_select on public.positivacao_indicadores_nao_elegiveis
  for select to authenticated using (public.crm_is_member() or public.rh_is_member());

drop policy if exists pos_nao_eleg_write on public.positivacao_indicadores_nao_elegiveis;
create policy pos_nao_eleg_write on public.positivacao_indicadores_nao_elegiveis
  for all to authenticated
  using (coalesce(public.crm_get_my_role(), '') = 'admin')
  with check (coalesce(public.crm_get_my_role(), '') = 'admin');

grant select, insert, delete on public.positivacao_indicadores_nao_elegiveis to authenticated;

-- Makário Orozimbo Pai não é elegível a comissão de positivação.
insert into public.positivacao_indicadores_nao_elegiveis (user_id, motivo)
select id, 'Não elegível a comissão de positivação (definido em 02/10/2026)'
  from public.crm_users where id = '16283841-7848-4c49-9751-f85be9cf9102'
on conflict (user_id) do nothing;

-- Progresso: ganha pode_comissao (o indicador é elegível a comissão?). `elegivel` continua
-- significando "bateu a meta".
drop function if exists public.crm_positivacao_progresso(uuid, uuid);
create function public.crm_positivacao_progresso(p_user uuid default null, p_client uuid default null)
returns table (client_id uuid, n_pedidos integer, total numeric, elegivel boolean, pode_comissao boolean)
language sql stable set search_path = public as $$
  with cfg as (select meta_pedidos, meta_valor, janela_dias from public.positivacao_config limit 1),
  ped as (
    select c.id as cid, p.valor,
           coalesce(p.data_entrega, p.data_emissao::date) as dt,
           min(coalesce(p.data_entrega, p.data_emissao::date)) over (partition by c.id) as primeiro
      from public.crm_clients c
      join public.atacado_pedidos p on p.crm_client_id = c.id
       and p.tipo <> 'BONIFICACAO' and p.tipo <> 'CANCELADO' and p.ignorado = false
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

revoke execute on function public.crm_positivacao_progresso(uuid, uuid) from public, anon;
grant  execute on function public.crm_positivacao_progresso(uuid, uuid) to authenticated;

-- Aviso do menu: só quem pode receber comissão.
create or replace function public.crm_positivacao_elegiveis_count()
returns integer language sql stable security definer set search_path = public as $$
  select case when coalesce(public.crm_get_my_role(), '') = 'admin'
    then (select count(*)::integer from public.crm_positivacao_progresso() where elegivel and pode_comissao) else 0 end
$$;

-- Confirmação: o servidor recusa indicador não elegível.
create or replace function public.crm_confirmar_positivacao(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.crm_clients%rowtype;
  v_n integer; v_total numeric; v_ok boolean; v_pode boolean;
  b record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim date;
  v_valor numeric := (select valor_comissao from public.positivacao_config limit 1);
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores podem confirmar positivações';
  end if;

  select * into c from public.crm_clients where id = p_client_id for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  if c.positivado is true then raise exception 'Positivação já confirmada para este cliente'; end if;
  if c.indicador_user_id is null then
    raise exception 'Cliente sem indicador vinculado a um usuário — edite o cadastro do cliente';
  end if;

  select pr.n_pedidos, pr.total, pr.elegivel, pr.pode_comissao into v_n, v_total, v_ok, v_pode
    from public.crm_positivacao_progresso(null, p_client_id) pr;
  if not coalesce(v_ok, false) then
    raise exception 'Cliente ainda não atingiu a meta (% pedidos, R$ %)', coalesce(v_n, 0), coalesce(v_total, 0);
  end if;
  if not coalesce(v_pode, true) then
    raise exception 'O indicador deste cliente não é elegível a comissão de positivação';
  end if;

  select * into b from public.crm_positivacao_beneficiario(c.indicador_user_id);

  v_fim := public.crm_positivacao_periodo_fim(v_hoje);
  while exists (
    select 1 from public.comissoes_mensais
     where empresa_id = b.empresa_id and colaborador_nome = b.nome
       and data_fim = v_fim and fonte = 'POSITIVACAO' and confirmado
  ) loop
    v_fim := public.crm_positivacao_periodo_fim(v_fim + 1);
  end loop;

  perform set_config('app.positivacao_bypass', 'on', true);
  update public.crm_clients set
    positivado = true, positivado_em = v_hoje, comissao_status = 'pendente', comissao_valor = v_valor,
    comissao_pago_em = null, positivado_por = auth.uid(),
    positivacao_pedidos = v_n, positivacao_total = v_total, comissao_periodo_fim = v_fim,
    comissao_motivo = null, comissao_decisao_em = null, comissao_decisao_por = null
   where id = p_client_id;
  perform public.crm_positivacao_sync_rh(c.indicador_user_id, v_fim);
  perform set_config('app.positivacao_bypass', 'off', true);

  return jsonb_build_object('periodo_fim', v_fim, 'beneficiario', b.nome, 'vinculado_rh', b.vinculado, 'valor', v_valor);
end $$;
