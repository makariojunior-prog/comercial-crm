# 🔧 Executar Migration - Custos Recorrentes

Como o arquivo de migration não pôde ser executado automaticamente via CLI, siga os passos abaixo:

## ✅ Passo 1: Ir ao Dashboard Supabase

Acesse: https://app.supabase.com/project/taicaxtjtikdajmhtsxc

## ✅ Passo 2: Abrir SQL Editor

- Clique em **SQL Editor** no menu lateral esquerdo
- Clique em **New Query**

## ✅ Passo 3: Colar o SQL

Cole o seguinte SQL na área de texto:

```sql
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
```

## ✅ Passo 4: Executar

- Clique em **RUN** (botão azul)
- A mensagem "success" deve aparecer

## ✅ Pronto! 🎉

A funcionalidade de custos recorrentes estará disponível no app!
