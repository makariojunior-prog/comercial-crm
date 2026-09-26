-- Garante que o widget de status dos deliveries (99Food & iFood) esteja fixo no topo do dashboard para todos os usuários
INSERT INTO public.dashboard_fixed_widgets (widget_id, visible, ordem, updated_at)
SELECT 'status_loja', true, -1, now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.dashboard_fixed_widgets WHERE widget_id = 'status_loja'
);
