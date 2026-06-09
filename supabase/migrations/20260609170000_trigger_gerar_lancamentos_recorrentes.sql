-- Function para gerar lançamentos recorrentes
CREATE OR REPLACE FUNCTION gerar_lancamentos_recorrentes()
RETURNS TRIGGER AS $$
DECLARE
  meses_intervalo INT;
  data_fim DATE;
  data_proxima DATE;
  contador INT := 0;
BEGIN
  -- Só processa custos recorrentes originais (sem custo_recorrente_id)
  IF NEW.recorrente = FALSE OR NEW.custo_recorrente_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mapear tipo_recorrencia para meses
  meses_intervalo := CASE
    WHEN NEW.tipo_recorrencia = 'mensal' THEN 1
    WHEN NEW.tipo_recorrencia = 'trimestral' THEN 3
    WHEN NEW.tipo_recorrencia = 'semestral' THEN 6
    WHEN NEW.tipo_recorrencia = 'anual' THEN 12
    ELSE 1
  END;

  -- Determinar data de fim
  IF NEW.recorrencia_indefinida THEN
    data_fim := CURRENT_DATE + INTERVAL '24 months';
  ELSIF NEW.data_fim_recorrencia IS NOT NULL THEN
    data_fim := NEW.data_fim_recorrencia;
  ELSE
    RETURN NEW;
  END IF;

  -- Gerar lançamentos
  data_proxima := NEW.data_gasto + (meses_intervalo || ' months')::INTERVAL;

  WHILE data_proxima <= data_fim AND contador < 24 LOOP
    INSERT INTO frota_custos (
      vehicle_id, driver_id, categoria, descricao, valor,
      km_odometro, litros, preco_litro, data_gasto, observacoes,
      recorrente, tipo_recorrencia, proxima_data_recorrencia,
      data_inicio_recorrencia, data_fim_recorrencia, recorrencia_indefinida,
      custo_recorrente_id, ativo, created_at, updated_at
    ) VALUES (
      NEW.vehicle_id, NEW.driver_id, NEW.categoria, NEW.descricao, NEW.valor,
      NULL, NULL, NULL, data_proxima, NEW.observacoes,
      FALSE, NULL, NULL,
      NULL, NULL, FALSE,
      NEW.id, TRUE, NOW(), NOW()
    );

    data_proxima := data_proxima + (meses_intervalo || ' months')::INTERVAL;
    contador := contador + 1;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que chama a function quando um custo recorrente é inserido
DROP TRIGGER IF EXISTS trigger_gerar_lancamentos ON frota_custos;

CREATE TRIGGER trigger_gerar_lancamentos
AFTER INSERT ON frota_custos
FOR EACH ROW
EXECUTE FUNCTION gerar_lancamentos_recorrentes();
