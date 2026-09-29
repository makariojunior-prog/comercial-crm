-- Positivações Atacado × RH — v2
-- Recusa/estorno pelo RH, regra configurável (com janela de validade opcional),
-- confirmação em lote, contagem de elegíveis e RLS de comissoes_mensais só para o RH.

-- ── Regra configurável ───────────────────────────────────────────────────
create table if not exists public.positivacao_config (
  id boolean primary key default true check (id),
  meta_pedidos   integer not null default 3   check (meta_pedidos > 0),
  meta_valor     numeric not null default 500 check (meta_valor >= 0),
  valor_comissao numeric not null default 50  check (valor_comissao >= 0),
  -- null = sem janela (conta todo o histórico). N = a meta precisa ser atingida em até N dias
  -- do primeiro pedido do cliente.
  janela_dias    integer check (janela_dias is null or janela_dias > 0),
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);
insert into public.positivacao_config (id) values (true) on conflict (id) do nothing;

create or replace function public.positivacao_config_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists positivacao_config_touch on public.positivacao_config;
create trigger positivacao_config_touch before update on public.positivacao_config
  for each row execute function public.positivacao_config_touch();

alter table public.positivacao_config enable row level security;
drop policy if exists positivacao_config_select on public.positivacao_config;
create policy positivacao_config_select on public.positivacao_config for select to authenticated
  using (public.crm_is_member() or public.rh_is_member());
drop policy if exists positivacao_config_update on public.positivacao_config;
create policy positivacao_config_update on public.positivacao_config for update to authenticated
  using (coalesce(public.crm_get_my_role(), '') = 'admin')
  with check (coalesce(public.crm_get_my_role(), '') = 'admin');

-- ── Colunas da decisão do RH ─────────────────────────────────────────────
alter table public.crm_clients
  add column if not exists comissao_motivo      text,
  add column if not exists comissao_decisao_em  timestamptz,
  add column if not exists comissao_decisao_por text;

-- ── Progresso/elegibilidade calculados no banco (fonte única da regra) ────
create or replace function public.crm_positivacao_progresso(p_user uuid default null, p_client uuid default null)
returns table (client_id uuid, n_pedidos integer, total numeric, elegivel boolean)
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
         coalesce(a.n, 0) >= cfg.meta_pedidos and coalesce(a.t, 0) >= cfg.meta_valor
    from public.crm_clients c
    cross join cfg
    left join agg a on a.cid = c.id
   where c.indicador_user_id is not null and c.positivado is not true
     and (p_user is null or c.indicador_user_id = p_user)
     and (p_client is null or c.id = p_client)
$$;

-- Aviso ao Administrador: quantos clientes estão elegíveis aguardando confirmação
create or replace function public.crm_positivacao_elegiveis_count()
returns integer language sql stable security definer set search_path = public as $$
  select case when coalesce(public.crm_get_my_role(), '') = 'admin'
    then (select count(*)::integer from public.crm_positivacao_progresso() where elegivel) else 0 end
$$;

-- ── Sync do agregado do RH (agora com client_id no detalhe) ──────────────
create or replace function public.crm_positivacao_sync_rh(p_user uuid, p_fim date)
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  v_ini date := ((p_fim - interval '1 month')::date + 1);
  v_valor numeric; v_qtd integer; v_det jsonb;
begin
  select * into b from public.crm_positivacao_beneficiario(p_user);
  if b.nome is null then return; end if;

  select coalesce(sum(comissao_valor), 0), count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'client_id', id, 'cliente', nome, 'positivado_em', positivado_em,
           'pedidos', positivacao_pedidos, 'total', positivacao_total, 'valor', comissao_valor
         ) order by positivado_em, nome), '[]'::jsonb)
    into v_valor, v_qtd, v_det
    from public.crm_clients
   where indicador_user_id = p_user and comissao_periodo_fim = p_fim and comissao_status = 'pendente';

  if v_qtd = 0 then
    delete from public.comissoes_mensais
     where empresa_id = b.empresa_id and colaborador_nome = b.nome
       and data_fim = p_fim and fonte = 'POSITIVACAO' and not confirmado;
  else
    insert into public.comissoes_mensais
      (empresa_id, colaborador_nome, data_inicio, data_fim, fonte, valor_total, pedidos_count, confirmado, detalhes)
    values (b.empresa_id, b.nome, v_ini, p_fim, 'POSITIVACAO', v_valor, v_qtd, false, v_det)
    on conflict (empresa_id, colaborador_nome, data_inicio, data_fim, fonte) do update
      set valor_total = excluded.valor_total,
          pedidos_count = excluded.pedidos_count,
          detalhes = excluded.detalhes
      where not public.comissoes_mensais.confirmado;
  end if;
end $$;

