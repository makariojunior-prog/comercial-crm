# Negócios — Visualização em Kanban (Fase 6)

Data: 2026-09-22
Status: aprovado para implementação

## Contexto

Hoje `/negocios` (`src/pages/RegistroNegocios.tsx`) é uma lista vertical
expansível: cada negócio é uma linha com badges (status/tipo/prioridade),
nome do cliente e datas; clicar expande a própria linha mostrando contato,
interesse, acompanhamento, histórico e botões de ação (Atualizar rápido /
Editar / Histórico / Excluir). Há busca por texto e filtros por
status/tipo/responsável, mais ordenação.

O campo `status` do negócio (`DealStatus`: `NOVO` | `EM ANDAMENTO` |
`SUCESSO` | `DESISTIU` | `CANCELADO`, `src/types/index.ts:1,347`) já
funciona como a etapa do funil — não existe uma tabela de etapas separada
e configurável. Não existe campo de valor monetário no negócio.

Este documento substitui essa lista por um board Kanban arrastável,
agrupado pelas 5 etapas, seguindo as decisões abaixo.

## Decisões confirmadas com o usuário

1. **Substitui a lista por completo** — não fica um alternador entre lista
   e board; o Kanban é a única visualização de `/negocios` daqui pra frente.
2. **As 5 colunas sempre aparecem**, com um botão para ocultar as 3
   colunas de fechados (`SUCESSO`/`DESISTIU`/`CANCELADO`), preferência
   persistida por usuário (mesmo mecanismo que já existe para ordem do
   menu/widgets do dashboard, em `PreferencesContext`).
3. **Rolagem horizontal em desktop e celular**, mesmo padrão usado pelo
   Trello (confirmado via pesquisa) — colunas lado a lado, arrastável por
   toque no celular também (não vira acordeão nem uma coluna por vez).
4. **Arrastar um card muda o status imediatamente**, sem popup de
   confirmação, e grava um registro em `crm_deal_history`
   (`status_before`/`status_after`), sem exigir nota de acompanhamento.
5. **Clicar no corpo do card abre o `DealModal`** de edição completa
   (mesmo modal usado hoje pelo botão "Editar").
6. Pra não perder funcionalidade que hoje existe na linha expandida, cada
   card tem, além do corpo clicável:
   - Ícone de WhatsApp (se houver telefone de contato)
   - Atalho **"Mover para..."** com as 5 etapas — alternativa ao arrastar
     (útil no celular quando a etapa de destino está longe na tela, e
     também serve de atalho no desktop)
   - Menu **"⋮"** com **Histórico** (popover leve reaproveitando
     `DealHistoryTimeline`) e **Excluir** (com confirmação, igual hoje)

## Design técnico

### Arquitetura de arquivos

A página principal fica menor; o board vira componentes próprios,
seguindo o padrão de arquivos focados já usado no restante do projeto:

- `src/pages/RegistroNegocios.tsx` — cabeçalho, barra de busca/filtros,
  carregamento de dados (`load()`), estado dos modais (`editDeal`,
  historyDeal), lógica de mover/excluir um negócio. Renderiza
  `<KanbanBoard>`.
- `src/components/KanbanBoard.tsx` (novo) — `DndContext` do `@dnd-kit`,
  agrupa os negócios filtrados por status em colunas, `DragOverlay` pra
  feedback visual ao arrastar, chama `onMove` no drop.
- `src/components/KanbanColumn.tsx` (novo) — uma coluna droppable: cabeçalho
  (nome da etapa + contador), lista de `KanbanCard`.
- `src/components/KanbanCard.tsx` (novo) — um card draggable: badges,
  nome do cliente, responsável(is), datas, ícone WhatsApp, atalho "Mover
  para...", menu "⋮" (Histórico/Excluir). `onClick` no corpo do card abre
  o `DealModal` (distingue clique de arrasto via `activationConstraint`
  de distância do `@dnd-kit`, então um toque rápido sem mover ainda
  dispara o clique normalmente).
- `src/components/DealHistoryModal.tsx` (novo, pequeno) — modal simples
  que embrulha o `DealHistoryTimeline` já existente, reutilizado pelo menu
  "⋮" do card.

`DealModal.tsx` e `QuickUpdateModal.tsx` não mudam — continuam sendo
usados como estão hoje (edição completa e, se algum outro lugar do app
ainda os referenciar, sem alteração de contrato). O botão "Atualizar
rápido" da linha antiga não tem equivalente direto no card — a decisão 6
cobre a necessidade dele via "Mover para..." (mudar status rápido) +
clique no card (editar tudo, incluindo follow-up).

`DealModal` continua sempre criando negócios novos com `status: 'NOVO'`
(comportamento atual do botão "+ Novo" no cabeçalho, mantido). Não haverá
botão de "+" por coluna nesta fase — fora de escopo, YAGNI.

### Dependência nova

`@dnd-kit/core` + `@dnd-kit/utilities` (primeira lib de drag-and-drop do
projeto). **Não** é necessário `@dnd-kit/sortable` — a ordem dos cards
dentro de cada coluna continua controlada pelo dropdown "Ordenar por" já
existente (mais recentes / último contato / A-Z cliente / prioridade), não
por reordenação manual arrastando dentro da mesma coluna.

