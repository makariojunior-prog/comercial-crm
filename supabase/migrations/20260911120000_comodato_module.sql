-- =====================================================================
-- MÓDULO COMODATO — controle de equipamentos cedidos a clientes
--
-- Modelo (ver docs/BENCHMARK_COMODATO.md):
--
--   crm_clients ──1:N──> comodato_contratos ──1:N──> comodato_alocacoes
--                                                          │   ▲
--                              comodato_manutencoes <───────┘   │ N:1
--                                                               │
--                        comodato_modelos ──1:N──> comodato_equipamentos
--
--   • comodato_modelos      = catálogo (FREEZER FRICON 450L)
--   • comodato_equipamentos = a unidade física, com patrimônio e série
--   • comodato_contratos    = o acordo jurídico com o cliente
--   • comodato_alocacoes    = livro-razão de custódia (append-only)
--   • comodato_manutencoes  = ordens de serviço (corretiva + preventiva)
--
-- O campo legado crm_clients.comodato NÃO é removido: vira um espelho
-- gerado por trigger a partir das alocações ativas, preservando
-- listagens, exports e a sincronização com a planilha.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. CATÁLOGO DE MODELOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_modelos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               TEXT NOT NULL,
  categoria          TEXT NOT NULL DEFAULT 'OUTROS',
  marca              TEXT,
  modelo             TEXT,
  capacidade         TEXT,
  valor_referencia   NUMERIC(12,2),
  -- intervalo padrão de manutenção preventiva herdado pelas unidades
  manutencao_intervalo_meses INTEGER,
  foto_url           TEXT,
  observacoes        TEXT,
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comodato_modelos_categoria_chk CHECK (categoria IN (
    'FREEZER','ARMARIO','FORNO','EXPOSITOR','ESTUFA','BALCAO','VITRINE',
    'GELADEIRA','MASSEIRA','CILINDRO','FRITADEIRA','MICROONDAS','OUTROS'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS comodato_modelos_nome_uniq
  ON public.comodato_modelos (UPPER(TRIM(nome)));
CREATE INDEX IF NOT EXISTS comodato_modelos_categoria_idx
  ON public.comodato_modelos (categoria) WHERE ativo;

COMMENT ON TABLE  public.comodato_modelos IS 'Catálogo de tipos de equipamento cedidos em comodato.';
COMMENT ON COLUMN public.comodato_modelos.manutencao_intervalo_meses IS 'Intervalo padrão de manutenção preventiva herdado pelas unidades novas.';

-- ---------------------------------------------------------------------
-- 2. UNIDADES / PATRIMÔNIO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_equipamentos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_patrimonio  TEXT NOT NULL,
  modelo_id          UUID REFERENCES public.comodato_modelos(id) ON DELETE RESTRICT,
  numero_serie       TEXT,
  empresa            TEXT NOT NULL DEFAULT 'lumar',

  -- ciclo de vida do ativo
  situacao           TEXT NOT NULL DEFAULT 'disponivel',
  estado_conservacao TEXT NOT NULL DEFAULT 'bom',

  -- detentor atual (CACHE mantido por trigger — a verdade está em comodato_alocacoes)
  client_id          UUID REFERENCES public.crm_clients(id) ON DELETE SET NULL,
  alocacao_id        UUID,
  local_atual        TEXT,

  -- dados patrimoniais / fiscais
  valor_aquisicao    NUMERIC(12,2),
  data_aquisicao     DATE,
  nota_fiscal_compra TEXT,
  fornecedor         TEXT,

  -- manutenção preventiva (recorrência flutuante: recalculada na conclusão da OS)
  manutencao_intervalo_meses INTEGER,
  ultima_manutencao  DATE,
  proxima_manutencao DATE,

  -- auditoria de campo
  ultima_conferencia DATE,

  foto_url           TEXT,
  observacoes        TEXT,
  -- rastreabilidade da migração do texto livre
  origem             TEXT NOT NULL DEFAULT 'manual',
  revisar            BOOLEAN NOT NULL DEFAULT FALSE,

  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT comodato_equipamentos_situacao_chk CHECK (situacao IN (
    'disponivel','reservado','em_comodato','manutencao','baixado'
  )),
  CONSTRAINT comodato_equipamentos_estado_chk CHECK (estado_conservacao IN (
    'novo','bom','regular','ruim','inservivel'
  )),
  CONSTRAINT comodato_equipamentos_empresa_chk CHECK (empresa IN ('lumar','cantina')),
  CONSTRAINT comodato_equipamentos_origem_chk  CHECK (origem IN ('manual','legado','importacao'))
);

CREATE UNIQUE INDEX IF NOT EXISTS comodato_equipamentos_patrimonio_uniq
  ON public.comodato_equipamentos (UPPER(TRIM(codigo_patrimonio)));
CREATE INDEX IF NOT EXISTS comodato_equipamentos_situacao_idx ON public.comodato_equipamentos (situacao);
CREATE INDEX IF NOT EXISTS comodato_equipamentos_client_idx   ON public.comodato_equipamentos (client_id);
CREATE INDEX IF NOT EXISTS comodato_equipamentos_modelo_idx   ON public.comodato_equipamentos (modelo_id);
CREATE INDEX IF NOT EXISTS comodato_equipamentos_prox_manut_idx
  ON public.comodato_equipamentos (proxima_manutencao) WHERE ativo AND proxima_manutencao IS NOT NULL;
CREATE INDEX IF NOT EXISTS comodato_equipamentos_revisar_idx
  ON public.comodato_equipamentos (revisar) WHERE revisar;

COMMENT ON TABLE  public.comodato_equipamentos IS 'Unidade física rastreada individualmente (patrimônio). A aba "Disponíveis" é situacao = disponivel.';
COMMENT ON COLUMN public.comodato_equipamentos.client_id IS 'Cache do detentor atual. Fonte da verdade: comodato_alocacoes com status ativa.';
COMMENT ON COLUMN public.comodato_equipamentos.revisar  IS 'TRUE em registros criados pela migração do texto livre que precisam de conferência humana.';

-- ---------------------------------------------------------------------
-- 3. CONTRATOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_contratos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             TEXT,
  client_id          UUID NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  empresa            TEXT NOT NULL DEFAULT 'lumar',

  status             TEXT NOT NULL DEFAULT 'vigente',
  contrato_assinado  BOOLEAN NOT NULL DEFAULT FALSE,
  data_assinatura    DATE,
  data_inicio        DATE,
  prazo_meses        INTEGER,
  data_fim           DATE,
  renovacao_automatica BOOLEAN NOT NULL DEFAULT FALSE,

  -- contrapartida comercial (o que justifica ceder o bem)
  contrapartida      TEXT,
  volume_minimo      TEXT,

  -- responsabilidades
  responsavel_manutencao TEXT NOT NULL DEFAULT 'comodante',
  responsavel_interno    TEXT,
  contato_cliente        TEXT,

  -- documentos
  arquivo_url        TEXT,
  testemunhas        TEXT,

  valor_total_bens   NUMERIC(12,2),
  observacoes        TEXT,
  origem             TEXT NOT NULL DEFAULT 'manual',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT comodato_contratos_status_chk CHECK (status IN (
    'rascunho','pendente_assinatura','vigente','encerrado','cancelado'
  )),
  CONSTRAINT comodato_contratos_empresa_chk CHECK (empresa IN ('lumar','cantina')),
  CONSTRAINT comodato_contratos_resp_chk CHECK (responsavel_manutencao IN ('comodante','comodatario','compartilhado')),
  CONSTRAINT comodato_contratos_origem_chk CHECK (origem IN ('manual','legado','importacao'))
);

