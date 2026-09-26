-- ============================================================================
-- Migration: Tabelas de monitoramento de delivery (iFood / 99Food)
-- Descrição: Cria as tabelas para armazenar o status em tempo real das lojas
--            nos canais de delivery e o log de webhooks recebidos.
-- ============================================================================

-- ─── Tabela: Status da loja em cada canal de delivery ────────────────────────
-- Armazena o estado atual (OPEN/CLOSED/PAUSED) de cada canal.
-- O frontend escuta via Supabase Realtime para atualizar os indicadores.

CREATE TABLE IF NOT EXISTS public.lojas_delivery_status (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canal          text        NOT NULL UNIQUE CHECK (canal IN ('IFOOD', '99FOOD')),
  status         text        NOT NULL DEFAULT 'CLOSED',  -- OPEN, CLOSED, PAUSED
  motivo_pausa   text,                                   -- razão da pausa/fechamento
  tempo_entrega_min  int,                                -- tempo estimado de entrega (min)
  reputacao_score    numeric(3,2),                        -- nota de reputação da loja
  ultima_verificacao timestamptz DEFAULT now(),
  alerta_ativo   boolean     DEFAULT false,
  mensagem_alerta text,
  updated_at     timestamptz DEFAULT now()
);

-- Inserir registros iniciais para ambos os canais
INSERT INTO public.lojas_delivery_status (canal, status)
VALUES ('IFOOD', 'CLOSED'), ('99FOOD', 'CLOSED')
ON CONFLICT (canal) DO NOTHING;

-- ─── Tabela: Log de webhooks recebidos ───────────────────────────────────────
-- Registra todos os eventos recebidos dos canais de delivery para análise,
-- debug e refinamento das Edge Functions.

CREATE TABLE IF NOT EXISTS public.delivery_webhook_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canal       text        NOT NULL CHECK (canal IN ('IFOOD', '99FOOD')),
  event_type  text,
  payload     jsonb,
  received_at timestamptz DEFAULT now()
);

-- Index para consultas por canal e data
CREATE INDEX IF NOT EXISTS idx_delivery_webhook_logs_canal_date
  ON public.delivery_webhook_logs (canal, received_at DESC);

-- Auto-limpeza: manter apenas últimos 30 dias de logs (cleanup via cron futuro)

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Habilita Realtime na tabela de status para que o frontend receba
-- atualizações instantâneas quando a loja for aberta/fechada/pausada.

ALTER PUBLICATION supabase_realtime ADD TABLE public.lojas_delivery_status;

-- ─── RLS (Row Level Security) ────────────────────────────────────────────────
-- Status: qualquer usuário autenticado pode ler; apenas service_role escreve.

ALTER TABLE public.lojas_delivery_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read delivery status"
  ON public.lojas_delivery_status
  FOR SELECT
  TO authenticated
  USING (true);

-- Logs: apenas service_role escreve e lê (dados técnicos internos)

ALTER TABLE public.delivery_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to webhook logs"
  ON public.delivery_webhook_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
