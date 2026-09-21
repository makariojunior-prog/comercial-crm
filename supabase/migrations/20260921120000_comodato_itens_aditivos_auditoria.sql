-- =====================================================================
-- COMODATO — vínculo contrato ↔ equipamentos, aditivos, exclusão só
-- para administrador e trilha de auditoria.
--
--  1. comodato_contrato_aditivos: aditivos de um contrato.
--  2. comodato_alocacoes.aditivo_id: sob qual aditivo o equipamento
--     entrou no contrato (NULL = contrato original). A data de inclusão
--     é comodato_alocacoes.data_entrega; o instante do lançamento é
--     created_at.
--  3. Validações de consistência do vínculo.
--  4. RLS: DELETE só para role 'admin' (crm_users.role).
--  5. comodato_auditoria: log append-only de INSERT/UPDATE/DELETE em
--     todas as tabelas do módulo, com usuário, data e campos alterados.
--
-- A regra "um equipamento não pode estar em dois contratos" já é garantida
-- por comodato_alocacoes_uma_ativa_por_equip (uma alocação ativa por
-- equipamento) + contrato_id único por alocação.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: usuário logado é administrador?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_users u
     WHERE u.id = auth.uid()
       AND u.role = 'admin'
       AND COALESCE(u.ativo, TRUE)
  );
$$;

REVOKE ALL ON FUNCTION public.comodato_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comodato_is_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- 1. ADITIVOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_contrato_aditivos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id     UUID NOT NULL REFERENCES public.comodato_contratos(id) ON DELETE CASCADE,
  numero          TEXT,
  tipo            TEXT NOT NULL DEFAULT 'inclusao_equipamento',
  data_aditivo    DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao       TEXT,
  assinado        BOOLEAN NOT NULL DEFAULT FALSE,
  data_assinatura DATE,
  arquivo_url     TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comodato_aditivos_tipo_chk CHECK (tipo IN (
    'inclusao_equipamento','retirada_equipamento','prorrogacao','alteracao_condicoes','outros'
  ))
);

CREATE INDEX IF NOT EXISTS comodato_aditivos_contrato_idx
  ON public.comodato_contrato_aditivos (contrato_id, data_aditivo);

COMMENT ON TABLE public.comodato_contrato_aditivos IS
  'Aditivos do contrato de comodato (inclusão/retirada de equipamentos, prorrogação, alteração de condições).';

DROP TRIGGER IF EXISTS comodato_contrato_aditivos_touch ON public.comodato_contrato_aditivos;
CREATE TRIGGER comodato_contrato_aditivos_touch
  BEFORE UPDATE ON public.comodato_contrato_aditivos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_touch_updated_at();

-- created_by = usuário logado, sem depender do front
CREATE OR REPLACE FUNCTION public.comodato_aditivo_before_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comodato_aditivo_before_ins_trg ON public.comodato_contrato_aditivos;
CREATE TRIGGER comodato_aditivo_before_ins_trg
  BEFORE INSERT ON public.comodato_contrato_aditivos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_aditivo_before_ins();

-- ---------------------------------------------------------------------
-- 2. Alocação ↔ aditivo
-- ---------------------------------------------------------------------
ALTER TABLE public.comodato_alocacoes
  ADD COLUMN IF NOT EXISTS aditivo_id UUID
  REFERENCES public.comodato_contrato_aditivos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS comodato_alocacoes_aditivo_idx ON public.comodato_alocacoes (aditivo_id);

COMMENT ON COLUMN public.comodato_alocacoes.aditivo_id IS
  'Aditivo sob o qual o equipamento entrou no contrato. NULL = contrato original.';
COMMENT ON COLUMN public.comodato_alocacoes.data_entrega IS
  'Data em que o equipamento foi entregue/incluído no contrato.';

-- ---------------------------------------------------------------------
-- 3. Consistência do vínculo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_alocacao_valida_vinculo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ct  RECORD;
  v_adt RECORD;