CREATE INDEX IF NOT EXISTS comodato_contratos_client_idx ON public.comodato_contratos (client_id);
CREATE INDEX IF NOT EXISTS comodato_contratos_status_idx ON public.comodato_contratos (status);
CREATE INDEX IF NOT EXISTS comodato_contratos_fim_idx    ON public.comodato_contratos (data_fim)
  WHERE status = 'vigente' AND data_fim IS NOT NULL;

COMMENT ON TABLE public.comodato_contratos IS 'Contrato de comodato com o cliente. Um contrato cobre N equipamentos (comodato_alocacoes).';

-- ---------------------------------------------------------------------
-- 4. ALOCAÇÕES — livro-razão de custódia (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_alocacoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento_id     UUID NOT NULL REFERENCES public.comodato_equipamentos(id) ON DELETE CASCADE,
  contrato_id        UUID REFERENCES public.comodato_contratos(id) ON DELETE SET NULL,
  client_id          UUID NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,

  status             TEXT NOT NULL DEFAULT 'ativa',

  data_entrega       DATE NOT NULL DEFAULT CURRENT_DATE,
  data_prevista_retirada DATE,
  data_retirada      DATE,

  estado_entrega     TEXT,
  estado_devolucao   TEXT,

  -- elo fiscal (CFOP 5908 remessa / 5909 retorno)
  nf_remessa         TEXT,
  nf_retorno         TEXT,

  responsavel_entrega TEXT,
  recebido_por        TEXT,
  motivo_retirada     TEXT,
  observacoes         TEXT,
  origem              TEXT NOT NULL DEFAULT 'manual',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT comodato_alocacoes_status_chk CHECK (status IN ('ativa','devolvida','cancelada')),
  CONSTRAINT comodato_alocacoes_origem_chk CHECK (origem IN ('manual','legado','importacao')),
  CONSTRAINT comodato_alocacoes_datas_chk  CHECK (data_retirada IS NULL OR data_retirada >= data_entrega)
);

