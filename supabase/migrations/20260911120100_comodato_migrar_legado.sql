-- =====================================================================
-- MÓDULO COMODATO — migração do texto livre para o formato estruturado
--
-- Lê crm_clients.comodato (texto livre, ex.: "2 FREEZER FRICON 450LT,
-- ARMÁRIO VAZIO 58X70") e crm_clients.valor, mais atacado_clientes
-- (comodato / comodato_valor / comodato_data / comodato_obs) quando essa
-- tabela existir, e produz:
--
--   • comodato_modelos      — um por descrição distinta encontrada
--   • comodato_equipamentos — uma unidade por peça (quantidade expandida),
--                             origem='legado', revisar=TRUE
--   • comodato_contratos    — um por cliente, status pendente_assinatura
--   • comodato_alocacoes    — a alocação ativa que liga unidade ↔ cliente
--
-- O texto original é preservado em crm_clients.comodato_legado ANTES de
-- qualquer trigger reescrever crm_clients.comodato.
--
-- A migração é IDEMPOTENTE: clientes que já possuem contrato de origem
-- 'legado' são ignorados. A função pode ser reexecutada depois de novas
-- sincronizações com a planilha:
--
--   SELECT * FROM public.comodato_migrar_legado();
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Helpers de texto
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_sem_acento(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(
    UPPER(COALESCE(p, '')),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'AAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- Classifica um item de texto em uma das categorias do catálogo
CREATE OR REPLACE FUNCTION public.comodato_categoria_por_texto(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.comodato_sem_acento(p) ~ 'FREEZER|FRIZER|CONGELADOR'   THEN 'FREEZER'
    WHEN public.comodato_sem_acento(p) ~ 'ARMARIO|ARMARIOS'            THEN 'ARMARIO'
    WHEN public.comodato_sem_acento(p) ~ 'FORNO'                       THEN 'FORNO'
    WHEN public.comodato_sem_acento(p) ~ 'EXPOSITOR|EXPOSITORA'        THEN 'EXPOSITOR'
    WHEN public.comodato_sem_acento(p) ~ 'ESTUFA'                      THEN 'ESTUFA'
    WHEN public.comodato_sem_acento(p) ~ 'BALCAO'                      THEN 'BALCAO'
    WHEN public.comodato_sem_acento(p) ~ 'VITRINE'                     THEN 'VITRINE'
    WHEN public.comodato_sem_acento(p) ~ 'GELADEIRA|REFRIGERADOR'      THEN 'GELADEIRA'
    WHEN public.comodato_sem_acento(p) ~ 'MASSEIRA'                    THEN 'MASSEIRA'
    WHEN public.comodato_sem_acento(p) ~ 'CILINDRO'                    THEN 'CILINDRO'
    WHEN public.comodato_sem_acento(p) ~ 'FRITADEIRA'                  THEN 'FRITADEIRA'
    WHEN public.comodato_sem_acento(p) ~ 'MICRO.?ONDAS|MICROONDAS'     THEN 'MICROONDAS'
    ELSE 'OUTROS'
  END;
$$;

-- Converte "R$ 1.900,00" / "1900" / "1.900,50" em numeric
CREATE OR REPLACE FUNCTION public.comodato_parse_valor(p TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT := regexp_replace(COALESCE(p, ''), '[^0-9,.]', '', 'g');
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF v ~ ',' AND v ~ '\.' THEN
    v := replace(replace(v, '.', ''), ',', '.');       -- 1.900,50
  ELSIF v ~ ',' THEN
    v := replace(v, ',', '.');                          -- 1900,50
  ELSIF v ~ '\.[0-9]{3}$' THEN
    v := replace(v, '.', '');                           -- 1.900  (milhar)
  END IF;
  RETURN NULLIF(v, '')::NUMERIC;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Um texto livre de comodato vira N linhas (descricao, quantidade).
-- Separadores: ; + / quebra de linha, e vírgula NÃO seguida de dígito
-- (para não quebrar "ARMÁRIO 1,20M").
CREATE OR REPLACE FUNCTION public.comodato_split_itens(p TEXT)
RETURNS TABLE (descricao TEXT, quantidade INTEGER)
LANGUAGE sql
IMMUTABLE
AS $$
  WITH bruto AS (
    SELECT TRIM(parte) AS parte
      FROM regexp_split_to_table(
             COALESCE(p, ''),
             '\s*(?:[;+/\n\r]|,(?!\s*[0-9]))\s*'
           ) AS parte
  ),
  util AS (
    SELECT parte
      FROM bruto
     WHERE parte <> ''
       -- descarta marcadores que não são equipamento
       AND public.comodato_sem_acento(parte) !~ '^(NAO|N|NA|N/A|SEM|SEM COMODATO|NENHUM|X|-+|0|COMODATO|SIM)$'
       AND parte ~ '[A-Za-zÀ-ÿ]'
  )
  SELECT
    NULLIF(TRIM(regexp_replace(parte, '^\s*[0-9]+\s*(X|UN|UND|UNID|PC|PCS)?\s*[-–:]?\s*', '', 'i')), '')
      AS descricao,
    GREATEST(
      COALESCE(NULLIF(substring(parte FROM '^\s*([0-9]{1,3})\s*(?:X|UN|UND|UNID|PC|PCS)?\s'), '')::INTEGER, 1),
      1
    ) AS quantidade
  FROM util
  WHERE NULLIF(TRIM(regexp_replace(parte, '^\s*[0-9]+\s*(X|UN|UND|UNID|PC|PCS)?\s*[-–:]?\s*', '', 'i')), '') IS NOT NULL;
$$;

COMMENT ON FUNCTION public.comodato_split_itens(TEXT) IS
  'Quebra o texto livre de comodato em itens (descricao, quantidade). Vírgula seguida de dígito não separa, para preservar medidas como "1,20M".';

-- ---------------------------------------------------------------------
-- 2. A migração propriamente dita
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comodato_migrar_legado()
RETURNS TABLE (
  clientes_migrados     INTEGER,
  contratos_criados     INTEGER,
  modelos_criados       INTEGER,
  equipamentos_criados  INTEGER,
  clientes_sem_parse    INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  r_cli        RECORD;
  r_item       RECORD;
  v_contrato   UUID;
  v_modelo     UUID;
  v_equip      UUID;
  v_cat        TEXT;
  v_valor      NUMERIC;
  v_total_un   INTEGER;
  v_i          INTEGER;
  c_clientes   INTEGER := 0;
  c_contratos  INTEGER := 0;
  c_modelos    INTEGER := 0;
  c_equips     INTEGER := 0;
  c_falhas     INTEGER := 0;
  v_tem_atacado BOOLEAN := to_regclass('public.atacado_clientes') IS NOT NULL;
BEGIN
  -- 2.1 Preserva o texto original antes de qualquer reescrita
  UPDATE public.crm_clients
     SET comodato_legado = comodato
   WHERE comodato IS NOT NULL
     AND TRIM(comodato) <> ''
     AND comodato_legado IS NULL;

  -- 2.2 Traz para crm_clients o comodato que só existe no ERP (atacado_clientes),
  --     casando por nome normalizado. Não sobrescreve texto já existente.
  IF v_tem_atacado THEN
    UPDATE public.crm_clients c
       SET comodato_legado = a.comodato
      FROM public.atacado_clientes a
     WHERE public.comodato_sem_acento(c.nome) = public.comodato_sem_acento(a.cliente)
       AND a.comodato IS NOT NULL AND TRIM(a.comodato) <> ''
       AND (c.comodato_legado IS NULL OR TRIM(c.comodato_legado) = '');
  END IF;

  -- 2.3 Percorre os clientes com comodato em texto e ainda não migrados
  FOR r_cli IN
    SELECT c.id,
           c.nome,
           COALESCE(NULLIF(TRIM(c.comodato_legado), ''), NULLIF(TRIM(c.comodato), '')) AS texto,
           c.valor,
           c.tipo
      FROM public.crm_clients c
     WHERE COALESCE(NULLIF(TRIM(c.comodato_legado), ''), NULLIF(TRIM(c.comodato), '')) IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM public.comodato_contratos ct
              WHERE ct.client_id = c.id AND ct.origem = 'legado'
           )
     ORDER BY c.nome
  LOOP
    -- quantas unidades esse cliente terá no total (para decidir o rateio do valor)
    SELECT COALESCE(SUM(quantidade), 0) INTO v_total_un
      FROM public.comodato_split_itens(r_cli.texto);

    IF v_total_un = 0 THEN
      -- texto presente mas sem item reconhecível ("SIM", "-", "0"…)
      c_falhas := c_falhas + 1;
      CONTINUE;
    END IF;

    v_valor := public.comodato_parse_valor(r_cli.valor);

    -- 2.3.1 Contrato do cliente
    INSERT INTO public.comodato_contratos (
      client_id, empresa, status, contrato_assinado,
      valor_total_bens, origem, observacoes
    )
    VALUES (
      r_cli.id,
      CASE WHEN public.comodato_sem_acento(r_cli.tipo) LIKE '%CANTINA%'
             AND public.comodato_sem_acento(r_cli.tipo) NOT LIKE '%LUMAR%'
           THEN 'cantina' ELSE 'lumar' END,
      'pendente_assinatura',
      FALSE,
      v_valor,
      'legado',
      'Importado automaticamente do campo livre de comodato do cadastro. Texto original: ' || r_cli.texto
    )
    RETURNING id INTO v_contrato;
    c_contratos := c_contratos + 1;

    -- 2.3.2 Enriquece com o que o ERP souber (data e valor do comodato)
    IF v_tem_atacado THEN
      UPDATE public.comodato_contratos ct
         SET data_inicio      = COALESCE(ct.data_inicio, a.comodato_data),
             valor_total_bens = COALESCE(ct.valor_total_bens, a.comodato_valor),
             observacoes      = ct.observacoes ||
                                COALESCE(E'\nObservação do ERP: ' || NULLIF(TRIM(a.comodato_obs), ''), '')
        FROM public.atacado_clientes a
       WHERE ct.id = v_contrato
         AND public.comodato_sem_acento(a.cliente) = public.comodato_sem_acento(r_cli.nome);

      SELECT valor_total_bens INTO v_valor FROM public.comodato_contratos WHERE id = v_contrato;
    END IF;

    -- 2.3.3 Itens
    FOR r_item IN SELECT * FROM public.comodato_split_itens(r_cli.texto) LOOP
      v_cat := public.comodato_categoria_por_texto(r_item.descricao);

      -- modelo: reaproveita se a mesma descrição já existir
      SELECT id INTO v_modelo
        FROM public.comodato_modelos
       WHERE UPPER(TRIM(nome)) = UPPER(TRIM(r_item.descricao))
       LIMIT 1;

      IF v_modelo IS NULL THEN
        INSERT INTO public.comodato_modelos (nome, categoria, observacoes)
        VALUES (UPPER(TRIM(r_item.descricao)), v_cat,
                'Criado pela migração do campo livre de comodato — revisar marca, modelo e valor de referência.')
        RETURNING id INTO v_modelo;
        c_modelos := c_modelos + 1;
      END IF;

      -- uma unidade por peça
      FOR v_i IN 1..r_item.quantidade LOOP
        INSERT INTO public.comodato_equipamentos (
          codigo_patrimonio, modelo_id, situacao, estado_conservacao,
          valor_aquisicao, origem, revisar, observacoes
        )
        VALUES (
          NULL,                      -- gerado pelo trigger (FRZ-0001, ARM-0002…)
          v_modelo,
          'disponivel',              -- a alocação abaixo muda para em_comodato
          'bom',
          -- valor conhecido só no total: rateia entre as unidades e marca para revisão
          CASE WHEN v_valor IS NULL THEN NULL
               WHEN v_total_un = 1 THEN v_valor
               ELSE ROUND(v_valor / v_total_un, 2) END,
          'legado',
          TRUE,
          'Unidade criada pela migração do texto livre do cliente ' || r_cli.nome ||
          '. Confirmar número de série, estado e valor.' ||
          CASE WHEN v_valor IS NOT NULL AND v_total_un > 1
               THEN ' Valor rateado: total de ' || v_valor || ' dividido por ' || v_total_un || ' unidades.'
               ELSE '' END
        )
        RETURNING id INTO v_equip;
        c_equips := c_equips + 1;

        INSERT INTO public.comodato_alocacoes (
          equipamento_id, contrato_id, client_id, status,
          data_entrega, origem, observacoes
        )
        VALUES (
          v_equip, v_contrato, r_cli.id, 'ativa',
          COALESCE(
            (SELECT data_inicio FROM public.comodato_contratos WHERE id = v_contrato),
            CURRENT_DATE
          ),
          'legado',
          'Alocação reconstruída a partir do cadastro do cliente — data de entrega presumida.'
        );
      END LOOP;
    END LOOP;

    c_clientes := c_clientes + 1;
  END LOOP;

  RETURN QUERY SELECT c_clientes, c_contratos, c_modelos, c_equips, c_falhas;
END;
$$;

COMMENT ON FUNCTION public.comodato_migrar_legado() IS
  'Converte o campo livre de comodato dos clientes em modelos/unidades/contratos/alocações. Idempotente: ignora clientes que já têm contrato origem=legado.';

-- ---------------------------------------------------------------------
-- 3. Relatório de revisão — o que a máquina não conseguiu decidir sozinha
-- ---------------------------------------------------------------------
-- A seção 3.c só é incluída se a tabela atacado_clientes existir neste banco.
DO $viewblk$
DECLARE
  v_sql TEXT;
BEGIN
  v_sql := $v$
CREATE VIEW public.comodato_revisao_importacao
WITH (security_invoker = true) AS
-- 3.a Unidades criadas pela migração que ainda precisam de conferência
SELECT
  'equipamento_a_revisar'::TEXT              AS tipo_pendencia,
  c.id                                        AS client_id,
  c.nome                                      AS client_nome,
  e.id                                        AS equipamento_id,
  e.codigo_patrimonio                         AS referencia,
  COALESCE(m.nome, '—')                       AS descricao,
  c.comodato_legado                           AS texto_original
FROM public.comodato_equipamentos e
LEFT JOIN public.comodato_modelos m ON m.id = e.modelo_id
LEFT JOIN public.crm_clients c      ON c.id = e.client_id
WHERE e.revisar

UNION ALL

-- 3.b Clientes com texto de comodato que a migração não conseguiu interpretar
SELECT
  'texto_nao_interpretado'::TEXT,
  c.id,
  c.nome,
  NULL::UUID,
  NULL::TEXT,
  COALESCE(NULLIF(TRIM(c.comodato_legado), ''), NULLIF(TRIM(c.comodato), '')),
  c.comodato_legado
FROM public.crm_clients c
WHERE COALESCE(NULLIF(TRIM(c.comodato_legado), ''), NULLIF(TRIM(c.comodato), '')) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.comodato_alocacoes a WHERE a.client_id = c.id)
$v$;

  IF to_regclass('public.atacado_clientes') IS NOT NULL THEN
    v_sql := v_sql || $v$

UNION ALL

-- 3.c Clientes que têm comodato no ERP mas não existem no CRM (nada a migrar)
SELECT
  'cliente_ausente_no_crm'::TEXT,
  NULL::UUID,
  a.cliente,
  NULL::UUID,
  NULL::TEXT,
  a.comodato,
  a.comodato
FROM public.atacado_clientes a
WHERE a.comodato IS NOT NULL AND TRIM(a.comodato) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_clients c
     WHERE public.comodato_sem_acento(c.nome) = public.comodato_sem_acento(a.cliente)
  )
$v$;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.comodato_revisao_importacao CASCADE';
  EXECUTE v_sql;
END
$viewblk$;

COMMENT ON VIEW public.comodato_revisao_importacao IS
  'Fila de conferência pós-migração: unidades criadas a partir de texto livre, textos não interpretados e clientes que só existem no ERP.';

REVOKE ALL  ON public.comodato_revisao_importacao FROM anon;
GRANT SELECT ON public.comodato_revisao_importacao TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Executa a migração agora
-- ---------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.comodato_migrar_legado();
  RAISE NOTICE 'Comodato — migração do legado: % clientes, % contratos, % modelos, % equipamentos, % textos não interpretados.',
    r.clientes_migrados, r.contratos_criados, r.modelos_criados, r.equipamentos_criados, r.clientes_sem_parse;
END $$;
