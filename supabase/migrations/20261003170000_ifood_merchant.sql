-- iFood (módulo Merchant): auditoria das ações que mudam a loja (pausar, reabrir, horários)
-- e agendamento do sync de status. Já aplicado em produção (cron via MCP em 03/10/2026).

create table if not exists public.ifood_acoes_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  nome       text,
  acao       text not null,
  detalhe    jsonb,
  ok         boolean not null,
  resposta   jsonb,
  created_at timestamptz not null default now()
);

alter table public.ifood_acoes_log enable row level security;

-- Só administradores leem; a escrita é da Edge Function (service role ignora RLS).
drop policy if exists ifood_acoes_log_select on public.ifood_acoes_log;
create policy ifood_acoes_log_select on public.ifood_acoes_log
  for select to authenticated
  using (coalesce(public.crm_get_my_role(), '') = 'admin');

grant select on public.ifood_acoes_log to authenticated;

-- Status do iFood a cada 5 min, das 9h às 23h55 (Brasília = UTC-3 → 12h–02h55 UTC).
-- Usa a chave pública (anon): a função só atualiza lojas_delivery_status, sem entrada do chamador.
-- (Instrução SQL separada: cron.schedule roda uma vez; reaplicar não duplica pelo nome.)
select cron.schedule('ifood-sync-status', '*/5 12-23,0-2 * * *', $job$
  select net.http_post(
    url     := 'https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/sync-ifood-status',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjgwNzcsImV4cCI6MjA5MzAwNDA3N30.G923g-1cmjrQZi7EoOcZcP1PieO9AKmk4mMMUgT4hbE')
  );
$job$);
