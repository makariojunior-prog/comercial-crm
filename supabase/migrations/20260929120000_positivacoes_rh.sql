-- Positivações Atacado × RH
-- Spec: docs/superpowers/specs/2026-09-29-positivacoes-rh-design.md
--
-- Fluxo: Administrador confirma (RPC) -> linha em comissoes_mensais (fonte POSITIVACAO,
-- confirmado=false) -> RH confirma -> trigger devolve "pago" ao CRM.

-- ── Colunas ──────────────────────────────────────────────────────────────
alter table public.crm_clients
  add column if not exists indicador_user_id   uuid references public.crm_users(id) on delete set null,
  add column if not exists positivado_por      uuid,
  add column if not exists positivacao_pedidos integer,
  add column if not exists positivacao_total   numeric,
  add column if not exists comissao_periodo_fim date;

alter table public.comissoes_mensais
  add column if not exists detalhes jsonb;

-- Backfill do indicador por ID (nome normalizado: sem espaços duplicados, sem caixa)
update public.crm_clients c
   set indicador_user_id = u.id
  from public.crm_users u
 where c.indicador_user_id is null
   and c.indicador is not null and c.indicador <> ''
   and upper(regexp_replace(trim(u.nome), '\s+', ' ', 'g')) = upper(regexp_replace(trim(c.indicador), '\s+', ' ', 'g'));

create index if not exists crm_clients_indicador_user_id_idx on public.crm_clients (indicador_user_id);

-- ── Helpers ──────────────────────────────────────────────────────────────
-- Fechamento do RH: dia 26 -> dia 25. Dia >= 26 fecha no dia 25 do mês seguinte.
create or replace function public.crm_positivacao_periodo_fim(d date)
returns date language sql immutable as $$
  select case
    when extract(day from d) >= 26
      then (date_trunc('month', d::timestamp) + interval '1 month' + interval '24 days')::date
    else (date_trunc('month', d::timestamp) + interval '24 days')::date
  end
$$;

-- Beneficiário no RH: usuário do CRM -> colaborador (nome/empresa). Sem vínculo, usa o nome do CRM.
create or replace function public.crm_positivacao_beneficiario(p_user uuid)
returns table (nome text, empresa_id text, vinculado boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(co.nome, u.nome), coalesce(co.empresa_id, 'cantina'), co.id is not null
    from public.crm_users u
    left join public.colaboradores co on co.id = u.colaborador_id
   where u.id = p_user
$$;

-- Recalcula a linha agregada do RH (pessoa + período) a partir dos clientes pendentes.
-- Linha já confirmada pelo RH nunca é alterada.
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
           'cliente', nome, 'positivado_em', positivado_em,
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

-- ── Guarda: só Administrador altera campos de positivação/comissão ───────
-- Chamadas sem auth.uid() (edge functions com service role) e os triggers internos
-- (flag de sessão app.positivacao_bypass) passam.
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
         new.comissao_periodo_fim, new.positivado_por, new.positivacao_pedidos, new.positivacao_total)
        is distinct from
        (old.positivado, old.positivado_em, old.comissao_status, old.comissao_valor, old.comissao_pago_em,
         old.comissao_periodo_fim, old.positivado_por, old.positivacao_pedidos, old.positivacao_total) then
    raise exception 'Somente Administradores podem alterar positivação ou comissão';
  end if;
  return new;
end $$;

drop trigger if exists crm_clients_positivacao_guard on public.crm_clients;
create trigger crm_clients_positivacao_guard
  before insert or update on public.crm_clients
  for each row execute function public.crm_clients_positivacao_guard();

-- ── RPC: confirmar positivação (Administrador) ───────────────────────────
create or replace function public.crm_confirmar_positivacao(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.crm_clients%rowtype;
  v_n integer; v_total numeric;
  b record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim date; v_valor constant numeric := 50;
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

  -- Mesmos filtros da tela (BONIFICACAO/CANCELADO e ignorados fora)
  select count(*), coalesce(sum(valor), 0) into v_n, v_total
    from public.atacado_pedidos
   where crm_client_id = p_client_id and tipo <> 'BONIFICACAO' and tipo <> 'CANCELADO' and ignorado = false;
  if v_n < 3 or v_total < 500 then
    raise exception 'Cliente ainda não atingiu a meta (% pedidos, R$ %)', v_n, v_total;
  end if;

  select * into b from public.crm_positivacao_beneficiario(c.indicador_user_id);

  -- Período já confirmado pelo RH para esta pessoa não recebe novas positivações
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
    positivacao_pedidos = v_n, positivacao_total = v_total, comissao_periodo_fim = v_fim
   where id = p_client_id;
  perform public.crm_positivacao_sync_rh(c.indicador_user_id, v_fim);
  perform set_config('app.positivacao_bypass', 'off', true);

  return jsonb_build_object('periodo_fim', v_fim, 'beneficiario', b.nome, 'vinculado_rh', b.vinculado, 'valor', v_valor);
end $$;

-- ── RPC: desfazer positivação (Administrador, enquanto o RH não confirmou) ─
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
    raise exception 'Só é possível desfazer enquanto o RH ainda não confirmou o pagamento';
  end if;

  perform set_config('app.positivacao_bypass', 'on', true);
  update public.crm_clients set
    positivado = false, positivado_em = null, comissao_status = null, comissao_valor = 50,
    comissao_pago_em = null, positivado_por = null, positivacao_pedidos = null,
    positivacao_total = null, comissao_periodo_fim = null
   where id = p_client_id;
  perform public.crm_positivacao_sync_rh(c.indicador_user_id, c.comissao_periodo_fim);
  perform set_config('app.positivacao_bypass', 'off', true);
end $$;

-- ── RH -> CRM: confirmação/cancelamento no RH reflete nos clientes ───────
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
    -- RH devolveu: os clientes voltam a "elegível, aguardando confirmação do Administrador"
    perform set_config('app.positivacao_bypass', 'on', true);
    update public.crm_clients c set
      positivado = false, positivado_em = null, comissao_status = null, comissao_valor = 50,
      comissao_pago_em = null, positivado_por = null, positivacao_pedidos = null,
      positivacao_total = null, comissao_periodo_fim = null
     where c.comissao_status in ('pendente', 'pago') and c.comissao_periodo_fim = old.data_fim
       and exists (select 1 from public.crm_positivacao_beneficiario(c.indicador_user_id) b
                    where b.nome = old.colaborador_nome and b.empresa_id = old.empresa_id);
    perform set_config('app.positivacao_bypass', 'off', true);
    return old;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists comissoes_positivacao_to_crm on public.comissoes_mensais;
create trigger comissoes_positivacao_to_crm
  after update or delete on public.comissoes_mensais
  for each row execute function public.comissoes_positivacao_to_crm();

-- ── Permissões: RPCs só para usuários logados; helpers só internos ───────
revoke execute on function public.crm_confirmar_positivacao(uuid) from public, anon;
revoke execute on function public.crm_desfazer_positivacao(uuid)  from public, anon;
grant  execute on function public.crm_confirmar_positivacao(uuid) to authenticated;
grant  execute on function public.crm_desfazer_positivacao(uuid)  to authenticated;
revoke execute on function public.crm_positivacao_sync_rh(uuid, date)   from public, anon, authenticated;
revoke execute on function public.crm_positivacao_beneficiario(uuid)    from public, anon, authenticated;
revoke execute on function public.crm_positivacao_periodo_fim(date)     from public, anon, authenticated;
