-- Integração com a API do Fácil 123 (GraphQL): vendas e itens do pedido.
--
-- Fase 1 (execução em paralelo com a planilha): a API grava só em tabelas
-- próprias. `atacado_pedidos` continua vindo da planilha até a conferência
-- (atacado_conferencia_api) mostrar que os dois lados batem.
--
--   atacado_pedidos_api   cabeçalho da venda vindo da API (staging da fase 1)
--   atacado_pedido_itens  produtos de cada venda (chave: id_venda + linha)
--
-- Estoque NÃO vem do Fácil 123: lá ele é separado por licenciado (Lumar × Cantina)
-- e a câmara fria é única. O estoque será controlado no futuro app de Produção.
--
-- id_venda = Invoice.id da API; numero_pedido = Invoice.sequential
-- (15xxx = Lumar, 30xxx = Cantina em Casa).

-- ── Pedidos (staging) ────────────────────────────────────────────────────
create table if not exists public.atacado_pedidos_api (
  id_venda        bigint primary key,
  empresa         text not null check (empresa in ('LUMAR', 'CANTINA')),
  numero_pedido   integer,
  cliente_id      bigint,
  cliente_nome    text,
  valor           numeric not null default 0,
  status_erp      text,          -- pending | authorized | canceled | ...
  etapa           text,          -- raia do Fácil 123: Venda | Orçamento | ...
  operacao        text,          -- natureza da operação (ex.: Venda - revenda / simples)
  emitido_em      timestamptz,   -- Invoice.emitted_at (pode ser data futura/entrega)
  atualizacao     timestamptz,   -- Invoice.updated_at
  sincronizado_em timestamptz not null default now()
);
create index if not exists atacado_pedidos_api_empresa_atualiz_idx
  on public.atacado_pedidos_api (empresa, atualizacao desc);
create index if not exists atacado_pedidos_api_numero_idx
  on public.atacado_pedidos_api (empresa, numero_pedido);

-- ── Itens ────────────────────────────────────────────────────────────────
create table if not exists public.atacado_pedido_itens (
  id_venda     bigint not null,
  linha        integer not null,
  empresa      text not null check (empresa in ('LUMAR', 'CANTINA')),
  product_id   bigint,
  produto_nome text,
  quantidade   numeric not null default 0,
  preco_unit   numeric,
  total        numeric,
  primary key (id_venda, linha)
);
create index if not exists atacado_pedido_itens_produto_idx
  on public.atacado_pedido_itens (empresa, product_id);

-- ── Acesso: leitura para membros do Comercial; escrita só pelo backend ───
alter table public.atacado_pedidos_api  enable row level security;
alter table public.atacado_pedido_itens enable row level security;

drop policy if exists atacado_pedidos_api_select  on public.atacado_pedidos_api;
drop policy if exists atacado_pedido_itens_select on public.atacado_pedido_itens;
create policy atacado_pedidos_api_select  on public.atacado_pedidos_api
  for select to authenticated using ((select crm_is_member()));
create policy atacado_pedido_itens_select on public.atacado_pedido_itens
  for select to authenticated using ((select crm_is_member()));

revoke all on public.atacado_pedidos_api, public.atacado_pedido_itens
  from public, anon, authenticated;
grant select on public.atacado_pedidos_api, public.atacado_pedido_itens
  to authenticated;
grant all on public.atacado_pedidos_api, public.atacado_pedido_itens
  to service_role;

-- ── Segredo do cron (padrão do crm_noticias_cron_secret) ─────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'facil123_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'facil123_cron_secret');
  end if;
end $$;

create or replace function public.crm_facil123_cron_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'facil123_cron_secret' limit 1;
$$;
revoke all on function public.crm_facil123_cron_secret() from public, anon, authenticated;
grant execute on function public.crm_facil123_cron_secret() to service_role;