Sensores: `PointerSensor` com `activationConstraint: { distance: 8 }` —
funciona tanto para mouse quanto touch, e a distância mínima evita que um
toque/clique simples seja interpretado como início de arrasto (permitindo
o `onClick` do card abrir o `DealModal` normalmente). `autoScroll`
habilitado no `DndContext` para rolar o board horizontalmente ao arrastar
um card até a borda da tela.

### Mudança de status (drag e "Mover para...")

Uma função única, compartilhada pelos dois gatilhos (solto no drop e
clique no atalho "Mover para..."):

```ts
async function moveDeal(deal: Deal, newStatus: DealStatus) {
  if (deal.status === newStatus) return
  const { error } = await supabase.from('deals').update({ status: newStatus }).eq('id', deal.id)
  if (error) { /* mostra erro, não grava histórico */ return }
  await supabase.from('crm_deal_history').insert({
    deal_id: deal.id,
    client_name: deal.client_name,
    status_before: deal.status,
    status_after: newStatus,
    follow_up: null,
    last_contact_date: null,
  })
  load() // recarrega a lista pra refletir o novo status
}
```

`follow_up`/`last_contact_date` ficam `null` no registro de histórico
(em vez de copiar os valores antigos do negócio) — isso evita repetir a
mesma nota de acompanhamento em múltiplos registros de histórico só porque
o card foi arrastado várias vezes; a timeline já cai para `updated_at`
(a data/hora real do evento) quando `last_contact_date` é nulo — ver
`DealHistoryTimeline`, linha 53, que sempre usa `updated_at` para exibir
a data, e `QuickUpdateModal`, linha 162-164 (mesma lógica de fallback).

Atualização otimista na UI: ao soltar o card, ele já aparece na nova
coluna imediatamente (estado local atualizado), e a chamada ao Supabase
roda em paralelo; se falhar, o card volta pra coluna original e mostra um
erro (`toast` via `sonner`, já usado no projeto — ver `src/App.tsx:3`).

### Barra de busca/filtros (topo da página)

Mantém: busca por texto (cliente/contato/acompanhamento/interesse), filtro
por tipo, filtro por responsável, ordenar por (afeta a ordem dentro de
cada coluna), contador de resultados, botão Excel, botão atualizar, botão
"+ Novo". **Remove** o filtro de status (dropdown `filterStatus`) — as
colunas do board já cumprem esse papel. **Adiciona** o botão "Ocultar
fechados" (liga/desliga a preferência).

### Preferência "ocultar fechados"

Em `src/contexts/PreferencesContext.tsx`, adicionar ao `UserPreferences`:

```ts
negociosOcultarFechados: boolean
```

Com default `false`, seguindo exatamente o mesmo padrão de leitura
(`loadPrefs`), escrita (`updateNegociosOcultarFechados`, salvando em
`localStorage` por usuário) e exposição via `usePreferences()` já usado
para `sidebarMode`.

### Layout do board

Container com `overflow-x-auto`, colunas com largura fixa (`w-72` ou
similar) lado a lado (`flex gap-3`), cada uma com altura máxima e rolagem
vertical interna (`max-h-[calc(100vh-...)] overflow-y-auto`) para não
esticar a página inteira quando uma coluna tem muitos cards. Cabeçalho de
cada coluna usa a cor já associada ao status em `StatusBadge.tsx`
(`statusConfig`), pra manter consistência visual com os badges que já
existem em outras telas.

### Card — conteúdo

Reaproveitando os campos já exibidos na linha de hoje: `TypeBadge` +
`PriorityBadge` (não repete `StatusBadge` — a coluna já indica o status),
nome do cliente, responsável(is) (`getResponsaveis(deal)`), data de início
e último contato, um resumo curto do `follow_up` se existir (1-2 linhas,
truncado). Sem indicador de valor monetário — não existe esse campo.

## O que NÃO muda nesta spec

- `Deal`/`DealStatus`/`DealHistory` types e a tabela `deals`/`crm_deal_history`
  não mudam de estrutura.
- `DealModal.tsx` e `QuickUpdateModal.tsx` continuam existindo sem
  alteração de contrato (só passam a ser abertos a partir do novo board
  em vez da lista antiga).
- `NegociosCard`/`DealCard`/`AlertDealRow` do widget do Dashboard
  (`DashboardNegocios.tsx`) não mudam — são uma view separada e menor,
  fora de escopo.
- Nenhuma restrição de permissão nova é introduzida — hoje qualquer
  usuário autenticado com acesso ao módulo pode mudar o status de
  qualquer negócio (sem checagem de `isAdmin`/`canEdit`), e isso
  continua assim no Kanban (arrastar/mover não fica restrito a
  administrador).
- Não há botão de criar negócio direto numa coluna específica — só o
  "+ Novo" do cabeçalho, que sempre cria em `NOVO`.

## Verificação

- `npx tsc -b tsconfig.app.json` sem erros.
- Verificação manual no preview: abrir `/negocios`, conferir que as 5
  colunas aparecem com os negócios certos; arrastar um card entre colunas
  e confirmar que o status muda e aparece um novo registro no histórico
  (abrindo "⋮" → Histórico); testar "Mover para..." como alternativa ao
  arrastar; clicar no corpo do card e confirmar que abre o `DealModal`;
  testar "Ocultar fechados" e confirmar que a preferência persiste depois
  de recarregar a página; testar busca/filtro/ordenação; testar em
  viewport mobile (rolagem horizontal + toque funcionando).
