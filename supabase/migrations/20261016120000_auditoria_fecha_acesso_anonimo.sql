-- Auditoria 16/10/2026: fecha o que a chave anon (pública, vai no bundle) ainda conseguia ler ou gravar
-- nas tabelas do Comercial. Idempotente; só mexe em objetos do Comercial.
--
-- Antes desta migration, sem login, dava para ler: crm_conversations (WhatsApp), varejo_pedidos
-- (nome/telefone/endereço de clientes), atacado_pedidos, agenda_compromissos, crm_posvendas,
-- crm_social_comments e crm_users (e-mail, papel e módulos de cada pessoa); e gravar em
-- crm_social_comments e lojas_delivery_status; e chamar sync_varejo_clientes (reescreve varejo_clientes).
--
-- A TV (repo dashboard-tv) só usa tv_verify_pin e tv_dashboard_snapshot. A RPC passa a ser
-- SECURITY DEFINER, então continua devolvendo o mesmo JSON sem precisar das leituras anônimas
-- diretas (tv_anon_read). Efeito colateral: os blocos 'visitas' e 'recompras' da TV, que vinham
-- vazios para anon (sem política anon em visits/crm_posvendas_interacoes), passam a vir preenchidos.

-- 1. TV: a RPC lê com os direitos do dono; as tabelas deixam de ser legíveis pela anon -----------
alter function public.tv_dashboard_snapshot() security definer;
alter function public.tv_dashboard_snapshot() set search_path = public;

drop policy if exists tv_anon_read on public.crm_conversations;
drop policy if exists tv_anon_read on public.varejo_pedidos;
drop policy if exists tv_anon_read on public.atacado_pedidos;
drop policy if exists tv_anon_read on public.agenda_compromissos;
drop policy if exists tv_anon_read on public.crm_social_comments;
-- atacado_config: só a sync-atacado lê (service role)
drop policy if exists anon_read_config on public.atacado_config;

-- 2. Redes sociais: quem grava é a instagram-webhook / cantina-automacoes, ambas com service role
drop policy if exists anon_insert_social_comments on public.crm_social_comments;
drop policy if exists anon_update_social_comments on public.crm_social_comments;

-- 3. Pós-venda: ocultos só para quem é do Comercial (antes: anon e qualquer logado de outro app)
drop policy if exists posvendas_ignorados_select on public.posvendas_ignorados;
create policy posvendas_ignorados_select on public.posvendas_ignorados
  for select to authenticated using ((select public.crm_is_member()));

-- 4. crm_users: a lista de ativos (autocomplete; o RH também lê) deixa de ser pública
drop policy if exists read_active_users_autocomplete on public.crm_users;
create policy read_active_users_autocomplete on public.crm_users
  for select to authenticated using (ativo = true);
drop policy if exists self_select on public.crm_users;
create policy self_select on public.crm_users
  for select to authenticated using (id = (select auth.uid()));

-- 5. Status do delivery: as Edge Functions gravam com service role (que ignora RLS). As políticas
--    "service_role" estavam no papel public, ou seja, valiam para a anon também.
drop policy if exists "Permitir service_role deletar status" on public.lojas_delivery_status;
drop policy if exists "Permitir service_role inserir status" on public.lojas_delivery_status;
drop policy if exists "Permitir service_role atualizar status" on public.lojas_delivery_status;
drop policy if exists "Permitir leitura dos status de delivery" on public.lojas_delivery_status;
-- (fica "Authenticated users can read delivery status": Comercial e Loja leem logados)

-- 6. Fila de IA: era "true" para qualquer logado de qualquer app
drop policy if exists auth_all_ia_processing_queue on public.ia_processing_queue;
create policy auth_all_ia_processing_queue on public.ia_processing_queue
  for all to authenticated
  using ((select public.crm_is_member())) with check ((select public.crm_is_member()));

