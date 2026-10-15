-- Visitas: quais produtos foram levados como amostra (itens do catálogo ou texto livre).
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS amostra_produtos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.visits.amostra_produtos IS
  'Produtos levados como amostra na visita (nomes do catálogo crm_price_items ou digitados livremente). Preenchido quando has_amostra = true.';
