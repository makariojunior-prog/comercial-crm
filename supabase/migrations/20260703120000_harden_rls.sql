-- =====================================================================
-- Hardening de RLS — fecha acesso ANÔNIMO (role public/anon) a tabelas
-- do CRM que hoje têm policy "USING (true)" para o role `public`.
--
-- Contexto: no Postgres, uma policy no role `public` também vale para o
-- role `anon`. Como a chave anon é pública (vai no bundle do site), essas
-- policies deixam qualquer pessoa ler e escrever nessas tabelas via API,
-- SEM login. Este migration troca o role de `public` para `authenticated`,
-- preservando o comportamento atual do app (qualquer usuário logado),
-- mas removendo o acesso anônimo.
--
-- NÃO altera as regras por papel (admin/vendedor/leitura) — ver observação
-- no fim do arquivo sobre o próximo passo (scoping por role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- SEÇÃO A — SEGURO DE APLICAR (sem impacto funcional)
-- Tabelas usadas somente pelo app autenticado. Troca public -> authenticated.
-- ---------------------------------------------------------------------

-- deals
DROP POLICY IF EXISTS "Allow all actions for now" ON public.deals;
DROP POLICY IF EXISTS "auth_all_deals" ON public.deals;
CREATE POLICY "auth_all_deals" ON public.deals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- visits
DROP POLICY IF EXISTS "Allow all actions for now" ON public.visits;
DROP POLICY IF EXISTS "auth_all_visits" ON public.visits;
CREATE POLICY "auth_all_visits" ON public.visits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_notes
DROP POLICY IF EXISTS "Allow all crm_notes" ON public.crm_notes;
DROP POLICY IF EXISTS "auth_all_crm_notes" ON public.crm_notes;
CREATE POLICY "auth_all_crm_notes" ON public.crm_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_note_mentions
DROP POLICY IF EXISTS "Allow all crm_note_mentions" ON public.crm_note_mentions;
DROP POLICY IF EXISTS "auth_all_crm_note_mentions" ON public.crm_note_mentions;
CREATE POLICY "auth_all_crm_note_mentions" ON public.crm_note_mentions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_price_items  (tabela de preços — não deve ser pública)
DROP POLICY IF EXISTS "allow_all_crm_price_items" ON public.crm_price_items;
DROP POLICY IF EXISTS "auth_all_crm_price_items" ON public.crm_price_items;
CREATE POLICY "auth_all_crm_price_items" ON public.crm_price_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_deal_history
DROP POLICY IF EXISTS "crm_deal_history_allow_all" ON public.crm_deal_history;
DROP POLICY IF EXISTS "auth_all_crm_deal_history" ON public.crm_deal_history;
CREATE POLICY "auth_all_crm_deal_history" ON public.crm_deal_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_briefings
DROP POLICY IF EXISTS "crm_briefings_allow_all" ON public.crm_briefings;
DROP POLICY IF EXISTS "auth_all_crm_briefings" ON public.crm_briefings;
CREATE POLICY "auth_all_crm_briefings" ON public.crm_briefings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_amostras
DROP POLICY IF EXISTS "Allow all crm_amostras" ON public.crm_amostras;
DROP POLICY IF EXISTS "auth_all_crm_amostras" ON public.crm_amostras;
CREATE POLICY "auth_all_crm_amostras" ON public.crm_amostras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_posvendas_interacoes
DROP POLICY IF EXISTS "Allow all" ON public.crm_posvendas_interacoes;
DROP POLICY IF EXISTS "auth_all_crm_posvendas_interacoes" ON public.crm_posvendas_interacoes;
CREATE POLICY "auth_all_crm_posvendas_interacoes" ON public.crm_posvendas_interacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_task_comments
DROP POLICY IF EXISTS "Allow all" ON public.crm_task_comments;
DROP POLICY IF EXISTS "auth_all_crm_task_comments" ON public.crm_task_comments;
CREATE POLICY "auth_all_crm_task_comments" ON public.crm_task_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_routes
DROP POLICY IF EXISTS "Allow all crm_routes" ON public.crm_routes;
DROP POLICY IF EXISTS "auth_all_crm_routes" ON public.crm_routes;
CREATE POLICY "auth_all_crm_routes" ON public.crm_routes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_route_clients
DROP POLICY IF EXISTS "Allow all crm_route_clients" ON public.crm_route_clients;
DROP POLICY IF EXISTS "auth_all_crm_route_clients" ON public.crm_route_clients;
CREATE POLICY "auth_all_crm_route_clients" ON public.crm_route_clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_route_executions
DROP POLICY IF EXISTS "Allow all crm_route_executions" ON public.crm_route_executions;
DROP POLICY IF EXISTS "auth_all_crm_route_executions" ON public.crm_route_executions;
CREATE POLICY "auth_all_crm_route_executions" ON public.crm_route_executions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- crm_route_client_checks
DROP POLICY IF EXISTS "Allow all crm_route_client_checks" ON public.crm_route_client_checks;
DROP POLICY IF EXISTS "auth_all_crm_route_client_checks" ON public.crm_route_client_checks;
CREATE POLICY "auth_all_crm_route_client_checks" ON public.crm_route_client_checks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------
-- SEÇÃO B — REQUER DECISÃO (comentado; NÃO aplicar sem confirmar)
--
-- Estas policies dão acesso ANÔNIMO deliberado. Parecem servir um painel
-- público ("tv_anon_read") e formulários públicos (vagas / comentários de
-- redes sociais). Se NÃO houver mais nenhuma tela pública consumindo a
-- chave anon, descomente para fechá-las. Atenção especial a
-- `crm_conversations` (expõe conversas de WhatsApp) e aos pedidos.
-- ---------------------------------------------------------------------

-- DROP POLICY IF EXISTS "tv_anon_read"        ON public.crm_conversations; -- WhatsApp exposto
-- DROP POLICY IF EXISTS "tv_anon_read"        ON public.atacado_pedidos;
-- DROP POLICY IF EXISTS "tv_anon_read"        ON public.varejo_pedidos;
-- DROP POLICY IF EXISTS "tv_anon_read"        ON public.agenda_compromissos;
-- DROP POLICY IF EXISTS "anon_read_config"    ON public.atacado_config;
-- DROP POLICY IF EXISTS "anon_read"           ON public.crm_config;
-- Formulários públicos — provavelmente MANTER (site de vagas / captação):
-- DROP POLICY IF EXISTS "vagas_anon_insert"            ON public.candidatos;
-- DROP POLICY IF EXISTS "anon_select_formulario_config" ON public.formulario_config;
-- DROP POLICY IF EXISTS "anon_insert_social_comments"  ON public.crm_social_comments;
-- DROP POLICY IF EXISTS "anon_update_social_comments"  ON public.crm_social_comments;
-- DROP POLICY IF EXISTS "tv_anon_read"                 ON public.crm_social_comments;


-- ---------------------------------------------------------------------
-- SEÇÃO C — pequenas correções apontadas pelos advisors do Supabase
-- ---------------------------------------------------------------------

-- Tabelas com RLS habilitado mas SEM policy (ficam 100% inacessíveis por
-- engano). Adiciona acesso mínimo para authenticated.
DROP POLICY IF EXISTS "auth_all_ia_processing_queue" ON public.ia_processing_queue;
CREATE POLICY "auth_all_ia_processing_queue" ON public.ia_processing_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_read_ia_stop_words" ON public.ia_stop_words;
CREATE POLICY "auth_read_ia_stop_words" ON public.ia_stop_words
  FOR SELECT TO authenticated USING (true);


-- =====================================================================
-- PRÓXIMO PASSO (fora deste migration):
-- Hoje, qualquer usuário logado (inclusive role 'leitura') pode ler/gravar
-- TODAS as tabelas, inclusive folha de pagamento (folha_mensal,
-- colaboradores, comissoes_mensais, atestados...). O controle por módulo
-- (canAccess) é só no frontend. Para valer no banco, criar policies que
-- consultem o papel do usuário, ex.:
--   USING (crm_get_my_role() IN ('admin'))     -- só admin/RH em folha
-- Fazer isso tabela a tabela, alinhado ao ALL_MODULES do AuthContext.
-- =====================================================================
