-- Comitê (demandas a outros setores, notas por cliente, histórico das reuniões),
-- ocorrências do dia a dia da Logística e a barra de notícias do Comercial (IA).
-- Idempotente. Tabelas novas trazem GRANT explícito (regra de 30/10/2026).

-- ─── Demandas e problemas do Comercial que dependem de outros setores ──────────
create table if not exists public.crm_comite_demandas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text,
  setor           text not null default 'Outro'
                  check (setor in ('Financeiro','Compras','RH','Produção','Logística','Marketing','TI','Diretoria','Outro')),
  tipo            text not null default 'demanda' check (tipo in ('demanda','problema')),
  prioridade      text not null default 'media' check (prioridade in ('alta','media','baixa')),
  status          text not null default 'aberta' check (status in ('aberta','em_andamento','resolvida','cancelada')),
  client_id       uuid references public.crm_clients(id) on delete set null,
  cliente_nome    text,
  responsavel     text,
  prazo           date,
  resolucao       text,
  resolvida_em    timestamptz,
  created_by      uuid default auth.uid(),
  created_by_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists crm_comite_demandas_status_idx on public.crm_comite_demandas (status, created_at desc);
create index if not exists crm_comite_demandas_client_idx on public.crm_comite_demandas (client_id) where client_id is not null;

-- ─── Notas registradas no comitê sobre um cliente / visita / negócio ───────────
create table if not exists public.crm_comite_notas (
  id              uuid primary key default gen_random_uuid(),
  semana_ini      date not null,
  conta           text not null,           -- nome do cliente normalizado (chave da Jornada)
  cliente_nome    text not null,
  client_id       uuid references public.crm_clients(id) on delete set null,
  deal_id         uuid references public.deals(id) on delete set null,
  visit_id        uuid references public.visits(id) on delete set null,
  texto           text not null,
  created_by      uuid default auth.uid(),
  created_by_nome text,
  created_at      timestamptz not null default now()
);
create index if not exists crm_comite_notas_conta_idx  on public.crm_comite_notas (conta);
create index if not exists crm_comite_notas_semana_idx on public.crm_comite_notas (semana_ini);

-- ─── Reuniões do comitê (ata + retrato congelado da semana) ────────────────────
create table if not exists public.crm_comite_reunioes (
  id              uuid primary key default gen_random_uuid(),
  semana_ini      date not null unique,
  semana_fim      date not null,
  realizada_em    date not null default current_date,
  participantes   text[] not null default '{}',
  ata             text,
  encaminhamentos text,
  snapshot        jsonb not null default '{}'::jsonb,
  created_by      uuid default auth.uid(),
  created_by_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Ocorrências do dia a dia da Logística ─────────────────────────────────────
create table if not exists public.log_ocorrencias (
  id              uuid primary key default gen_random_uuid(),
  data            date not null default current_date,
  tipo_id         uuid references public.tipos_ocorrencia(id) on delete set null,
  descricao       text not null,
  gravidade       text not null default 'media' check (gravidade in ('baixa','media','alta')),
  status          text not null default 'aberta' check (status in ('aberta','resolvida')),
  resolucao       text,
  prejuizo        numeric(12,2),
  client_id       uuid references public.crm_clients(id) on delete set null,
  cliente_nome    text,
  driver_id       uuid references public.crm_drivers(id) on delete set null,
  vehicle_id      uuid references public.crm_vehicles(id) on delete set null,
  created_by      uuid default auth.uid(),
  created_by_nome text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists log_ocorrencias_data_idx   on public.log_ocorrencias (data desc);
create index if not exists log_ocorrencias_client_idx on public.log_ocorrencias (client_id) where client_id is not null;

-- ─── Notícias do Comercial (barra que circula nos apps) ────────────────────────
create table if not exists public.crm_noticias (
  id              uuid primary key default gen_random_uuid(),
  lote_id         uuid not null,
  titulo          text not null,
  texto           text,
  categoria       text not null default 'destaque'
                  check (categoria in ('negocio','visita','problema','logistica','varejo','demanda','destaque')),
  relevancia      smallint not null default 3 check (relevancia between 1 and 5),
  publicada       boolean not null default true,
  oculta          boolean not null default false,
  editada         boolean not null default false,
  avaliacao       text check (avaliacao in ('boa','ruim')),
  valida_ate      timestamptz not null default now() + interval '7 days',
  gerada_em       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists crm_noticias_feed_idx on public.crm_noticias (gerada_em desc) where publicada and not oculta;

-- Correções e regras que a IA recebe a cada geração.
create table if not exists public.crm_ia_aprendizados (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null default 'regra' check (tipo in ('regra','correcao','exemplo_bom','exemplo_ruim')),
  texto           text not null,
  noticia_id      uuid references public.crm_noticias(id) on delete set null,
  ativo           boolean not null default true,
  created_by      uuid default auth.uid(),
  created_by_nome text,
  created_at      timestamptz not null default now()
);

create table if not exists public.crm_noticias_config (
  id                 smallint primary key default 1 check (id = 1),
  ativo              boolean not null default true,
  limiar_relevancia  smallint not null default 3 check (limiar_relevancia between 1 and 5),
  max_itens          smallint not null default 12 check (max_itens between 1 and 30),
  ultima_execucao    timestamptz,
  ultimo_status      text,
  updated_at         timestamptz not null default now()
);
insert into public.crm_noticias_config (id) values (1) on conflict (id) do nothing;

-- ─── RLS ───────────────────────────────────────────────────────────────────────
alter table public.crm_comite_demandas  enable row level security;
alter table public.crm_comite_notas     enable row level security;
alter table public.crm_comite_reunioes  enable row level security;
alter table public.log_ocorrencias      enable row level security;
alter table public.crm_noticias         enable row level security;
alter table public.crm_ia_aprendizados  enable row level security;
alter table public.crm_noticias_config  enable row level security;

do $$
declare t text;
begin
  -- Membros do Comercial leem e registram; só Administrador exclui.
  foreach t in array array['crm_comite_demandas','crm_comite_notas','log_ocorrencias'] loop
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.crm_is_member()))', t || '_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.crm_is_member()))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.crm_is_member())) with check ((select public.crm_is_member()))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.crm_get_my_role()) = ''admin'')', t || '_del', t);
  end loop;

  -- Reuniões, notícias, aprendizados e configuração: só Administrador (o feed dos outros apps
  -- passa pela função crm_noticias_feed).
  foreach t in array array['crm_comite_reunioes','crm_noticias','crm_ia_aprendizados','crm_noticias_config'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.crm_get_my_role()) = ''admin'') with check ((select public.crm_get_my_role()) = ''admin'')', t || '_admin', t);
  end loop;
