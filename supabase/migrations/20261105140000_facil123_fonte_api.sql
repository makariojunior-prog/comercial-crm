-- Fácil 123 (API) passa a poder alimentar atacado_pedidos (troca de fonte da planilha).
--
-- 1) atacado_pedidos_api.criado_em: Invoice.created_at. É a data estável da venda (updated_at muda a
--    cada edição e emitted_at é a data de emissão fiscal, que pode ser futura/data de entrega).
-- 2) sync_atacado_api devolve os ids que mudaram (a Edge Function sync-facil123 os repassa ao
--    sync-atacado) e só troca os itens de vendas novas ou cujo valor/updated_at mudou.
-- 3) sync_atacado_pedidos ganha p_manter_emissao: com a API, a data_emissao já gravada não é
--    reescrita (o histórico veio da planilha); linhas novas usam criado_em.
-- 4) atacado_config.fonte_pedidos = 'planilha' | 'api' escolhe quem alimenta atacado_pedidos.

alter table public.atacado_pedidos_api add column if not exists criado_em timestamptz;

insert into public.atacado_config (key, value)
values ('fonte_pedidos', to_jsonb('planilha'::text))
on conflict (key) do nothing;

-- ── Gravação em lote: pedidos + itens (staging) ──────────────────────────
create or replace function public.sync_atacado_api(p_empresa text, p_pedidos jsonb, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins int; v_upd int; v_itens int := 0; v_ids bigint[]; v_ids_itens bigint[];
begin
  if p_empresa not in ('LUMAR', 'CANTINA') then
    raise exception 'empresa inválida: %', p_empresa;
  end if;

  with src as (
    select x.*
    from jsonb_to_recordset(p_pedidos) as x(
      id_venda bigint, numero_pedido integer, cliente_id bigint, cliente_nome text,
      valor numeric, status_erp text, etapa text, operacao text,
      emitido_em timestamptz, atualizacao timestamptz, criado_em timestamptz)
    where x.id_venda is not null
  ),
  old as (
    select t.id_venda, t.atualizacao, t.valor
    from public.atacado_pedidos_api t
    where t.id_venda in (select id_venda from src)
  ),
  up as (
    insert into public.atacado_pedidos_api as t
      (id_venda, empresa, numero_pedido, cliente_id, cliente_nome, valor,
       status_erp, etapa, operacao, emitido_em, atualizacao, criado_em, sincronizado_em)
    select s.id_venda, p_empresa, s.numero_pedido, s.cliente_id, s.cliente_nome,
           coalesce(s.valor, 0), s.status_erp, s.etapa, s.operacao, s.emitido_em,
           s.atualizacao, s.criado_em, now()
    from src s
    on conflict (id_venda) do update set
      empresa = excluded.empresa, numero_pedido = excluded.numero_pedido,
      cliente_id = excluded.cliente_id, cliente_nome = excluded.cliente_nome,
      valor = excluded.valor, status_erp = excluded.status_erp, etapa = excluded.etapa,
      operacao = excluded.operacao, emitido_em = excluded.emitido_em,
      atualizacao = excluded.atualizacao, criado_em = coalesce(excluded.criado_em, t.criado_em),
      sincronizado_em = now()
    where (t.empresa, t.numero_pedido, t.cliente_id, t.cliente_nome, t.valor, t.status_erp,
           t.etapa, t.operacao, t.emitido_em, t.atualizacao, t.criado_em)
      is distinct from
          (excluded.empresa, excluded.numero_pedido, excluded.cliente_id, excluded.cliente_nome,
           excluded.valor, excluded.status_erp, excluded.etapa, excluded.operacao,
           excluded.emitido_em, excluded.atualizacao, coalesce(excluded.criado_em, t.criado_em))
    returning t.id_venda, (xmax = 0) as inserido
  )
  select count(*) filter (where u.inserido),
         count(*) filter (where not u.inserido),
         coalesce(array_agg(u.id_venda), '{}'),
         -- itens só são trocados para venda nova ou com valor/updated_at diferente do que estava gravado
         coalesce(array_agg(u.id_venda) filter (where u.inserido or exists (
           select 1 from old o join src s on s.id_venda = o.id_venda
           where o.id_venda = u.id_venda
             and (o.atualizacao is distinct from s.atualizacao
               or o.valor is distinct from coalesce(s.valor, 0)))), '{}')
    into v_ins, v_upd, v_ids, v_ids_itens
  from up u;

  if coalesce(array_length(v_ids_itens, 1), 0) > 0 then
    delete from public.atacado_pedido_itens where id_venda = any (v_ids_itens);
    insert into public.atacado_pedido_itens
      (id_venda, linha, empresa, product_id, produto_nome, quantidade, preco_unit, total)
    select i.id_venda, i.linha, p_empresa, i.product_id, i.produto_nome,
           coalesce(i.quantidade, 0), i.preco_unit, i.total
    from jsonb_to_recordset(p_itens) as i(
      id_venda bigint, linha integer, product_id bigint, produto_nome text,
      quantidade numeric, preco_unit numeric, total numeric)
    where i.id_venda = any (v_ids_itens) and i.linha is not null
    on conflict (id_venda, linha) do nothing;
    get diagnostics v_itens = row_count;
  end if;

  return jsonb_build_object('inseridos', v_ins, 'atualizados', v_upd, 'itens', v_itens,
                            'recebidos', jsonb_array_length(p_pedidos), 'ids', to_jsonb(v_ids));
end;
$$;
revoke all on function public.sync_atacado_api(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_atacado_api(text, jsonb, jsonb) to service_role;

-- ── sync_atacado_pedidos com p_manter_emissao ────────────────────────────
-- Igual à versão de 20261006120000, exceto: p_manter_emissao = true preserva a data_emissao
-- já gravada (só linha nova usa a enviada).
drop function if exists public.sync_atacado_pedidos(jsonb);

create or replace function public.sync_atacado_pedidos(p_rows jsonb, p_manter_emissao boolean default false)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with src as (
    select
      x.id_venda,
      x.numero_pedido,
      coalesce(x.cliente_id, t.cliente_id) as cliente_id,
      x.cliente_nome,
      coalesce(x.valor, 0) as valor,
      -- tipo e ocorrencia: classificação manual preservada quando o sync não traz. Em linha nova 'PEDIDO'.
      coalesce(x.tipo, t.tipo, 'PEDIDO') as tipo,
      coalesce(x.ocorrencia, t.ocorrencia) as ocorrencia,
      case when p_manter_emissao then coalesce(t.data_emissao, x.data_emissao) else x.data_emissao end as data_emissao,
      coalesce(x.atualizacao, x.data_emissao, t.atualizacao, now()) as atualizacao,
      -- o vínculo já gravado (manual ou por de-para) vence o casamento por nome
      coalesce(t.crm_client_id, x.crm_client_id) as crm_client_id,
      (t.id_venda is not null) as existe,
      t.numero_pedido as db_numero_pedido,
      t.cliente_id    as db_cliente_id,
      t.cliente_nome  as db_cliente_nome,
      t.valor         as db_valor,
      t.tipo          as db_tipo,
      t.ocorrencia    as db_ocorrencia,
      t.data_emissao  as db_data_emissao,
      t.atualizacao   as db_atualizacao,
      t.crm_client_id as db_crm_client_id
    from jsonb_to_recordset(p_rows) as x(
      id_venda      bigint,
      numero_pedido integer,
      cliente_id    bigint,
      cliente_nome  text,
      crm_client_id uuid,
      valor         numeric,
      tipo          text,
      ocorrencia    text,
      data_emissao  timestamptz,
      atualizacao   timestamptz
    )
    left join public.atacado_pedidos t on t.id_venda = x.id_venda
    where x.id_venda is not null
  ),
  ins as (
    insert into public.atacado_pedidos
      (id_venda, numero_pedido, cliente_id, cliente_nome, crm_client_id, valor,
       tipo, ocorrencia, data_emissao, atualizacao, updated_at)
    select s.id_venda, s.numero_pedido, s.cliente_id, s.cliente_nome, s.crm_client_id,
           s.valor, s.tipo, s.ocorrencia, s.data_emissao, s.atualizacao, now()
    from src s
    where not s.existe
    on conflict (id_venda) do nothing
    returning 1
  ),
  upd as (
    update public.atacado_pedidos t set
      numero_pedido = s.numero_pedido,
      cliente_id    = s.cliente_id,
      cliente_nome  = s.cliente_nome,
      crm_client_id = s.crm_client_id,
      valor         = s.valor,
      tipo          = s.tipo,
      ocorrencia    = s.ocorrencia,
      data_emissao  = s.data_emissao,
      atualizacao   = s.atualizacao,
      updated_at    = now()
    from src s
    where t.id_venda = s.id_venda
      and s.existe
      and (
           s.numero_pedido is distinct from s.db_numero_pedido
        or s.cliente_id    is distinct from s.db_cliente_id
        or s.cliente_nome  is distinct from s.db_cliente_nome
        or s.valor         is distinct from s.db_valor
        or s.tipo          is distinct from s.db_tipo
        or s.ocorrencia    is distinct from s.db_ocorrencia
        or s.data_emissao  is distinct from s.db_data_emissao
        or s.atualizacao   is distinct from s.db_atualizacao
        or s.crm_client_id is distinct from s.db_crm_client_id
      )
    returning 1
  )
  select jsonb_build_object(
    'recebidos',   (select count(*) from src),
    'inseridos',   (select count(*) from ins),
    'atualizados', (select count(*) from upd),
    'sem_mudanca', (select count(*) from src) - (select count(*) from ins) - (select count(*) from upd)
  );
$$;

revoke all on function public.sync_atacado_pedidos(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_atacado_pedidos(jsonb, boolean) to service_role;

-- ── Pendências API → atacado_pedidos ─────────────────────────────────────
-- Ids da API (janela p_desde em diante, mais qualquer venda que já exista em atacado_pedidos)
-- que ainda não estão em atacado_pedidos ou estão diferentes: número, cliente, valor,
-- atualização ou cancelamento. É o que o sync-atacado processa quando fonte_pedidos = 'api';
-- como a comparação é feita aqui, o sync se corrige sozinho se uma execução anterior falhar.
create or replace function public.atacado_api_pendentes(p_desde timestamptz default '2026-02-23T00:00:00-03:00')
returns bigint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(a.id_venda order by a.atualizacao), '{}')
  from public.atacado_pedidos_api a
  left join public.atacado_pedidos t on t.id_venda = a.id_venda
  where (a.atualizacao >= p_desde or t.id_venda is not null)
    and not (a.cliente_id = any (coalesce((
          select array_agg(x::bigint)
          from public.atacado_config c, jsonb_array_elements_text(c.value) x
          where c.key = 'ids_ignorados' and jsonb_typeof(c.value) = 'array'), '{}')))
    and (
         t.id_venda is null
      or a.numero_pedido is distinct from t.numero_pedido
      or a.cliente_id    is distinct from t.cliente_id
      or a.cliente_nome  is distinct from t.cliente_nome
      or a.valor         is distinct from t.valor
      or a.atualizacao   is distinct from t.atualizacao
      or (a.status_erp = 'canceled' and t.tipo is distinct from 'CANCELADO')
    );
$$;
revoke all on function public.atacado_api_pendentes(timestamptz) from public, anon, authenticated;
grant execute on function public.atacado_api_pendentes(timestamptz) to service_role;