-- ── Guarda (inclui as colunas novas) ─────────────────────────────────────
create or replace function public.crm_clients_positivacao_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_setting('app.positivacao_bypass', true) = 'on' then return new; end if;
  if coalesce((select role from public.crm_users where id = auth.uid()), '') = 'admin' then return new; end if;

  if tg_op = 'INSERT' then
    if new.positivado is true or new.comissao_status is not null
       or new.comissao_pago_em is not null or new.comissao_periodo_fim is not null then
      raise exception 'Somente Administradores podem registrar positivação ou comissão';
    end if;
  elsif (new.positivado, new.positivado_em, new.comissao_status, new.comissao_valor, new.comissao_pago_em,
         new.comissao_periodo_fim, new.positivado_por, new.positivacao_pedidos, new.positivacao_total,
         new.comissao_motivo, new.comissao_decisao_em, new.comissao_decisao_por)
        is distinct from
        (old.positivado, old.positivado_em, old.comissao_status, old.comissao_valor, old.comissao_pago_em,
         old.comissao_periodo_fim, old.positivado_por, old.positivacao_pedidos, old.positivacao_total,
         old.comissao_motivo, old.comissao_decisao_em, old.comissao_decisao_por) then
    raise exception 'Somente Administradores podem alterar positivação ou comissão';
  end if;
  return new;
end $$;