-- um equipamento não pode estar em dois clientes ao mesmo tempo
CREATE UNIQUE INDEX IF NOT EXISTS comodato_alocacoes_uma_ativa_por_equip
  ON public.comodato_alocacoes (equipamento_id) WHERE status = 'ativa';
CREATE INDEX IF NOT EXISTS comodato_alocacoes_client_idx   ON public.comodato_alocacoes (client_id);
CREATE INDEX IF NOT EXISTS comodato_alocacoes_contrato_idx ON public.comodato_alocacoes (contrato_id);
CREATE INDEX IF NOT EXISTS comodato_alocacoes_status_idx   ON public.comodato_alocacoes (status);

COMMENT ON TABLE public.comodato_alocacoes IS 'Histórico de custódia: uma linha por período em que um equipamento esteve com um cliente. Nunca sobrescrever — encerre e crie outra.';

ALTER TABLE public.comodato_equipamentos
  DROP CONSTRAINT IF EXISTS comodato_equipamentos_alocacao_fk;
ALTER TABLE public.comodato_equipamentos
  ADD CONSTRAINT comodato_equipamentos_alocacao_fk
  FOREIGN KEY (alocacao_id) REFERENCES public.comodato_alocacoes(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 5. MANUTENÇÕES — ordens de serviço
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_manutencoes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento_id     UUID NOT NULL REFERENCES public.comodato_equipamentos(id) ON DELETE CASCADE,
  alocacao_id        UUID REFERENCES public.comodato_alocacoes(id) ON DELETE SET NULL,
  client_id          UUID REFERENCES public.crm_clients(id) ON DELETE SET NULL,

  tipo               TEXT NOT NULL DEFAULT 'corretiva',
  status             TEXT NOT NULL DEFAULT 'aberta',
  prioridade         TEXT NOT NULL DEFAULT 'media',

  descricao          TEXT NOT NULL,
  solucao            TEXT,

  data_abertura      DATE NOT NULL DEFAULT CURRENT_DATE,
  data_agendada      DATE,
  data_conclusao     DATE,

  custo              NUMERIC(12,2),
  tecnico            TEXT,
  fornecedor         TEXT,
  aberto_por         TEXT,
  observacoes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT comodato_manutencoes_tipo_chk CHECK (tipo IN (
    'preventiva','corretiva','instalacao','retirada','higienizacao','conferencia'
  )),
  CONSTRAINT comodato_manutencoes_status_chk CHECK (status IN (
    'aberta','agendada','em_andamento','concluida','cancelada'
  )),
  CONSTRAINT comodato_manutencoes_prioridade_chk CHECK (prioridade IN ('baixa','media','alta','urgente'))
);

