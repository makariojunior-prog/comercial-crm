-- Vínculo com o negócio criado a partir do compromisso, no mesmo padrão
-- de visit_id/crm_event_id já existentes nesta tabela.
alter table public.agenda_compromissos
  add column if not exists deal_id uuid references public.deals(id);
