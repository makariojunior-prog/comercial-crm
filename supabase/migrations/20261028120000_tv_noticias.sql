-- Barra de notícias da Cantina TV (repo dashboard-tv). A TV usa só a chave anon + PIN, então a leitura
-- passa por uma função SECURITY DEFINER no mesmo molde de tv_dashboard_snapshot: devolve apenas
-- id, título, categoria e relevância das notícias publicadas e vigentes (sem o texto).
create or replace function public.tv_noticias()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb)
  from (
    select n.id, n.titulo, n.categoria, n.relevancia
      from public.crm_noticias n
     where n.publicada and not n.oculta and n.valida_ate > now()
     order by n.gerada_em::date desc, n.relevancia desc, n.gerada_em desc
     limit 15
  ) t
$$;

revoke all on function public.tv_noticias() from public;
grant execute on function public.tv_noticias() to anon, authenticated, service_role;
