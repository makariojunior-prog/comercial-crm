-- Colunas para fluxo de aprovação de compromissos agendados para outros usuários
ALTER TABLE agenda_compromissos
  ADD COLUMN IF NOT EXISTS aprovacao_status   text,          -- PENDENTE | APROVADO | REJEITADO | SUGERIDO
  ADD COLUMN IF NOT EXISTS aprovacao_nota     text,          -- mensagem do aprovador
  ADD COLUMN IF NOT EXISTS aprovacao_sugestao_data date,     -- data alternativa sugerida
  ADD COLUMN IF NOT EXISTS aprovacao_sugestao_hora time,     -- hora alternativa sugerida
  ADD COLUMN IF NOT EXISTS aprovado_por       text,          -- nome do responsável que respondeu
  ADD COLUMN IF NOT EXISTS criado_por_id      uuid;          -- auth user id do criador (para notificação)
