-- Primeira função de checagem de role no banco deste projeto (proposta em
-- 20260703120000_harden_rls.sql, comentário final). Reutilizável por outras
-- policies/views no futuro, alinhado com ALL_MODULES do AuthContext.
create or replace function public.crm_get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.crm_users where id = auth.uid()
$$;

-- View somente-leitura de crm_price_items que mascara o campo `custo` para
-- quem não é Administrador. Como toda margem exibida no frontend é
-- calculada a partir de custo + preço (não existem colunas de margem na
-- tabela), ocultar custo já oculta as margens automaticamente.
-- security_invoker = true faz a view respeitar a RLS da tabela base.
create or replace view public.crm_price_items_view
with (security_invoker = true) as
select
  id,
  empresa,
  nome,
  case when public.crm_get_my_role() = 'admin' then custo else null end as custo,
  preco_lumar,
  preco_varejo,
  preco_revenda,
  pf,
  ativo,
  created_at,
  updated_at
from public.crm_price_items;

-- A view é só leitura: escrita continua indo direto pra crm_price_items
-- (RLS da tabela base já cobre isso). Revoga qualquer escrita acidental na
-- view, seguindo o mesmo cuidado do fix recente em crm_posvendas.
revoke insert, update, delete, truncate on public.crm_price_items_view from anon, authenticated;
grant select on public.crm_price_items_view to authenticated;
