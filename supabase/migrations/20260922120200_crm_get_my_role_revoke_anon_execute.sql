-- O linter de segurança do Supabase apontou que crm_get_my_role() ficou
-- executável por PUBLIC (padrão do Postgres para funções em schema public),
-- incluindo o role anon. A função só deve responder para quem está logado.
revoke execute on function public.crm_get_my_role() from public;
grant execute on function public.crm_get_my_role() to authenticated;
