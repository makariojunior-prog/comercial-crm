# Desativação de módulos não utilizados — Fase 1-3 (Amostras, IA, Conversas, Tabelas)

Data: 2026-09-22
Status: aprovado para implementação

## Contexto

O app Comercial tem várias funções que não estão sendo usadas hoje e confundem os
colaboradores. A decisão é desativar/reduzir escopo mantendo todo o código e
aprendizado armazenado, para retomar essas frentes no futuro (ex.: o Briefing/IA
será retomado assim que os demais módulos estiverem com boa qualidade de entrada
de dados).

Este documento cobre as fases 1, 2 e 3 do plano geral de desativação (agrupadas a
pedido do usuário):

- **Fase 1** — Amostras, IA (Briefing) e Simular: desativação/arquivamento
- **Fase 2** — Conversas: desligar monitoramento e webhooks, manter só o envio
  automático de WhatsApp, renomear módulo
- **Fase 3** — Tabelas: restringir custos/margens a Administrador (nível banco,
  não só interface), remover botão de atualizar

Fases seguintes (Agenda, Promotoria, Negócios/Kanban, Logística) ficam para
depois, com suas próprias specs.

## Branch

`feat/desativar-modulos-fase1-3`, criada a partir de `main`. Arquivos não
commitados já presentes na árvore de trabalho (`DELIVERY_MONITORING.md`,
`supabase/functions/food99-webhook`, `supabase/functions/ifood-webhook`,
`supabase/functions/test-get-logs`, a migration
`20260908210000_delivery_monitoring_tables.sql`) são trabalho em andamento do
usuário e não são tocados nem incluídos nos commits desta spec.

## Decisões confirmadas com o usuário

1. Desativação de módulo = tirar do menu **e** bloquear a rota (não é só
   esconder do menu; navegar direto pela URL também deixa de funcionar).
2. "Módulo IA" = página Briefing (rotulada "IA" no menu). A classificação por
   IA das conversas (webhook Digisac) é desligada junto por consequência de
   desligar o monitoramento de Conversas (fase 2), não como ação separada.
3. Webhook de Conversas: desligar a função inteira agora (webhook de entrada +
   alertas internos automáticos para Supervisor/Logística/Nutricionista), sem
   tentar preservar nada dela. Será redesenhada no futuro.
4. Página de Conversas vira "Automações" sem abas — conteúdo direto é a função
   de envio automático, rotulada "Whatsapp" internamente.
5. Número de WhatsApp exibido na tela: campo novo, editável por Administrador,
   preenchido manualmente depois do deploy (sem valor pré-definido).
6. Botão removido em Tabelas é o de atualizar/recarregar (não existe botão de
   "sincronizar" nesse módulo hoje — confirmado com o usuário, engano de
   referência a outro módulo).
7. Restrição de custos/margens em Tabelas deve ser real (nível banco), não
   apenas de interface — RLS do projeto hoje é aberta (`USING (true)` em quase
   todas as tabelas), então esconder só na tela não impediria acesso técnico
   ao dado bruto.
8. Edição do campo `custo` no cadastro/edição de produto também fica restrita
   a Administrador (não só a visualização em listagem/exportação).

## Design técnico

### 1. Amostras, IA (Briefing) e Simular — desativação uniforme

Mesmo mecanismo para os três módulos, sem gate de permissão (ninguém deve
acessar agora, nem Administrador):

- `src/components/Layout.tsx`: remover as entradas de `NAV_ITEMS` para
  `amostras`, `briefing` e `simulador`.
- `src/App.tsx`: remover as rotas `/amostras`, `/briefing`, `/simulador`.
  Adicionar uma rota coringa `<Route path="*" element={<Navigate to="/dashboard" replace />} />`
  dentro do `<Layout>` (hoje não existe nenhuma — sem isso, uma URL removida
  cairia em área de conteúdo em branco em vez de redirecionar).
- `src/contexts/AuthContext.tsx`: remover as 3 entradas correspondentes de
  `ALL_MODULES`, para que também somem do grid de permissões em
  `GestaoUsuarios.tsx` (evita que um admin "libere" um módulo que não existe
  mais na prática).
- Nenhum arquivo de página é apagado (`SolicitarAmostras.tsx`,
  `SimularVendas.tsx`, `BriefingBI.tsx` continuam intactos no repo). Reativar
  no futuro é reverter estes pontos de menu/rota/permissão.

### 2. Conversas → Automações

- `src/pages/ConversacoesPage.tsx`: remover a aba "Conversas" (monitoramento)
  e o seletor de abas (`vista`); o conteúdo da página passa a ser diretamente
  o que hoje é `AutomacaoTab`, sem wrapper de abas.
- `src/components/Layout.tsx`: renomear label do item de menu de "Conversas"
  para "Automações" (rota continua `/conversas` para não quebrar links
  existentes).
- `src/contexts/AuthContext.tsx`: atualizar label da entrada `conversas` em
  `ALL_MODULES` para "Automações" — `id` interno (`conversas`) não muda, para
  preservar permissões já concedidas a usuários existentes.
- Dentro da página, o título/seção da função de envio passa a se chamar
  "Whatsapp".
