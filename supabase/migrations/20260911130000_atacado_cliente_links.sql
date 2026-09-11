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
  ADD COLUMN IF NOT EXISTS cliente_id integer;

CREATE INDEX IF NOT EXISTS atacado_pedidos_cliente_id_idx
  ON public.atacado_pedidos (cliente_id);

-- A planilha de recepção não tem coluna `tipo`. Com default no banco, o
-- sync pode omitir a coluna no upsert e parar de reverter para 'PEDIDO'
-- as classificações manuais (BONIFICACAO / CANCELADO) a cada execução.
ALTER TABLE public.atacado_pedidos
  ALTER COLUMN tipo SET DEFAULT 'PEDIDO';

CREATE TABLE IF NOT EXISTS public.atacado_cliente_links (
  cliente_id    integer     PRIMARY KEY,                  -- id_cliente do ERP
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