end $$;

-- Leitura das notícias por qualquer membro do Comercial (a barra no próprio CRM).
drop policy if exists crm_noticias_sel_membro on public.crm_noticias;
create policy crm_noticias_sel_membro on public.crm_noticias for select to authenticated
  using ((select public.crm_is_member()) and publicada and not oculta);

-- ─── GRANTs ────────────────────────────────────────────────────────────────────
revoke all on public.crm_comite_demandas, public.crm_comite_notas, public.crm_comite_reunioes,
              public.log_ocorrencias, public.crm_noticias, public.crm_ia_aprendizados,
              public.crm_noticias_config from public, anon;
grant select, insert, update, delete on public.crm_comite_demandas, public.crm_comite_notas,
      public.crm_comite_reunioes, public.log_ocorrencias, public.crm_noticias,
      public.crm_ia_aprendizados, public.crm_noticias_config to authenticated, service_role;

-- updated_at automático
create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.crm_touch_updated_at() from public, anon;

do $$
declare t text;
begin
  foreach t in array array['crm_comite_demandas','crm_comite_reunioes','log_ocorrencias','crm_noticias','crm_noticias_config'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.crm_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ─── Feed da barra de notícias para todos os apps do grupo ─────────────────────
-- Qualquer usuário ativo de um dos apps (Comercial, Financeiro, Compras, RH, Loja, Marketing).
create or replace function public.crm_noticias_feed(p_limite integer default 12)
returns table (id uuid, titulo text, texto text, categoria text, relevancia smallint, gerada_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.crm_is_member() or public.fin_is_member() or public.compras_is_member()
          or public.rh_is_member() or public.loja_is_member() or public.mkt_is_member()) then
    raise exception 'Acesso negado';
  end if;
  return query
    select n.id, n.titulo, n.texto, n.categoria, n.relevancia, n.gerada_em
      from public.crm_noticias n
     where n.publicada and not n.oculta and n.valida_ate > now()
     order by n.gerada_em::date desc, n.relevancia desc, n.gerada_em desc
     limit least(greatest(coalesce(p_limite, 12), 1), 30);
end $$;
revoke all on function public.crm_noticias_feed(integer) from public, anon;
grant execute on function public.crm_noticias_feed(integer) to authenticated;

-- ─── Fechamento da semana do comitê: grava ata + retrato congelado ─────────────
create or replace function public.crm_comite_fechar_semana(
  p_ini date, p_fim date, p_ata text, p_encaminhamentos text, p_participantes text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_snap jsonb;
  v_nome text;
begin
  if coalesce(public.crm_get_my_role(), '') <> 'admin' then
    raise exception 'Somente Administradores acessam o Comitê';
  end if;
  select nome into v_nome from public.crm_users where id = auth.uid();

  v_snap := jsonb_build_object(
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

  insert into public.crm_comite_reunioes (semana_ini, semana_fim, participantes, ata, encaminhamentos, snapshot, created_by_nome)
  values (p_ini, p_fim, coalesce(p_participantes, '{}'), nullif(trim(p_ata), ''), nullif(trim(p_encaminhamentos), ''), v_snap, v_nome)
  on conflict (semana_ini) do update set
    semana_fim = excluded.semana_fim, participantes = excluded.participantes, ata = excluded.ata,
    encaminhamentos = excluded.encaminhamentos, snapshot = excluded.snapshot, realizada_em = current_date
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.crm_comite_fechar_semana(date, date, text, text, text[]) from public, anon;
grant execute on function public.crm_comite_fechar_semana(date, date, text, text, text[]) to authenticated;

-- ─── Segredo do cron da geração de notícias (lido pela Edge Function) ──────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'noticias_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'noticias_cron_secret', 'Cron de gerar-noticias-comercial');
  end if;
end $$;

create or replace function public.crm_noticias_cron_secret()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'noticias_cron_secret'
$$;
revoke all on function public.crm_noticias_cron_secret() from public, anon, authenticated;
grant execute on function public.crm_noticias_cron_secret() to service_role;

-- ─── Agendamento: dias úteis, 08:00 e 13:00 de Brasília (11:00 e 16:00 UTC) ────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'gerar-noticias-comercial') then
    perform cron.unschedule('gerar-noticias-comercial');
  end if;
  perform cron.schedule('gerar-noticias-comercial', '0 11,16 * * 1-5', $job$
    select net.http_post(
      url := 'https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/gerar-noticias-comercial',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'noticias_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000)
  $job$);
end $$;