CREATE INDEX IF NOT EXISTS comodato_manutencoes_equip_idx  ON public.comodato_manutencoes (equipamento_id);
CREATE INDEX IF NOT EXISTS comodato_manutencoes_client_idx ON public.comodato_manutencoes (client_id);
CREATE INDEX IF NOT EXISTS comodato_manutencoes_abertas_idx
  ON public.comodato_manutencoes (status, data_agendada) WHERE status <> 'concluida' AND status <> 'cancelada';

COMMENT ON TABLE public.comodato_manutencoes IS 'Ordem de serviço sobre um equipamento. Ao concluir uma preventiva, a próxima é recalculada na unidade.';

-- ---------------------------------------------------------------------
-- 6. TRIGGERS updated_at
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comodato_modelos','comodato_equipamentos','comodato_contratos',
    'comodato_alocacoes','comodato_manutencoes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.comodato_touch_updated_at()',
      t || '_touch', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. GERADOR DE CÓDIGO DE PATRIMÔNIO
--    FRZ-0001, ARM-0003, FOR-0012 … prefixo pela categoria do modelo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_prefixo_categoria(p_categoria TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE UPPER(COALESCE(p_categoria,'OUTROS'))
    WHEN 'FREEZER'    THEN 'FRZ'
    WHEN 'ARMARIO'    THEN 'ARM'
    WHEN 'FORNO'      THEN 'FOR'
    WHEN 'EXPOSITOR'  THEN 'EXP'
    WHEN 'ESTUFA'     THEN 'EST'
    WHEN 'BALCAO'     THEN 'BAL'
    WHEN 'VITRINE'    THEN 'VIT'
    WHEN 'GELADEIRA'  THEN 'GEL'
    WHEN 'MASSEIRA'   THEN 'MAS'
    WHEN 'CILINDRO'   THEN 'CIL'
    WHEN 'FRITADEIRA' THEN 'FRT'
    WHEN 'MICROONDAS' THEN 'MIC'
    ELSE 'EQP'
  END;
$$;

CREATE OR REPLACE FUNCTION public.comodato_proximo_patrimonio(p_categoria TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefixo TEXT := public.comodato_prefixo_categoria(p_categoria);
  v_seq     INTEGER;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo_patrimonio, '^' || v_prefixo || '-', ''), '')::INTEGER), 0) + 1
    INTO v_seq
    FROM public.comodato_equipamentos
   WHERE codigo_patrimonio ~ ('^' || v_prefixo || '-[0-9]+$');
  RETURN v_prefixo || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- preenche codigo_patrimonio quando vier vazio
CREATE OR REPLACE FUNCTION public.comodato_equip_before_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_cat TEXT;
BEGIN
  IF NEW.codigo_patrimonio IS NULL OR TRIM(NEW.codigo_patrimonio) = '' THEN
    SELECT categoria INTO v_cat FROM public.comodato_modelos WHERE id = NEW.modelo_id;
    NEW.codigo_patrimonio := public.comodato_proximo_patrimonio(v_cat);
  END IF;
  NEW.codigo_patrimonio := UPPER(TRIM(NEW.codigo_patrimonio));

  -- herda o intervalo de preventiva do modelo
  IF NEW.manutencao_intervalo_meses IS NULL AND NEW.modelo_id IS NOT NULL THEN
    SELECT manutencao_intervalo_meses INTO NEW.manutencao_intervalo_meses
      FROM public.comodato_modelos WHERE id = NEW.modelo_id;
  END IF;

  IF NEW.proxima_manutencao IS NULL
     AND NEW.manutencao_intervalo_meses IS NOT NULL
     AND NEW.ultima_manutencao IS NOT NULL THEN
    NEW.proxima_manutencao := (NEW.ultima_manutencao + (NEW.manutencao_intervalo_meses || ' months')::INTERVAL)::DATE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comodato_equip_before_ins_trg ON public.comodato_equipamentos;
CREATE TRIGGER comodato_equip_before_ins_trg
  BEFORE INSERT ON public.comodato_equipamentos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_equip_before_ins();

-- ---------------------------------------------------------------------
-- 8. SINCRONIA ALOCAÇÃO → EQUIPAMENTO → crm_clients.comodato
-- ---------------------------------------------------------------------