-- ── Gravação em lote: pedidos + itens ────────────────────────────────────
-- Só mexe no que mudou: o cabeçalho é comparado campo a campo e os itens de uma
-- venda são trocados apenas quando a venda entrou agora ou foi atualizada no
-- Fácil 123 (updated_at). Evita reescrever milhares de linhas a cada execução.
-- p_itens: [{id_venda, linha, product_id, produto_nome, quantidade, preco_unit, total}]
create or replace function public.sync_atacado_api(p_empresa text, p_pedidos jsonb, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins int; v_upd int; v_itens int := 0; v_ids bigint[];
begin
  if p_empresa not in ('LUMAR', 'CANTINA') then
    raise exception 'empresa inválida: %', p_empresa;
  end if;

  with src as (
    select x.*
    from jsonb_to_recordset(p_pedidos) as x(
      id_venda bigint, numero_pedido integer, cliente_id bigint, cliente_nome text,
      valor numeric, status_erp text, etapa text, operacao text,
      emitido_em timestamptz, atualizacao timestamptz)
    where x.id_venda is not null
  ),
  up as (
    insert into public.atacado_pedidos_api as t
      (id_venda, empresa, numero_pedido, cliente_id, cliente_nome, valor,
       status_erp, etapa, operacao, emitido_em, atualizacao, sincronizado_em)
    select s.id_venda, p_empresa, s.numero_pedido, s.cliente_id, s.cliente_nome,
           coalesce(s.valor, 0), s.status_erp, s.etapa, s.operacao, s.emitido_em,
           s.atualizacao, now()
    from src s
    on conflict (id_venda) do update set
      empresa = excluded.empresa, numero_pedido = excluded.numero_pedido,
      cliente_id = excluded.cliente_id, cliente_nome = excluded.cliente_nome,
      valor = excluded.valor, status_erp = excluded.status_erp, etapa = excluded.etapa,
      operacao = excluded.operacao, emitido_em = excluded.emitido_em,
      atualizacao = excluded.atualizacao, sincronizado_em = now()
    where (t.empresa, t.numero_pedido, t.cliente_id, t.cliente_nome, t.valor, t.status_erp,
           t.etapa, t.operacao, t.emitido_em, t.atualizacao)
      is distinct from
          (excluded.empresa, excluded.numero_pedido, excluded.cliente_id, excluded.cliente_nome,
           excluded.valor, excluded.status_erp, excluded.etapa, excluded.operacao,
           excluded.emitido_em, excluded.atualizacao)
    returning t.id_venda, (xmax = 0) as inserido
  )
  select count(*) filter (where inserido), count(*) filter (where not inserido),
         coalesce(array_agg(id_venda), '{}')
    into v_ins, v_upd, v_ids
  from up;

  -- itens: troca por completo as vendas que entraram ou mudaram agora
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    delete from public.atacado_pedido_itens where id_venda = any (v_ids);
    insert into public.atacado_pedido_itens
      (id_venda, linha, empresa, product_id, produto_nome, quantidade, preco_unit, total)
    select i.id_venda, i.linha, p_empresa, i.product_id, i.produto_nome,
           coalesce(i.quantidade, 0), i.preco_unit, i.total
    from jsonb_to_recordset(p_itens) as i(
      id_venda bigint, linha integer, product_id bigint, produto_nome text,
      quantidade numeric, preco_unit numeric, total numeric)
    where i.id_venda = any (v_ids) and i.linha is not null
    on conflict (id_venda, linha) do nothing;
    get diagnostics v_itens = row_count;
  end if;

  return jsonb_build_object('inseridos', v_ins, 'atualizados', v_upd, 'itens', v_itens,
                            'recebidos', jsonb_array_length(p_pedidos));
end;
$$;
revoke all on function public.sync_atacado_api(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_atacado_api(text, jsonb, jsonb) to service_role;

-- ── Conferência planilha × API ───────────────────────────────────────────
-- Compara, desde p_desde, as vendas que a planilha trouxe (atacado_pedidos) com
-- as da API (atacado_pedidos_api), pela chave id_venda. Clientes da lista
-- `ids_ignorados` (atacado_config) ficam fora, como no sync da planilha.
create or replace function public.atacado_conferencia_api(p_desde timestamptz default now() - interval '14 days')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_ign bigint[]; r jsonb;
begin
  if not (select crm_is_member()) then
    raise exception 'sem acesso';
  end if;

  select coalesce(array_agg(x::bigint), '{}') into v_ign
  from atacado_config c, jsonb_array_elements_text(c.value) x
  where c.key = 'ids_ignorados' and jsonb_typeof(c.value) = 'array';

  with pl as (
    select id_venda, numero_pedido, cliente_nome, valor, atualizacao
    from atacado_pedidos
    where id_venda < 90000000                       -- fora linhas de teste
      and atualizacao >= p_desde
      and (cliente_id is null or cliente_id <> all (v_ign))
  ),
  ap as (
    select id_venda, numero_pedido, cliente_nome, valor, atualizacao, empresa, status_erp, etapa
    from atacado_pedidos_api
    where atualizacao >= p_desde
      and (cliente_id is null or cliente_id <> all (v_ign))
  ),
  so_planilha as (
    select p.* from pl p where not exists (select 1 from atacado_pedidos_api a where a.id_venda = p.id_venda)
  ),
  so_api as (
    select a.* from ap a where not exists (select 1 from atacado_pedidos t where t.id_venda = a.id_venda)
  ),
  diverge as (
    select p.id_venda, p.numero_pedido, p.cliente_nome, p.valor as valor_planilha, a.valor as valor_api,
           a.status_erp, a.empresa
    from pl p join atacado_pedidos_api a using (id_venda)
    where abs(p.valor - a.valor) > 0.005 or p.numero_pedido is distinct from a.numero_pedido
  )
  select jsonb_build_object(
    'desde', p_desde,
    'planilha',        (select count(*) from pl),
    'api',             (select count(*) from ap),
    'so_planilha_n',   (select count(*) from so_planilha),
    'so_api_n',        (select count(*) from so_api),
    'divergentes_n',   (select count(*) from diverge),
    'so_planilha',     (select coalesce(jsonb_agg(to_jsonb(s) order by s.atualizacao desc), '[]') from (select * from so_planilha limit 100) s),
    'so_api',          (select coalesce(jsonb_agg(to_jsonb(s) order by s.atualizacao desc), '[]') from (select * from so_api limit 100) s),
    'divergentes',     (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from (select * from diverge limit 100) s),
    'api_canceladas',  (select count(*) from ap where status_erp = 'canceled'),
    'api_orcamentos',  (select count(*) from ap where etapa = 'Orçamento')
  ) into r;
  return r;
end;
$$;
revoke all on function public.atacado_conferencia_api(timestamptz) from public, anon;
grant execute on function public.atacado_conferencia_api(timestamptz) to authenticated, service_role;