BEGIN
  IF NEW.contrato_id IS NOT NULL THEN
    SELECT client_id, status, COALESCE(numero, 'sem número') AS numero
      INTO v_ct FROM public.comodato_contratos WHERE id = NEW.contrato_id;

    IF v_ct.client_id IS NULL THEN
      RAISE EXCEPTION 'Contrato não encontrado.';
    END IF;
    IF v_ct.client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'O contrato % pertence a outro cliente.', v_ct.numero;
    END IF;
    -- só barra ao vincular; alocações antigas de contrato já encerrado continuam editáveis
    IF (TG_OP = 'INSERT' OR OLD.contrato_id IS DISTINCT FROM NEW.contrato_id)
       AND NEW.status = 'ativa'
       AND v_ct.status IN ('encerrado','cancelado') THEN
      RAISE EXCEPTION 'O contrato % está % e não aceita novos equipamentos.', v_ct.numero, v_ct.status;
    END IF;
  END IF;

  IF NEW.aditivo_id IS NOT NULL THEN
    SELECT contrato_id INTO v_adt FROM public.comodato_contrato_aditivos WHERE id = NEW.aditivo_id;
    IF v_adt.contrato_id IS DISTINCT FROM NEW.contrato_id THEN
      RAISE EXCEPTION 'O aditivo informado não pertence a este contrato.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comodato_alocacao_valida_vinculo_trg ON public.comodato_alocacoes;
CREATE TRIGGER comodato_alocacao_valida_vinculo_trg
  BEFORE INSERT OR UPDATE OF contrato_id, aditivo_id, client_id, status ON public.comodato_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.comodato_alocacao_valida_vinculo();

-- Sem contrato, o aditivo deixa de fazer sentido
CREATE OR REPLACE FUNCTION public.comodato_alocacao_limpa_aditivo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contrato_id IS NULL THEN NEW.aditivo_id := NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comodato_alocacao_a_limpa_aditivo_trg ON public.comodato_alocacoes;
CREATE TRIGGER comodato_alocacao_a_limpa_aditivo_trg
  BEFORE INSERT OR UPDATE OF contrato_id ON public.comodato_alocacoes
  FOR EACH ROW EXECUTE FUNCTION public.comodato_alocacao_limpa_aditivo();

-- Não exclui contrato/equipamento que ainda está em uso: devolva ou cancele antes.
CREATE OR REPLACE FUNCTION public.comodato_contrato_bloqueia_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.comodato_alocacoes
              WHERE contrato_id = OLD.id AND status = 'ativa') THEN
    RAISE EXCEPTION 'O contrato % ainda tem equipamentos vinculados. Desvincule-os (ou registre a devolução) antes de excluir, ou marque o contrato como cancelado.',
      COALESCE(OLD.numero, 'sem número');
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS comodato_contrato_bloqueia_delete_trg ON public.comodato_contratos;
CREATE TRIGGER comodato_contrato_bloqueia_delete_trg
  BEFORE DELETE ON public.comodato_contratos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_contrato_bloqueia_delete();

CREATE OR REPLACE FUNCTION public.comodato_equip_bloqueia_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.comodato_alocacoes
              WHERE equipamento_id = OLD.id AND status = 'ativa') THEN
    RAISE EXCEPTION 'O equipamento % está alocado a um cliente. Registre a devolução antes de excluir.',
      OLD.codigo_patrimonio;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS comodato_equip_bloqueia_delete_trg ON public.comodato_equipamentos;
CREATE TRIGGER comodato_equip_bloqueia_delete_trg
  BEFORE DELETE ON public.comodato_equipamentos
  FOR EACH ROW EXECUTE FUNCTION public.comodato_equip_bloqueia_delete();

-- ---------------------------------------------------------------------
-- 4. RLS — leitura/gravação como antes; DELETE somente administrador
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comodato_modelos','comodato_equipamentos','comodato_contratos',
    'comodato_alocacoes','comodato_manutencoes','comodato_contrato_aditivos'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin_delete_' || t, t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                   'auth_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
                   'auth_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
                   'auth_update_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.comodato_is_admin())',
                   'admin_delete_' || t, t);
  END LOOP;
END $$;

REVOKE ALL ON public.comodato_contrato_aditivos FROM anon;

