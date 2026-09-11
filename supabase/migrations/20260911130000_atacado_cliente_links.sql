-- =====================================================================
-- Vínculo estável entre o cliente do ERP e o cadastro do CRM
--
-- Problema que este migration resolve
-- -----------------------------------
-- `atacado_pedidos.crm_client_id` era preenchido SÓ por casamento de
-- nome (sync-atacado). Só que o nome que o ERP manda na planilha de
-- recepção não é estável nem bate com o cadastro do CRM:
--
--   id_cliente 1199670 →  "SILVANA CORDEIRO DA SILVA LIMA "
--                      →  "SILVANA CORDEIRO DA SILVA LIMA ( PANIF E LANCH NOVA OPÇÃO) (Rota Garavelo I)"
--   id_cliente 1197992 →  " JOSÉ DIAS"
--                      →  "MERCEARIA IDEAL / JOSÉ DIAS"
--
-- Na amostra da planilha, 39 clientes do ERP aparecem com 2+ grafias
-- (815 pedidos / ~9% do faturamento) e 76 nomes trazem o nome fantasia
-- DEPOIS do nome do titular ("GISLAINE LUCAS OLIVEIRA - MERCADINHO ZÉ
-- PAULISTA"), que é justamente como o cliente está cadastrado no CRM.
-- Resultado: parte dos pedidos do mesmo cliente ficava sem vínculo e o
-- módulo Revenda mostrava total/ticket/tendência incompletos.
--
-- `id_cliente` (ERP) NÃO muda. Esta tabela guarda o de-para por esse id,
-- para que o vínculo sobreviva a qualquer mudança de nome no ERP e possa
-- ser corrigido à mão pela tela de Revenda.
-- =====================================================================

-- `cliente_id` já existe no schema mas nunca era gravado pelo sync.
ALTER TABLE public.atacado_pedidos
  ADD COLUMN IF NOT EXISTS cliente_id bigint;

-- A coluna ja existia, mas com FK para atacado_clientes(id) — tabela legada,
-- hoje vazia, herdada de antes da migracao para crm_clients. Como o valor
-- gravado aqui e o id_cliente do ERP, que nao tem linha correspondente la,
-- todo upsert era rejeitado com 23503 — e por isso a coluna ficou nula nos
-- 6.527 pedidos. A FK so conseguia recusar escrita, nunca proteger nada.
ALTER TABLE public.atacado_pedidos
  DROP CONSTRAINT IF EXISTS atacado_pedidos_cliente_id_fkey;

CREATE INDEX IF NOT EXISTS atacado_pedidos_cliente_id_idx
  ON public.atacado_pedidos (cliente_id);

-- A planilha de recepção não tem coluna `tipo`. Com default no banco, o
-- sync pode omitir a coluna no upsert e parar de reverter para 'PEDIDO'
-- as classificações manuais (BONIFICACAO / CANCELADO) a cada execução.
ALTER TABLE public.atacado_pedidos
  ALTER COLUMN tipo SET DEFAULT 'PEDIDO';

CREATE TABLE IF NOT EXISTS public.atacado_cliente_links (
  cliente_id    bigint      PRIMARY KEY,                  -- id_cliente do ERP
  crm_client_id uuid        NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  cliente_nome  text,                                     -- última grafia vista no ERP (referência)
  origem        text        NOT NULL DEFAULT 'AUTO',      -- AUTO = casado por nome | MANUAL = vinculado na tela de Revenda
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atacado_cliente_links_crm_client_id_idx
  ON public.atacado_cliente_links (crm_client_id);

ALTER TABLE public.atacado_cliente_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_atacado_cliente_links" ON public.atacado_cliente_links;
CREATE POLICY "auth_all_atacado_cliente_links" ON public.atacado_cliente_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.atacado_cliente_links IS
  'De-para id_cliente (ERP) → crm_clients.id. Chave estável do vínculo dos pedidos do atacado com o cadastro do CRM; origem MANUAL tem prioridade e nunca é sobrescrita pelo sync.';
COMMENT ON COLUMN public.atacado_pedidos.cliente_id IS
  'id_cliente do ERP, vindo da planilha de recepção. Chave estável usada para vincular o pedido ao cadastro do CRM.';

-- Aplica o de-para de clientes do ERP aos pedidos.
--
-- Existe porque o upsert em lote do PostgREST monta UMA instrucao com a uniao
-- das colunas do lote: uma linha que omite `crm_client_id` recebe NULL
-- explicito e perde o vinculo que ja tinha. Por isso o sync nao grava mais
-- crm_client_id no upsert — grava so o de-para e chama esta funcao, que
-- nunca apaga vinculo: so escreve onde o de-para tem resposta.
CREATE OR REPLACE FUNCTION public.aplicar_vinculos_atacado()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  afetados integer;
BEGIN
  UPDATE atacado_pedidos p
     SET crm_client_id = l.crm_client_id,
         updated_at    = now()
    FROM atacado_cliente_links l
   WHERE p.cliente_id = l.cliente_id
     AND p.crm_client_id IS DISTINCT FROM l.crm_client_id;
  GET DIAGNOSTICS afetados = ROW_COUNT;
  RETURN afetados;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_vinculos_atacado() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_vinculos_atacado() TO authenticated, service_role;

COMMENT ON FUNCTION public.aplicar_vinculos_atacado() IS
  'Propaga atacado_cliente_links para atacado_pedidos.crm_client_id. Nunca apaga vinculo: so escreve onde o de-para tem resposta.';
