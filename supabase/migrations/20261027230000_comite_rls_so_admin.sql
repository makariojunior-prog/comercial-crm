-- Comitê (demandas e notas) passa a ser exclusivo de Administradores também no banco.
-- Antes: qualquer membro do CRM lia/escrevia pela API. A interface já era só admin.
do $$
declare t text;
begin
  foreach t in array array['crm_comite_demandas','crm_comite_notas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.crm_get_my_role()) = ''admin'') with check ((select public.crm_get_my_role()) = ''admin'')', t || '_admin', t);
  end loop;
end $$;
