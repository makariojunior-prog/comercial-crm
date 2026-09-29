# Card de Negócios compacto no Dashboard

## Objetivo
Trocar o card "Negócios Ativos" do dashboard por uma versão bem compacta: só nome do cliente, responsável e tempo sem contato, em cards pequenos. Sem detalhes (tipo, prioridade, acompanhamento, contato).

## Regras
- Mostra sempre os negócios **NOVO** e **EM ANDAMENTO**.
- Os demais status (**SUCESSO**, **DESISTIU**, **CANCELADO**) aparecem só se mudaram de status nos **últimos 7 dias**, num grupo "Encerrados (7 dias)".
- Data da mudança de status: última linha de `crm_deal_history` com `status_after` fechado e `updated_at` nos últimos 7 dias (o Kanban e a atualização rápida já gravam histórico). Fallback: `deals.end_date` nos últimos 7 dias, para negócios sem histórico.
- Mini-card: nome (truncado), primeiro responsável, badge de dias sem contato (`Hoje` verde, `Xd` neutro, vermelho acima de 10 dias, como `isStale`).
- Ordem dentro de cada grupo: mais dias sem contato primeiro (o que precisa de atenção sobe).
- Clique no mini-card abre a atualização rápida (`QuickUpdateModal`), como hoje.
- Cabeçalho mantém "Novo" e o link "Kanban".
- O bloco de alerta vermelho "sem contato há mais de 10 dias" sai (o badge vermelho do mini-card cobre o caso).

## Cor por etapa
Cards do Kanban e mini-cards do dashboard ganham tom sutil da etapa (`statusTint` em `StatusBadge.tsx`, mesma paleta dos cabeçalhos: azul, âmbar, verde, vermelho, cinza). O vermelho de "parado" fica só no badge de dias.

## Visitas Recentes (mesmo PR)
A data sai da linha de baixo e fica só na tag ao lado do tipo ("Entrega"/"Acompanhamento"), que passa a mostrar também datas antigas (dd/MM). O responsável sobe para a linha do nome. Ganha uma linha a menos por card.

## Estrutura
- Novo `src/components/DashboardNegociosCard.tsx` com o card e o mini-card (sai de `DashboardNegocios.tsx`, que já é grande). Substitui `NegociosCard`, `CompactSection`, `AlertDealRow` e `DealCard`.
- `DashboardNegocios.tsx` carrega o histórico recente dos fechados (uma consulta leve) e passa `novo`, `emAndamento` e `encerrados` ao card. O card é usado nos dois pontos onde já aparece (widget `negocios` e legado `visitas_negocios`).

## Fora de escopo
Filtros, drag-and-drop e detalhes no dashboard (ficam no Kanban).

## Verificação
`tsc -b`, `npm run build` e conferência visual do card no dashboard (desktop e celular).
