-- Melhorias para custos recorrentes
ALTER TABLE frota_custos
ADD COLUMN data_inicio_recorrencia DATE DEFAULT NULL,
ADD COLUMN data_fim_recorrencia DATE DEFAULT NULL,
ADD COLUMN recorrencia_indefinida BOOLEAN DEFAULT TRUE,
ADD COLUMN custo_recorrente_id UUID DEFAULT NULL REFERENCES frota_custos(id) ON DELETE CASCADE;

-- Index para melhorar queries de lançamentos recorrentes
CREATE INDEX idx_frota_custos_custo_recorrente_id ON frota_custos(custo_recorrente_id);
CREATE INDEX idx_frota_custos_data_gasto ON frota_custos(data_gasto);

-- Comments para documentação
COMMENT ON COLUMN frota_custos.data_inicio_recorrencia IS 'Data de início da recorrência';
COMMENT ON COLUMN frota_custos.data_fim_recorrencia IS 'Data de término da recorrência (null se indefinida)';
COMMENT ON COLUMN frota_custos.recorrencia_indefinida IS 'Se true, a recorrência não tem data de fim';
COMMENT ON COLUMN frota_custos.custo_recorrente_id IS 'ID do custo original (para lançamentos gerados automaticamente)';
