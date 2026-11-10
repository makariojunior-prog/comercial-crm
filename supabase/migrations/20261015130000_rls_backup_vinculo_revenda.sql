-- Backup pontual do vínculo de revendas (2026-09-11) estava sem RLS e com grants
-- totais para anon/authenticated (leitura e escrita por qualquer um com a chave anon).
-- Sem policies + RLS ligado = só service_role/owner acessam. A tabela é mantida como backup.
DO $$
BEGIN
  IF to_regclass('public.backup_vinculo_revenda_20260911') IS NOT NULL THEN
    ALTER TABLE public.backup_vinculo_revenda_20260911 ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.backup_vinculo_revenda_20260911 FROM anon, authenticated;
  END IF;
END $$;
