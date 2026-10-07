-- Upsert dos pedidos do atacado com detecção de mudança dentro do banco.
--
-- Contexto (medido em 01/09/2026): um gatilho do Google Apps Script chama a
-- Edge Function sync-atacado ~1.444x por dia (uma vez por minuto). A função
-- reescrevia as 6.199 linhas da planilha a cada chamada, em lotes de 50 —
-- ~180 mil POSTs/dia contra /rest/v1/atacado_pedidos, 92% de todo o tráfego
-- do projeto. Como a Edge Function roda em us-east-1 e o banco em sa-east-1,
-- cada request atravessa regiões pelo endpoint público e conta como egress.
--
-- Aqui o diff acontece no servidor: a Edge Function manda o lote inteiro em
-- UMA chamada e o WHERE descarta as linhas idênticas, então linha sem mudança
-- não gera escrita, não gera WAL e não gera egress.
--
-- Escrito como uma única instrução com CTEs (sem tabela temporária) para que
-- a função seja reentrante — com `create temp table ... on commit drop`, duas
-- chamadas na mesma transação falhavam com "_src already exists".

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
      x.cliente_nome,
      coalesce(x.valor, 0) as valor,
      coalesce(x.tipo, 'PEDIDO') as tipo,
      x.ocorrencia,
      x.data_emissao,
      -- atualizacao é NOT NULL: planilha > emissão > o que já está gravado.
      -- Nunca now(), que faria a linha "mudar" a cada sync.
      coalesce(x.atualizacao, x.data_emissao, t.atualizacao, now()) as atualizacao,
      -- só sobrescreve o vínculo quando o sync achou match; senão preserva
      -- o que foi definido manualmente na tela
      coalesce(x.crm_client_id, t.crm_client_id) as crm_client_id,
      (t.id_venda is not null) as existe,
      t.numero_pedido as db_numero_pedido,
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
      (id_venda, numero_pedido, cliente_nome, crm_client_id, valor, tipo,
       ocorrencia, data_emissao, atualizacao, updated_at)
    select s.id_venda, s.numero_pedido, s.cliente_nome, s.crm_client_id,
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

comment on function public.sync_atacado_pedidos(jsonb) is
  'Upsert em lote dos pedidos do atacado vindos da planilha de recepcao. Grava so as linhas que mudaram; usada pela Edge Function sync-atacado (service_role).';


-- Mesma ideia para a aba REG-LUMAR, que traz os campos preenchidos pela
-- atendente. Só atualiza linhas existentes (nunca insere) e só quando o valor
-- da planilha difere do gravado. Campo ausente chega como null e é ignorado —
-- não apaga o que está no banco.
create or replace function public.sync_atacado_reg_lumar(p_rows jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with src as (
    select x.id_venda, x.data_entrega, x.turno, x.entregador, x.tipo, x.ocorrencia
    from jsonb_to_recordset(p_rows) as x(
      id_venda     bigint,
      data_entrega date,
      turno        text,
      entregador   text,
      tipo         text,
      ocorrencia   text
    )
    where x.id_venda is not null
  ),
  datas as (
    select count(*) as n
    from src r
    join public.atacado_pedidos t on t.id_venda = r.id_venda
    where r.data_entrega is not null and t.data_entrega is distinct from r.data_entrega
  ),
  upd as (
    update public.atacado_pedidos t set
      data_entrega = coalesce(r.data_entrega, t.data_entrega),
      turno        = coalesce(r.turno,        t.turno),
      entregador   = coalesce(r.entregador,   t.entregador),
      tipo         = coalesce(r.tipo,         t.tipo),
      ocorrencia   = coalesce(r.ocorrencia,   t.ocorrencia),
      updated_at   = now()
    from src r
    where t.id_venda = r.id_venda
      and (
           (r.data_entrega is not null and t.data_entrega is distinct from r.data_entrega)
        or (r.turno        is not null and t.turno        is distinct from r.turno)
        or (r.entregador   is not null and t.entregador   is distinct from r.entregador)
        or (r.tipo         is not null and t.tipo         is distinct from r.tipo)
        or (r.ocorrencia   is not null and t.ocorrencia   is distinct from r.ocorrencia)
      )
    returning 1
  )
  select jsonb_build_object(
    'recebidos',       (select count(*) from src),
    'atualizados',     (select count(*) from upd),
    'datas_definidas', (select n from datas),
    'sem_mudanca',     (select count(*) from src) - (select count(*) from upd)
  );
$$;

revoke all on function public.sync_atacado_reg_lumar(jsonb) from public, anon, authenticated;
grant execute on function public.sync_atacado_reg_lumar(jsonb) to service_role;

comment on function public.sync_atacado_reg_lumar(jsonb) is
  'Aplica os campos da aba REG-LUMAR nos pedidos existentes. Grava so o que mudou; usada pela Edge Function sync-atacado (service_role).';
