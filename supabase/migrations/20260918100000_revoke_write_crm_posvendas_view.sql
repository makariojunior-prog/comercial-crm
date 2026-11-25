-- crm_posvendas é uma VIEW (RLS não se aplica) e estava com todos os privilégios
-- liberados para anon: qualquer pessoa com a anon key pública podia ler, alterar,
-- apagar e truncar dados de pós-venda. O app só faz SELECT (PosVendaTab,
-- PosVendaWidget) e a RPC tv_dashboard_snapshot (chamada como anon pela TV) só lê.
-- Mantém SELECT; remove todo o resto.
revoke insert, update, delete, truncate, references, trigger
  on public.crm_posvendas from anon, authenticated;
