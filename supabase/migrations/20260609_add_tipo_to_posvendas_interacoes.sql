-- Adicionar coluna tipo a crm_posvendas_interacoes
ALTER TABLE crm_posvendas_interacoes
  ADD COLUMN tipo smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN crm_posvendas_interacoes.tipo IS '1=Pós-venda, 2=Recompra, 3=Aguardando';
