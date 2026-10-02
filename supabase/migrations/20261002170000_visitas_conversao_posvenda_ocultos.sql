-- 1) Visitas podem virar Negócio ou Promotoria (mesmo fluxo da Agenda): guarda o vínculo
--    para a tela mostrar "já criado" e não duplicar.
alter table public.visits
  add column if not exists deal_id uuid references public.deals(id) on delete set null,
  add column if not exists crm_event_id uuid references public.crm_events(id) on delete set null;

-- 2) Clientes fora da Pós-Venda/Recompra: só administradores marcam/desmarcam
--    (antes qualquer membro do CRM podia escrever). Leitura continua igual.
drop policy if exists posvendas_ignorados_write on public.posvendas_ignorados;
create policy posvendas_ignorados_write on public.posvendas_ignorados
  for all to authenticated
  using (coalesce(public.crm_get_my_role(), '') = 'admin')
  with check (coalesce(public.crm_get_my_role(), '') = 'admin');

grant select on public.posvendas_ignorados to anon, authenticated;
grant insert, delete on public.posvendas_ignorados to authenticated;

-- Pedido do usuário (02/10/2026): este número também não funciona no WhatsApp.
insert into public.posvendas_ignorados (telefone, motivo) values
  ('62996169302', 'Sem WhatsApp (informado pelas atendentes)')
on conflict (telefone) do nothing;