-- 7. sync_varejo_clientes: só membro do Comercial, search_path fixo e sem reescrever as ~2 mil
--    linhas a cada clique (só atualiza quem mudou)
create or replace function public.sync_varejo_clientes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_afetados integer;
begin
  if not public.crm_is_member() then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;

  with pedidos_agg as (
    select telefone,
           count(*)                                            as qtd_pedidos,
           round(sum(coalesce(valor_liquido, 0))::numeric, 2) as valor_total,
           max(data_entrega)                                  as ultimo_pedido
      from varejo_pedidos
     where telefone is not null and telefone <> ''
     group by telefone
  ),
  pedidos_recente as (
    select distinct on (telefone)
           telefone, cliente as nome, bairro, endereco_completo as endereco, origem as canal_origem
      from varejo_pedidos
     where telefone is not null and telefone <> ''
     order by telefone, data_entrega desc nulls last, created_at desc nulls last
  )
  insert into varejo_clientes
    (nome, telefone, endereco, bairro, cidade, canal_origem, qtd_pedidos, valor_total, ultimo_pedido, status)
  select
    coalesce(nullif(trim(r.nome), ''), 'Sem nome'),
    r.telefone,
    r.endereco,
    r.bairro,
    case
      when r.endereco ~ '[A-Z]{2}$'
      then trim(regexp_replace(
             trim(split_part(r.endereco, ',', array_length(string_to_array(r.endereco, ','), 1))),
             '\s*-\s*[A-Z]{2}$', ''))
      else null
    end,
    r.canal_origem,
    a.qtd_pedidos,
    a.valor_total,
    a.ultimo_pedido,
    case
      when a.qtd_pedidos >= 5 and a.ultimo_pedido >= current_date - interval '90 days' then 'VIP'
      when a.ultimo_pedido >= current_date - interval '90 days' then 'ATIVO'
      else 'INATIVO'
    end
  from pedidos_recente r
  join pedidos_agg a on a.telefone = r.telefone
  on conflict (telefone) do update set
    nome          = excluded.nome,
    bairro        = coalesce(excluded.bairro,       varejo_clientes.bairro),
    endereco      = coalesce(excluded.endereco,     varejo_clientes.endereco),
    cidade        = coalesce(excluded.cidade,       varejo_clientes.cidade),
    canal_origem  = coalesce(excluded.canal_origem, varejo_clientes.canal_origem),
    qtd_pedidos   = excluded.qtd_pedidos,
    valor_total   = excluded.valor_total,
    ultimo_pedido = excluded.ultimo_pedido,
    status        = excluded.status,
    updated_at    = now()
  where (varejo_clientes.nome, varejo_clientes.bairro, varejo_clientes.endereco, varejo_clientes.cidade,
         varejo_clientes.canal_origem, varejo_clientes.qtd_pedidos, varejo_clientes.valor_total,
         varejo_clientes.ultimo_pedido, varejo_clientes.status)
        is distinct from
        (excluded.nome, coalesce(excluded.bairro, varejo_clientes.bairro),
         coalesce(excluded.endereco, varejo_clientes.endereco), coalesce(excluded.cidade, varejo_clientes.cidade),
         coalesce(excluded.canal_origem, varejo_clientes.canal_origem), excluded.qtd_pedidos,
         excluded.valor_total, excluded.ultimo_pedido, excluded.status);

  get diagnostics v_afetados = row_count;
  return jsonb_build_object('ok', true, 'atualizados', v_afetados,
                            'total', (select count(*) from varejo_clientes));
end;
$function$;
revoke all on function public.sync_varejo_clientes() from public, anon;
grant execute on function public.sync_varejo_clientes() to authenticated;

-- 8. search_path fixo nas funções de gatilho do Comercial (linter 0011)
alter function public.handle_new_auth_user() set search_path = public;
alter function public.update_varejo_updated_at() set search_path = public;
alter function public.update_crm_users_updated_at() set search_path = public;
alter function public.queue_conversation_for_processing() set search_path = public;
alter function public.set_updated_at_conciliacao() set search_path = public;
alter function public.gerar_lancamentos_recorrentes() set search_path = public;
alter function public.crm_positivacao_periodo_fim(date) set search_path = public;

-- 9. Grants: a anon não precisa de nada direto nas tabelas do Comercial (a TV usa as RPCs, que
--    rodam como dono). TRUNCATE não respeita RLS: sai de anon e authenticated.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
       and c.relname ~ '^(crm_|varejo_|atacado_|agenda_|comodato_|frota_|romaneio_|posvendas_|automacao_|lojas_delivery_status$|delivery_webhook_logs$|ia_processing_queue$|deals$|visits$|cobranca$|dashboard_fixed_widgets$|ifood_acoes_log$|tv_pin_attempts$)'
  loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end $$;

-- 10. Índice duplicado (idx_atacado_pedidos_cliente = atacado_pedidos_cliente_id_idx): só custa escrita
drop index if exists public.idx_atacado_pedidos_cliente;