-- Reescreve o campo texto legado a partir das alocações ativas do cliente.
-- Mantém listagens, exports e a planilha funcionando sem alteração.
CREATE OR REPLACE FUNCTION public.comodato_sync_texto_cliente(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_txt   TEXT;
  v_valor NUMERIC;
BEGIN
  IF p_client_id IS NULL THEN RETURN; END IF;

  SELECT string_agg(linha, ', ' ORDER BY linha), SUM(valor)
    INTO v_txt, v_valor
  FROM (
    SELECT e.codigo_patrimonio || ' ' || COALESCE(m.nome, 'EQUIPAMENTO') AS linha,
           COALESCE(e.valor_aquisicao, m.valor_referencia)               AS valor
      FROM public.comodato_alocacoes a
      JOIN public.comodato_equipamentos e ON e.id = a.equipamento_id
      LEFT JOIN public.comodato_modelos m ON m.id = e.modelo_id
     WHERE a.client_id = p_client_id
       AND a.status = 'ativa'
  ) s;

  UPDATE public.crm_clients
     SET comodato = v_txt,
         valor    = CASE WHEN v_valor IS NOT NULL
                         THEN 'R$ ' || translate(
                                to_char(v_valor, 'FM999,999,990.00'),
                                ',.', '.,')
                         ELSE valor END
   WHERE id = p_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.comodato_alocacao_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_equip  UUID := COALESCE(NEW.equipamento_id, OLD.equipamento_id);
  v_ativa  RECORD;
BEGIN
  -- recalcula o detentor atual do equipamento a partir da alocação ativa
  SELECT a.id, a.client_id, c.nome
    INTO v_ativa
    FROM public.comodato_alocacoes a
    LEFT JOIN public.crm_clients c ON c.id = a.client_id
   WHERE a.equipamento_id = v_equip AND a.status = 'ativa'
   LIMIT 1;

  IF v_ativa.id IS NOT NULL THEN
    UPDATE public.comodato_equipamentos
       SET client_id   = v_ativa.client_id,
           alocacao_id = v_ativa.id,
           local_atual = v_ativa.nome,
           situacao    = CASE WHEN situacao = 'manutencao' THEN 'manutencao' ELSE 'em_comodato' END
     WHERE id = v_equip;
  ELSE
    UPDATE public.comodato_equipamentos
       SET client_id   = NULL,
           alocacao_id = NULL,
           local_atual = NULL,
           situacao    = CASE WHEN situacao IN ('manutencao','baixado') THEN situacao ELSE 'disponivel' END
     WHERE id = v_equip;
  END IF;

  -- espelha o texto no cadastro do cliente (origem e destino, se mudou)
  PERFORM public.comodato_sync_texto_cliente(NEW.client_id);
  IF TG_OP <> 'INSERT' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    PERFORM public.comodato_sync_texto_cliente(OLD.client_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS comodato_alocacao_sync_trg ON public.comodato_alocacoes;
CREATE TRIGGER comodato_alocacao_sync_trg
  AFTER INSERT OR UPDATE OF status, client_id, equipamento_id ON public.comodato_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.comodato_alocacao_sync();

CREATE OR REPLACE FUNCTION public.comodato_alocacao_sync_del()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.comodato_equipamentos
     SET client_id = NULL, alocacao_id = NULL, local_atual = NULL,
         situacao  = CASE WHEN situacao IN ('manutencao','baixado') THEN situacao ELSE 'disponivel' END
   WHERE id = OLD.equipamento_id
     AND NOT EXISTS (
       SELECT 1 FROM public.comodato_alocacoes
        WHERE equipamento_id = OLD.equipamento_id AND status = 'ativa'
     );
  PERFORM public.comodato_sync_texto_cliente(OLD.client_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS comodato_alocacao_sync_del_trg ON public.comodato_alocacoes;
CREATE TRIGGER comodato_alocacao_sync_del_trg
  AFTER DELETE ON public.comodato_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.comodato_alocacao_sync_del();

-- ---------------------------------------------------------------------
-- 9. MANUTENÇÃO: recorrência flutuante + situação do equipamento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_manutencao_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_intervalo INTEGER;
  v_tem_aberta BOOLEAN;
BEGIN
  IF NEW.status = 'concluida' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluida') THEN
    SELECT manutencao_intervalo_meses INTO v_intervalo
      FROM public.comodato_equipamentos WHERE id = NEW.equipamento_id;

    UPDATE public.comodato_equipamentos
       SET ultima_manutencao  = COALESCE(NEW.data_conclusao, CURRENT_DATE),
           proxima_manutencao = CASE
             WHEN v_intervalo IS NOT NULL
             THEN (COALESCE(NEW.data_conclusao, CURRENT_DATE) + (v_intervalo || ' months')::INTERVAL)::DATE
             ELSE proxima_manutencao END
     WHERE id = NEW.equipamento_id;
  END IF;

  -- equipamento em oficina: só quando a OS está em andamento e ele não está no cliente
  SELECT EXISTS (
    SELECT 1 FROM public.comodato_manutencoes
     WHERE equipamento_id = NEW.equipamento_id AND status = 'em_andamento'
  ) INTO v_tem_aberta;

  UPDATE public.comodato_equipamentos e
     SET situacao = CASE
       WHEN e.situacao = 'baixado' THEN 'baixado'
       WHEN v_tem_aberta AND e.alocacao_id IS NULL THEN 'manutencao'
       WHEN NOT v_tem_aberta AND e.situacao = 'manutencao'
         THEN CASE WHEN e.alocacao_id IS NOT NULL THEN 'em_comodato' ELSE 'disponivel' END
       ELSE e.situacao END
   WHERE e.id = NEW.equipamento_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS comodato_manutencao_sync_trg ON public.comodato_manutencoes;
CREATE TRIGGER comodato_manutencao_sync_trg
  AFTER INSERT OR UPDATE OF status, data_conclusao ON public.comodato_manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.comodato_manutencao_sync();

-- ---------------------------------------------------------------------
-- 10. CONTRATO: calcula data_fim a partir do prazo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_contrato_before_save()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.data_fim IS NULL AND NEW.data_inicio IS NOT NULL AND NEW.prazo_meses IS NOT NULL THEN
    NEW.data_fim := (NEW.data_inicio + (NEW.prazo_meses || ' months')::INTERVAL)::DATE;
  END IF;
  IF NEW.contrato_assinado AND NEW.data_assinatura IS NULL THEN
    NEW.data_assinatura := COALESCE(NEW.data_inicio, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comodato_contrato_before_save_trg ON public.comodato_contratos;
CREATE TRIGGER comodato_contrato_before_save_trg
  BEFORE INSERT OR UPDATE ON public.comodato_contratos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_contrato_before_save();

-- ---------------------------------------------------------------------
-- 11. VIEWS
-- ---------------------------------------------------------------------

-- Equipamento "achatado" para as listagens do módulo
DROP VIEW IF EXISTS public.comodato_equipamentos_view CASCADE;
CREATE VIEW public.comodato_equipamentos_view
WITH (security_invoker = true) AS
SELECT
  e.*,
  m.nome                AS modelo_nome,
  m.categoria           AS categoria,
  m.marca               AS marca,
  m.capacidade          AS capacidade,
  m.valor_referencia    AS modelo_valor_referencia,
  COALESCE(e.valor_aquisicao, m.valor_referencia) AS valor_efetivo,
  c.nome                AS client_nome,
  c.rota                AS client_rota,
  c.status              AS client_status,
  a.data_entrega        AS data_entrega,
  a.contrato_id         AS contrato_id,
  ct.status             AS contrato_status,
  ct.contrato_assinado  AS contrato_assinado,
  ct.data_fim           AS contrato_data_fim,
  CASE WHEN a.data_entrega IS NOT NULL
       THEN (CURRENT_DATE - a.data_entrega) END AS dias_em_comodato,
  CASE WHEN e.situacao = 'disponivel'
       THEN (CURRENT_DATE - GREATEST(e.updated_at, e.created_at)::DATE) END AS dias_parado,
  (e.proxima_manutencao IS NOT NULL AND e.proxima_manutencao <= CURRENT_DATE)              AS manutencao_vencida,
  (e.proxima_manutencao IS NOT NULL AND e.proxima_manutencao > CURRENT_DATE
     AND e.proxima_manutencao <= CURRENT_DATE + 30)                                        AS manutencao_proxima,
  (e.situacao = 'em_comodato' AND a.contrato_id IS NULL)                                   AS sem_contrato,
  (e.situacao = 'em_comodato' AND ct.id IS NOT NULL AND NOT ct.contrato_assinado)           AS contrato_nao_assinado,
  (SELECT COUNT(*) FROM public.comodato_manutencoes mm
    WHERE mm.equipamento_id = e.id AND mm.status NOT IN ('concluida','cancelada'))          AS os_abertas
FROM public.comodato_equipamentos e
LEFT JOIN public.comodato_modelos      m  ON m.id  = e.modelo_id
LEFT JOIN public.crm_clients           c  ON c.id  = e.client_id
LEFT JOIN public.comodato_alocacoes    a  ON a.id  = e.alocacao_id
LEFT JOIN public.comodato_contratos    ct ON ct.id = a.contrato_id;

COMMENT ON VIEW public.comodato_equipamentos_view IS 'Unidade + modelo + cliente + contrato + flags de alerta. Base das abas Equipamentos, Disponíveis e Manutenções.';

-- Resumo por cliente — usado no ClientModal e na aba Contratos
DROP VIEW IF EXISTS public.comodato_resumo_cliente CASCADE;
CREATE VIEW public.comodato_resumo_cliente
WITH (security_invoker = true) AS
SELECT
  c.id                                   AS client_id,
  c.nome                                 AS client_nome,
  c.rota                                 AS client_rota,
  c.status                               AS client_status,
  COUNT(a.id)                            AS qtd_equipamentos,
  COALESCE(SUM(COALESCE(e.valor_aquisicao, m.valor_referencia)), 0) AS valor_total,
  MIN(a.data_entrega)                    AS primeira_entrega,
  BOOL_OR(ct.contrato_assinado)          AS tem_contrato_assinado,
  MAX(ct.data_fim)                       AS contrato_data_fim,
  COUNT(*) FILTER (WHERE a.contrato_id IS NULL) AS itens_sem_contrato,
  COUNT(*) FILTER (WHERE e.revisar)             AS itens_a_revisar
FROM public.crm_clients c
JOIN public.comodato_alocacoes    a  ON a.client_id = c.id AND a.status = 'ativa'
JOIN public.comodato_equipamentos e  ON e.id = a.equipamento_id
LEFT JOIN public.comodato_modelos m  ON m.id = e.modelo_id
LEFT JOIN public.comodato_contratos ct ON ct.id = a.contrato_id
GROUP BY c.id, c.nome, c.rota, c.status;

COMMENT ON VIEW public.comodato_resumo_cliente IS 'Uma linha por cliente que hoje detém equipamento em comodato.';

-- ---------------------------------------------------------------------
-- 12. RLS — mesmo padrão do restante do CRM (authenticated, nunca anon)
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comodato_modelos','comodato_equipamentos','comodato_contratos',
    'comodato_alocacoes','comodato_manutencoes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'auth_all_' || t, t);
  END LOOP;
END $$;

-- Views herdam a RLS das tabelas base (security_invoker), mas o acesso
-- anônimo precisa ser revogado explicitamente.
REVOKE ALL ON public.comodato_equipamentos_view FROM anon;
REVOKE ALL ON public.comodato_resumo_cliente    FROM anon;
GRANT SELECT ON public.comodato_equipamentos_view TO authenticated;
GRANT SELECT ON public.comodato_resumo_cliente    TO authenticated;

-- ---------------------------------------------------------------------
-- 13. Campo de preservação do texto livre original
-- ---------------------------------------------------------------------
ALTER TABLE public.crm_clients
  ADD COLUMN IF NOT EXISTS comodato_legado TEXT;
COMMENT ON COLUMN public.crm_clients.comodato_legado IS
  'Texto livre original do campo comodato, preservado na migração para o módulo estruturado.';
COMMENT ON COLUMN public.crm_clients.comodato IS
  'Espelho gerado a partir de comodato_alocacoes ativas. Editar pelo módulo Comodato, não diretamente.';
