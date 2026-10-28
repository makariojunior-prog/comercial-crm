-- Retrato da semana do Comitê numa função própria (só leitura), para a ata poder montar a síntese
-- automática antes de salvar. crm_comite_fechar_semana passa a usá-la (comportamento idêntico).
create or replace function public.crm_comite_retrato(p_ini date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê';
  end if;
  return jsonb_build_object(
    'resumo', public.crm_comite_resumo_semana(p_ini, p_fim),
    'visitas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'cliente', v.client_name, 'data', v.visit_date, 'tipo', v.visit_type,
               'responsaveis', coalesce(nullif(array_to_string(v.responsaveis, ', '), ''), v.responsible),
               'amostra', coalesce(v.has_amostra, false), 'relatorio', left(v.report, 600))
             order by v.visit_date), '[]'::jsonb)
        from public.visits v
       where v.status = 'Realizada' and v.visit_date between p_ini and p_fim),
    'negocios', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'cliente', d.client_name, 'status', d.status, 'tipo', d.deal_type,
               'novo', d.start_date between p_ini and p_fim,
               'movimentos', (select count(*) from public.crm_deal_history h
                               where h.deal_id = d.id
                                 and (h.updated_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim),
               'ganho', exists (select 1 from public.crm_deal_history h
                                 where h.deal_id = d.id and h.status_after = 'SUCESSO' and h.status_before is distinct from 'SUCESSO'
                                   and (h.updated_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim))
             order by d.client_name), '[]'::jsonb)
        from public.deals d
       where d.start_date between p_ini and p_fim
          or exists (select 1 from public.crm_deal_history h where h.deal_id = d.id
                      and (h.updated_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim)),
    'ocorrencias', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'data', o.data, 'tipo', t.nome, 'gravidade', o.gravidade, 'status', o.status,
               'cliente', o.cliente_nome, 'descricao', left(o.descricao, 400))
             order by o.data), '[]'::jsonb)
        from public.log_ocorrencias o left join public.tipos_ocorrencia t on t.id = o.tipo_id
       where o.data between p_ini and p_fim),
    'demandas_abertas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'titulo', d.titulo, 'setor', d.setor, 'tipo', d.tipo, 'prioridade', d.prioridade,
               'status', d.status, 'desde', d.created_at::date)
             order by d.created_at), '[]'::jsonb)
        from public.crm_comite_demandas d
       where d.status in ('aberta','em_andamento') and d.created_at::date <= p_fim),
    'notas', (
      select coalesce(jsonb_agg(jsonb_build_object('cliente', n.cliente_nome, 'texto', n.texto, 'por', n.created_by_nome)
             order by n.created_at), '[]'::jsonb)
        from public.crm_comite_notas n where n.semana_ini = p_ini)
  );
end $$;

revoke all on function public.crm_comite_retrato(date, date) from public, anon;
grant execute on function public.crm_comite_retrato(date, date) to authenticated, service_role;

create or replace function public.crm_comite_fechar_semana(p_ini date, p_fim date, p_ata text, p_encaminhamentos text, p_participantes text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_snap jsonb;
  v_nome text;
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê';
  end if;
  select nome into v_nome from public.crm_users where id = auth.uid();

  v_snap := public.crm_comite_retrato(p_ini, p_fim);

  insert into public.crm_comite_reunioes (semana_ini, semana_fim, participantes, ata, encaminhamentos, snapshot, created_by_nome)
  values (p_ini, p_fim, coalesce(p_participantes, '{}'), nullif(trim(p_ata), ''), nullif(trim(p_encaminhamentos), ''), v_snap, v_nome)
  on conflict (semana_ini) do update set
    semana_fim = excluded.semana_fim, participantes = excluded.participantes, ata = excluded.ata,
    encaminhamentos = excluded.encaminhamentos, snapshot = excluded.snapshot, realizada_em = current_date
  returning id into v_id;
  return v_id;
end $$;