-- ---------------------------------------------------------------------
-- 5. AUDITORIA — append-only
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comodato_auditoria (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocorrido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tabela          TEXT NOT NULL,
  registro_id     UUID,
  operacao        TEXT NOT NULL,
  resumo          TEXT,
  usuario_id      UUID,
  usuario_nome    TEXT,
  usuario_email   TEXT,
  contrato_id     UUID,
  equipamento_id  UUID,
  client_id       UUID,
  campos_alterados TEXT[],
  dados_antigos   JSONB,
  dados_novos     JSONB,
  CONSTRAINT comodato_auditoria_operacao_chk CHECK (operacao IN ('INSERT','UPDATE','DELETE'))
);

CREATE INDEX IF NOT EXISTS comodato_auditoria_data_idx     ON public.comodato_auditoria (ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS comodato_auditoria_tabela_idx   ON public.comodato_auditoria (tabela, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS comodato_auditoria_contrato_idx ON public.comodato_auditoria (contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comodato_auditoria_equip_idx    ON public.comodato_auditoria (equipamento_id) WHERE equipamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comodato_auditoria_usuario_idx  ON public.comodato_auditoria (usuario_id);

COMMENT ON TABLE public.comodato_auditoria IS
  'Trilha de auditoria do módulo Comodato: quem criou, alterou ou excluiu o quê e quando. Append-only; só administradores leem.';

ALTER TABLE public.comodato_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_select_comodato_auditoria ON public.comodato_auditoria;
CREATE POLICY admin_select_comodato_auditoria ON public.comodato_auditoria
  FOR SELECT TO authenticated USING (public.comodato_is_admin());

-- ninguém grava direto: só o trigger (SECURITY DEFINER)
REVOKE ALL ON public.comodato_auditoria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comodato_auditoria TO authenticated;

-- imutável
CREATE OR REPLACE FUNCTION public.comodato_auditoria_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'comodato_auditoria é somente leitura (append-only).';
END;
$$;

DROP TRIGGER IF EXISTS comodato_auditoria_imutavel_trg ON public.comodato_auditoria;
CREATE TRIGGER comodato_auditoria_imutavel_trg
  BEFORE UPDATE OR DELETE ON public.comodato_auditoria
  FOR EACH ROW EXECUTE FUNCTION public.comodato_auditoria_imutavel();

-- Descrição legível do registro (para a tela de auditoria)
CREATE OR REPLACE FUNCTION public.comodato_auditoria_resumo(p_tabela TEXT, p_row JSONB)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_txt TEXT;
BEGIN
  CASE p_tabela
    WHEN 'comodato_contratos' THEN
      SELECT 'Contrato ' || COALESCE(NULLIF(p_row->>'numero',''), 's/nº') || ' — ' || COALESCE(c.nome, '?')
        INTO v_txt FROM public.crm_clients c WHERE c.id = (p_row->>'client_id')::UUID;
      v_txt := COALESCE(v_txt, 'Contrato ' || COALESCE(NULLIF(p_row->>'numero',''), 's/nº'));
    WHEN 'comodato_equipamentos' THEN
      v_txt := 'Equipamento ' || COALESCE(p_row->>'codigo_patrimonio', '?');
    WHEN 'comodato_modelos' THEN
      v_txt := 'Modelo ' || COALESCE(p_row->>'nome', '?');
    WHEN 'comodato_alocacoes' THEN
      SELECT 'Alocação de ' || COALESCE(e.codigo_patrimonio, '?') || ' → ' || COALESCE(c.nome, '?')
        INTO v_txt
        FROM (SELECT 1) x
        LEFT JOIN public.comodato_equipamentos e ON e.id = (p_row->>'equipamento_id')::UUID
        LEFT JOIN public.crm_clients c ON c.id = (p_row->>'client_id')::UUID;
    WHEN 'comodato_manutencoes' THEN
      SELECT 'OS ' || COALESCE(p_row->>'tipo', '') || ' — ' || COALESCE(e.codigo_patrimonio, '?')
        INTO v_txt
        FROM (SELECT 1) x
        LEFT JOIN public.comodato_equipamentos e ON e.id = (p_row->>'equipamento_id')::UUID;
    WHEN 'comodato_contrato_aditivos' THEN
      SELECT 'Aditivo ' || COALESCE(NULLIF(p_row->>'numero',''), 's/nº')
             || ' do contrato ' || COALESCE(NULLIF(ct.numero,''), 's/nº')
        INTO v_txt
        FROM (SELECT 1) x
        LEFT JOIN public.comodato_contratos ct ON ct.id = (p_row->>'contrato_id')::UUID;
    ELSE
      v_txt := p_tabela;
  END CASE;
  RETURN v_txt;
EXCEPTION WHEN OTHERS THEN
  RETURN p_tabela;
END;
$$;

CREATE OR REPLACE FUNCTION public.comodato_auditar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_old_full JSONB;
  v_new_full JSONB;
  v_base     JSONB;
  v_old      JSONB;
  v_new      JSONB;
  v_campos   TEXT[];
  v_nome     TEXT;
  v_email    TEXT;
  v_reg      UUID;
  v_contrato UUID;
  v_equip    UUID;
  v_client   UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_full := to_jsonb(NEW);
    v_base     := v_new_full;
    v_new      := v_new_full;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_full := to_jsonb(OLD);
    v_base     := v_old_full;
    v_old      := v_old_full;
  ELSE
    -- Mudanças em cascata (caches mantidos por outras triggers) já são
    -- explicadas pela operação de origem, que é registrada.
    IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

    v_old_full := to_jsonb(OLD);
    v_new_full := to_jsonb(NEW);
    v_base     := v_new_full;

    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_campos
      FROM jsonb_each(v_new_full) n
     WHERE n.key <> 'updated_at'
       AND v_old_full -> n.key IS DISTINCT FROM n.value;

    IF v_campos IS NULL THEN RETURN NULL; END IF;  -- nada relevante mudou

    SELECT jsonb_object_agg(k, v_old_full -> k), jsonb_object_agg(k, v_new_full -> k)
      INTO v_old, v_new
      FROM unnest(v_campos) k;
  END IF;

  v_reg := (v_base->>'id')::UUID;

  v_contrato := CASE TG_TABLE_NAME
    WHEN 'comodato_contratos' THEN v_reg
    ELSE COALESCE((v_new_full->>'contrato_id')::UUID, (v_old_full->>'contrato_id')::UUID)
  END;
  v_equip := CASE TG_TABLE_NAME
    WHEN 'comodato_equipamentos' THEN v_reg
    ELSE COALESCE((v_new_full->>'equipamento_id')::UUID, (v_old_full->>'equipamento_id')::UUID)
  END;
  v_client := COALESCE((v_new_full->>'client_id')::UUID, (v_old_full->>'client_id')::UUID);

  IF v_uid IS NOT NULL THEN
    SELECT u.nome, u.email INTO v_nome, v_email FROM public.crm_users u WHERE u.id = v_uid;
  END IF;

  INSERT INTO public.comodato_auditoria (
    tabela, registro_id, operacao, resumo,
    usuario_id, usuario_nome, usuario_email,
    contrato_id, equipamento_id, client_id,
    campos_alterados, dados_antigos, dados_novos
  ) VALUES (
    TG_TABLE_NAME, v_reg, TG_OP, public.comodato_auditoria_resumo(TG_TABLE_NAME, v_base),
    v_uid,
    COALESCE(v_nome, CASE WHEN v_uid IS NULL THEN 'Sistema / acesso direto ao banco' END),
    v_email,
    v_contrato, v_equip, v_client,
    v_campos, v_old, v_new
  );

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.comodato_auditar() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comodato_modelos','comodato_equipamentos','comodato_contratos',
    'comodato_alocacoes','comodato_manutencoes','comodato_contrato_aditivos'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS comodato_auditar_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER comodato_auditar_trg
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.comodato_auditar()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Hardening: search_path fixo nas funções novas (lint 0011 do Supabase)
-- ---------------------------------------------------------------------
DO $harden$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'comodato_%'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.assinatura);
  END LOOP;
END
$harden$;
