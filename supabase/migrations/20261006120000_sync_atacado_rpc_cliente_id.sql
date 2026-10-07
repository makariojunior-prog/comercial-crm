-- sync_atacado_pedidos passa a gravar cliente_id (id do cliente no ERP).
--
-- A RPC de 01/09 é anterior ao vínculo por id_cliente (migration
-- 20260911210604_atacado_cliente_links). Sem esta atualização, voltar a usar a
-- RPC faria os pedidos novos entrarem sem cliente_id e o de-para por id_cliente
-- (aplicar_vinculos_atacado) não teria o que casar.
--
-- Também muda a precedência do crm_client_id: o que já está gravado VENCE o que
-- o sync calculou. Antes era o contrário — um casamento por nome sobrescreveria
-- um vínculo manual feito na tela de Revenda. O vínculo por id_cliente continua
-- sendo propagado por aplicar_vinculos_atacado(), que a Edge Function chama
-- depois do lote.

create or replace function public.sync_atacado_pedidos(p_rows jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with src as (
    select
      x.id_venda,
      x.numero_pedido,
      -- id_cliente do ERP: só sobrescreve quando a planilha trouxe
      coalesce(x.cliente_id, t.cliente_id) as cliente_id,
      x.cliente_nome,
      coalesce(x.valor, 0) as valor,
      -- tipo e ocorrencia são classificação manual (UI ou aba REG-LUMAR). A
      -- planilha de recepção não traz essas colunas, então chegam null e o que
      -- está gravado é preservado — antes a RPC reescrevia tudo para 'PEDIDO'
      -- e o módulo Revenda voltava a contar bonificação e cancelado como venda.
      -- Em linha nova vale o default 'PEDIDO'.
      coalesce(x.tipo, t.tipo, 'PEDIDO') as tipo,
      coalesce(x.ocorrencia, t.ocorrencia) as ocorrencia,
      x.data_emissao,
      -- atualizacao é NOT NULL: planilha > emissão > o que já está gravado.
      -- Nunca now(), que faria a linha "mudar" a cada sync.
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
  -- turno e entregador NÃO entram aqui: são gerenciados pela atendente
  -- (via UI ou aba REG-LUMAR) e seriam apagados pelo sync do ERP.
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
      -- `is distinct from` trata NULL corretamente: NULL = NULL não é mudança
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

revoke all on function public.sync_atacado_pedidos(jsonb) from public, anon, authenticated;
grant execute on function public.sync_atacado_pedidos(jsonb) to service_role;
