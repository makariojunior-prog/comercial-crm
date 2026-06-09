-- Add recurring cost fields to frota_custos table
ALTER TABLE frota_custos
ADD COLUMN recorrente BOOLEAN DEFAULT FALSE,
ADD COLUMN tipo_recorrencia VARCHAR(20) DEFAULT NULL,
ADD COLUMN proxima_data_recorrencia DATE DEFAULT NULL,
ADD COLUMN ativo BOOLEAN DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN frota_custos.recorrente IS 'Indica se este é um custo recorrente';
COMMENT ON COLUMN frota_custos.tipo_recorrencia IS 'Frequência de recorrência: mensal, trimestral, semestral, anual';
COMMENT ON COLUMN frota_custos.proxima_data_recorrencia IS 'Data do próximo lançamento recorrente';
COMMENT ON COLUMN frota_custos.ativo IS 'Indica se a recorrência está ativa (para desativar custos sem deletar)';
