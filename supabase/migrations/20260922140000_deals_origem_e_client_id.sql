-- Classificação filtrável (Novo/Incremental) + vínculo real com cliente
-- existente quando o negócio for "incremental" — mesmo padrão que
-- crm_events.client_id já estabeleceu (ver EventModal.tsx).
alter table public.deals
  add column if not exists origem_negocio text
    check (origem_negocio is null or origem_negocio in ('NOVO', 'INCREMENTAL')),
  add column if not exists client_id uuid references public.crm_clients(id);
