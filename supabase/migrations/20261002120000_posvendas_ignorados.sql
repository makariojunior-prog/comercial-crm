-- Lista de telefones fora da Pós-Venda/Recompra (ex.: número sem WhatsApp, que só dá
-- "não está no WhatsApp" e polui a lista). crm_posvendas é uma view recalculada dos pedidos
-- do varejo, então apagar linha não adianta: a exclusão tem que estar na própria view.

create table if not exists public.posvendas_ignorados (
  telefone   text primary key,
  motivo     text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.posvendas_ignorados enable row level security;

-- Leitura para anon também: a view é security_invoker e a RPC da TV (tv_dashboard_snapshot,
-- anon) a consulta. Só contém telefones que a própria view já expõe a anon.
drop policy if exists posvendas_ignorados_select on public.posvendas_ignorados;
create policy posvendas_ignorados_select on public.posvendas_ignorados
  for select to anon, authenticated using (true);

drop policy if exists posvendas_ignorados_write on public.posvendas_ignorados;
create policy posvendas_ignorados_write on public.posvendas_ignorados
  for all to authenticated using (public.crm_is_member()) with check (public.crm_is_member());

grant select on public.posvendas_ignorados to anon, authenticated;
grant insert, delete on public.posvendas_ignorados to authenticated;

-- A view é a mesma de antes + exclusão dos ignorados em "uc" (mesma lógica de prioridade).
create or replace view public.crm_posvendas with (security_invoker = on) as
 WITH uc AS (
         SELECT varejo_pedidos.telefone,
            max(varejo_pedidos.cliente) AS nome,
            max(varejo_pedidos.data_entrega) AS ult_compra,
            max(COALESCE(varejo_pedidos.qtd_pedidos_cliente, 1)) AS n_pedidos
           FROM varejo_pedidos
          WHERE varejo_pedidos.status_icon <> '❌'::text AND varejo_pedidos.origem = 'CARDAPIO WEB'::text AND varejo_pedidos.data_entrega IS NOT NULL AND varejo_pedidos.data_entrega <= CURRENT_DATE AND varejo_pedidos.telefone IS NOT NULL AND varejo_pedidos.telefone <> ''::text
            AND NOT EXISTS (SELECT 1 FROM posvendas_ignorados pi WHERE pi.telefone = varejo_pedidos.telefone)
          GROUP BY varejo_pedidos.telefone
        ), ui AS (
         SELECT crm_posvendas_interacoes.telefone,
            max(crm_posvendas_interacoes.data_interacao) AS ult_interacao
           FROM crm_posvendas_interacoes
          GROUP BY crm_posvendas_interacoes.telefone
        ), base AS (
         SELECT uc.telefone,
            uc.nome,
            uc.ult_compra,
            uc.n_pedidos,
            ui.ult_interacao,
            GREATEST(uc.ult_compra, COALESCE(ui.ult_interacao, uc.ult_compra)) AS data_ref
           FROM uc
             LEFT JOIN ui ON ui.telefone = uc.telefone
        )
 SELECT telefone,
    nome,
    ult_compra::text AS ult_compra,
    ult_interacao::text AS ult_interacao,
    CURRENT_DATE - ult_compra AS dias_pos_compra,
    CURRENT_DATE - data_ref AS dias_sem_contato,
    n_pedidos,
        CASE
            WHEN n_pedidos = 1 AND (CURRENT_DATE - ult_compra) >= 7 AND (CURRENT_DATE - data_ref) < 40 AND (ult_interacao IS NULL OR ult_interacao < ult_compra) THEN 1
            WHEN (CURRENT_DATE - data_ref) >= 40 THEN 2
            ELSE 3
        END AS prioridade
   FROM base
  ORDER BY (
        CASE
            WHEN n_pedidos = 1 AND (CURRENT_DATE - ult_compra) >= 7 AND (CURRENT_DATE - data_ref) < 40 AND (ult_interacao IS NULL OR ult_interacao < ult_compra) THEN 1
            WHEN (CURRENT_DATE - data_ref) >= 40 THEN 2
            ELSE 3
        END), (CURRENT_DATE - data_ref) DESC;

-- Pedido do usuário (02/10/2026): números que o WhatsApp responde como inexistentes.
insert into public.posvendas_ignorados (telefone, motivo) values
  ('16996422588', 'Sem WhatsApp (informado pelas atendentes)'),
  ('16997014265', 'Sem WhatsApp (informado pelas atendentes)'),
  ('32992221082', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62914766693', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62918222444', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62920028761', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62920029298', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62929426550', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62944096202', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62963876463', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62981014643', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62981165343', 'Sem WhatsApp (informado pelas atendentes)'),
  ('62981603361', 'Sem WhatsApp (informado pelas atendentes)')
on conflict (telefone) do nothing;