-- ── Confirmar (regra vem da configuração) ────────────────────────────────
create or replace function public.crm_confirmar_positivacao(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.crm_clients%rowtype;
  v_n integer; v_total numeric; v_ok boolean;
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

  select pr.n_pedidos, pr.total, pr.elegivel into v_n, v_total, v_ok
    from public.crm_positivacao_progresso(null, p_client_id) pr;
  if not coalesce(v_ok, false) then
    raise exception 'Cliente ainda não atingiu a meta (% pedidos, R$ %)', coalesce(v_n, 0), coalesce(v_total, 0);
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

-- Confirmação em lote: cada cliente é validado individualmente; falhas não abortam o lote
create or replace function public.crm_confirmar_positivacoes(p_client_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ok integer := 0; v_erros jsonb := '[]'::jsonb;
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores podem confirmar positivações';
  end if;
  foreach v_id in array p_client_ids loop
    begin
      perform public.crm_confirmar_positivacao(v_id);
      v_ok := v_ok + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_object('client_id', v_id, 'erro', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('confirmadas', v_ok, 'erros', v_erros);
end $$;

-- ── Desfazer (Administrador, enquanto o RH não decidiu) ──────────────────
create or replace function public.crm_desfazer_positivacao(p_client_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.crm_clients%rowtype;
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores podem desfazer positivações';
  end if;
  select * into c from public.crm_clients where id = p_client_id for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  if c.positivado is not true or c.comissao_status is distinct from 'pendente' then
    raise exception 'Só é possível desfazer enquanto o RH ainda não decidiu';
  end if;

  perform set_config('app.positivacao_bypass', 'on', true);
  update public.crm_clients set
    positivado = false, positivado_em = null, comissao_status = null,
    comissao_valor = (select valor_comissao from public.positivacao_config limit 1),
    comissao_pago_em = null, positivado_por = null, positivacao_pedidos = null,
    positivacao_total = null, comissao_periodo_fim = null,
    comissao_motivo = null, comissao_decisao_em = null, comissao_decisao_por = null
   where id = p_client_id;
  perform public.crm_positivacao_sync_rh(c.indicador_user_id, c.comissao_periodo_fim);
  perform set_config('app.positivacao_bypass', 'off', true);
end $$;

-- ── RH: recusar (aguardando) ou estornar (já pago), sempre com motivo ────
-- Estorno lança um ajuste negativo (fonte POSITIVACAO_ESTORNO) no período de fechamento
-- aberto hoje, que a Folha soma automaticamente.
create or replace function public.rh_positivacao_decidir(p_client_id uuid, p_acao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.crm_clients%rowtype;
  b record;
  v_email text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim date; v_ini date; v_valor numeric; v_det jsonb;
begin
  if not public.rh_is_member() then raise exception 'Somente o RH pode decidir sobre positivações'; end if;
  if p_acao not in ('recusar', 'estornar') then raise exception 'Ação inválida'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo'; end if;

  select * into c from public.crm_clients where id = p_client_id for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  select email into v_email from auth.users where id = auth.uid();

  perform set_config('app.positivacao_bypass', 'on', true);
  if p_acao = 'recusar' then
    if c.comissao_status is distinct from 'pendente' then
      raise exception 'Só é possível recusar positivações que aguardam o RH';
    end if;
    update public.crm_clients set comissao_status = 'recusada', comissao_motivo = trim(p_motivo),
           comissao_decisao_em = now(), comissao_decisao_por = v_email
     where id = p_client_id;
    perform public.crm_positivacao_sync_rh(c.indicador_user_id, c.comissao_periodo_fim);
  else
    if c.comissao_status is distinct from 'pago' then
      raise exception 'Só é possível estornar positivações já pagas';
    end if;
    select * into b from public.crm_positivacao_beneficiario(c.indicador_user_id);
    v_valor := -coalesce(c.comissao_valor, 0);
    v_fim := public.crm_positivacao_periodo_fim(v_hoje);
    v_ini := ((v_fim - interval '1 month')::date + 1);
    v_det := jsonb_build_array(jsonb_build_object(
      'client_id', c.id, 'cliente', c.nome, 'valor', v_valor, 'motivo', trim(p_motivo), 'estornado_em', v_hoje));

    update public.crm_clients set comissao_status = 'estornada', comissao_motivo = trim(p_motivo),
           comissao_decisao_em = now(), comissao_decisao_por = v_email
     where id = p_client_id;

    insert into public.comissoes_mensais
      (empresa_id, colaborador_nome, data_inicio, data_fim, fonte, valor_total, pedidos_count,
       confirmado, confirmado_em, confirmado_por, detalhes)
    values (b.empresa_id, b.nome, v_ini, v_fim, 'POSITIVACAO_ESTORNO', v_valor, 1, true, now(), v_email, v_det)
    on conflict (empresa_id, colaborador_nome, data_inicio, data_fim, fonte) do update
      set valor_total = public.comissoes_mensais.valor_total + excluded.valor_total,
          pedidos_count = public.comissoes_mensais.pedidos_count + 1,
          detalhes = coalesce(public.comissoes_mensais.detalhes, '[]'::jsonb) || excluded.detalhes;
  end if;
  perform set_config('app.positivacao_bypass', 'off', true);
end $$;

-- ── RH -> CRM (limpa também as colunas novas) ────────────────────────────
create or replace function public.comissoes_positivacao_to_crm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.positivacao_bypass', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.fonte = 'POSITIVACAO' and new.confirmado is distinct from old.confirmado then
    perform set_config('app.positivacao_bypass', 'on', true);
    if new.confirmado then
      update public.crm_clients c
         set comissao_status = 'pago', comissao_pago_em = (now() at time zone 'America/Sao_Paulo')::date
       where c.comissao_status = 'pendente' and c.comissao_periodo_fim = new.data_fim
         and exists (select 1 from public.crm_positivacao_beneficiario(c.indicador_user_id) b
                      where b.nome = new.colaborador_nome and b.empresa_id = new.empresa_id);
    else
      update public.crm_clients c
         set comissao_status = 'pendente', comissao_pago_em = null
       where c.comissao_status = 'pago' and c.comissao_periodo_fim = new.data_fim
         and exists (select 1 from public.crm_positivacao_beneficiario(c.indicador_user_id) b
                      where b.nome = new.colaborador_nome and b.empresa_id = new.empresa_id);
    end if;
    perform set_config('app.positivacao_bypass', 'off', true);
    return new;
  end if;

  if tg_op = 'DELETE' and old.fonte = 'POSITIVACAO' then
    -- RH devolveu: os clientes ainda em aberto voltam a "elegível, aguardando o Administrador".
    -- Recusadas e estornadas são decisões finais e ficam como estão.
    perform set_config('app.positivacao_bypass', 'on', true);
    update public.crm_clients c set
      positivado = false, positivado_em = null, comissao_status = null,
      comissao_valor = (select valor_comissao from public.positivacao_config limit 1),
      comissao_pago_em = null, positivado_por = null, positivacao_pedidos = null,
      positivacao_total = null, comissao_periodo_fim = null,
      comissao_motivo = null, comissao_decisao_em = null, comissao_decisao_por = null
     where c.comissao_status in ('pendente', 'pago') and c.comissao_periodo_fim = old.data_fim
       and exists (select 1 from public.crm_positivacao_beneficiario(c.indicador_user_id) b
                    where b.nome = old.colaborador_nome and b.empresa_id = old.empresa_id);
    perform set_config('app.positivacao_bypass', 'off', true);
    return old;
  end if;

  return coalesce(new, old);
end $$;

-- ── RLS: comissoes_mensais só para membros do RH ─────────────────────────
-- Era "qualquer sessão autenticada do projeto" (Portal, Compras...). O CRM só toca nesta
-- tabela pelas funções SECURITY DEFINER acima. Mesmo padrão da migration do portal
-- (00000000000003_rls_rh_comercial_hardening), que deixou esta tabela de fora.
alter policy "allow all comissoes" on public.comissoes_mensais
  using (public.rh_is_member()) with check (public.rh_is_member());

-- ── Permissões ───────────────────────────────────────────────────────────
revoke execute on function public.crm_confirmar_positivacoes(uuid[])        from public, anon;
revoke execute on function public.rh_positivacao_decidir(uuid, text, text)  from public, anon;
revoke execute on function public.crm_positivacao_elegiveis_count()         from public, anon;
revoke execute on function public.crm_positivacao_progresso(uuid, uuid)     from public, anon;
grant  execute on function public.crm_confirmar_positivacoes(uuid[])        to authenticated;
grant  execute on function public.rh_positivacao_decidir(uuid, text, text)  to authenticated;
grant  execute on function public.crm_positivacao_elegiveis_count()         to authenticated;
grant  execute on function public.crm_positivacao_progresso(uuid, uuid)     to authenticated;
