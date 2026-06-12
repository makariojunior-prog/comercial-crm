-- Corrige alerta crítico do Supabase: rls_disabled_in_public
-- (repo público + anon key conhecida = acesso total sem RLS)

-- Front (usuários logados) faz CRUD completo aqui
ALTER TABLE crm_delivery_sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON crm_delivery_sectors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Usadas apenas por Edge Functions (service role ignora RLS) — sem policy = front bloqueado
ALTER TABLE ia_stop_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_processing_queue ENABLE ROW LEVEL SECURITY;