- Novo campo de exibição do número de WhatsApp em uso: coluna
  `numero_whatsapp` (texto) na tabela `automacao_config`, editável apenas por
  Administrador (reaproveitando o padrão `isAdmin` já usado no restante de
  `AutomacaoTab.tsx`), exibida no cabeçalho da página para todos os usuários
  com acesso ao módulo. Como `automacao_config` não está em migration
  versionada (foi criada diretamente no banco), a migration desta spec faz um
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS numero_whatsapp text`.
- Dashboard: remover `ConversacoesAlertasWidget` de
  `src/pages/DashboardNegocios.tsx` (case `conversas_alertas` no seletor de
  widgets) e da lista de widgets configuráveis em
  `SettingsPage.tsx`/`FixedWidgetsSection`. O componente
  `ConversacoesAlertasWidget.tsx` não é apagado, só desconectado.
- `supabase/functions/digisac-webhook/index.ts`: adicionar um retorno neutro
  (ex.: `200 OK` sem processar) logo no início da function, antes de qualquer
  chamada a Anthropic/Gemini ou gravação em `crm_conversations` — desliga o
  consumo de créditos de IA e a gravação de conversas a partir do próximo
  deploy, sem depender de reconfiguração no painel do Digisac. Os alertas
  internos automáticos (Supervisor/Logística/Nutricionista) somem como
  consequência direta, conforme confirmado.
- `supabase/functions/reprocess-conversations`: não é alterada nem apagada,
  apenas deixa de ter qualquer chamador na UI (a aba que a acionava não existe
  mais).
- `supabase/functions/automacao-lumar` e o restante de `AutomacaoTab.tsx`
  (envio automático de mensagens de entrega) **não são alterados** — usam
  credenciais Digisac separadas do webhook de entrada, função independente.

### 3. Tabelas — custos/margens restritos a Administrador (nível banco)

- **Nova migration** (`supabase/migrations/<timestamp>_crm_price_items_admin_only_cost.sql`):
  - Função `crm_get_my_role()`: `SECURITY DEFINER`, `STABLE`, retorna o
    `role` (`crm_users.role`) do usuário autenticado (`auth.uid()`). Primeira
    função reutilizável de checagem de role no banco deste projeto — fica
    disponível para outras frentes de segurança RLS no futuro.
  - View `crm_price_items_view`: espelha todas as colunas de
    `crm_price_items`, substituindo `custo` por `NULL` quando
    `crm_get_my_role() <> 'admin'`. Criada com `security_invoker = true` para
    respeitar a RLS da tabela base. Apenas `SELECT` concedido a
    `authenticated` (sem `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`, seguindo o
    mesmo cuidado do fix recente em `crm_posvendas`).
  - Como toda margem exibida no frontend é calculada a partir de `custo` +
    preço, ocultar `custo` já oculta as margens automaticamente — não é
    necessário mascarar campos de margem separadamente (eles não existem como
    colunas, são calculados em `TabelasPreco.tsx`).
- `src/pages/TabelasPreco.tsx`:
  - Trocar a leitura de `crm_price_items` para `crm_price_items_view`.
  - Toggle "Modo Tabela": para Administrador, continua igual (pode alternar
    ver/ocultar). Para não-admin, fica sempre travado em oculto, sem o botão
    de alternância (não faz sentido oferecer um toggle cujo dado nunca chega).
  - Remover o botão de atualizar/recarregar (ícone refresh) do cabeçalho.
  - Exportação Excel (`exportPriceItems`) não muda — já respeita o estado de
    `modoTabela`.
- `src/components/PriceItemModal.tsx`: campo "Custo" só é renderizado no
  formulário quando `isAdmin` (usar `useAuth()`, padrão já usado em outros
  componentes do projeto). Para não-admin, o campo simplesmente não existe no
  formulário e não é enviado no `insert`/`update`. Gravação continua indo
  direto para a tabela base `crm_price_items` (a view é somente leitura) —
  nada muda no fluxo de escrita além da omissão do campo.
- Fora de escopo (não implementado nesta spec): bloquear não-admin de
  criar/editar produtos inteiramente. Hoje qualquer usuário com acesso ao
  módulo Tabelas pode continuar cadastrando/editando itens (exceto o campo
  custo); se isso precisar mudar, é uma decisão separada e futura.

## O que NÃO muda nesta spec

- Nenhuma tabela de dados é apagada; nenhum dado histórico é perdido.
- `automacao-lumar` (envio automático de WhatsApp por entrega) segue
  funcionando exatamente como hoje.
- RLS geral do projeto continua como está (aberta na maioria das tabelas) —
  esta spec só adiciona a função de role e a view específica de preços; não é
  uma correção geral de RLS (isso é tratado na frente de segurança RLS já em
  andamento do usuário, branch `fix/rls-posvendas-view`).
- Fases 4-7 (Agenda, Promotoria, Negócios/Kanban, Logística) ficam para specs
  futuras.

## Pendências registradas para o futuro (não desta spec)

- Quando o módulo Compras estiver pronto, Tabelas passará a puxar os produtos
  de lá (lembrete do usuário).
- Retomar o módulo IA/Briefing assim que os demais módulos estiverem sendo
  usados com qualidade de dados suficiente.
- Conversas/monitoramento será redesenhado — este desligamento é temporário.

## Verificação

- Rodar `npm run build`/typecheck localmente para garantir que a remoção de
  rotas, nav items e módulos não deixa referências quebradas.
- Testar manualmente no preview: navegar direto para `/amostras`, `/briefing`,
  `/simulador` deslogado→logado e confirmar redirecionamento para
  `/dashboard`.
- Testar a tela de Automações: sem abas, envio automático funcionando igual,
  campo de número de WhatsApp editável por admin e visível para todos.
- Testar Tabelas logado como admin (custo visível, toggle funciona, campo
  custo editável) e como não-admin (custo sempre oculto, sem toggle, campo
  custo ausente no modal).
- Confirmar no Supabase Studio que a migration cria `crm_get_my_role()` e
  `crm_price_items_view` corretamente, e que a view não aceita escrita.
