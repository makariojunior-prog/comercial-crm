# Agenda — Responsáveis a partir de usuários ativos do app (Fase 4)

Data: 2026-09-22
Status: aprovado para implementação

## Contexto

No cadastro/edição de compromisso da Agenda (`AppointmentModal`, dentro de
`src/pages/AgendaPage.tsx`), o campo "Responsáveis" lista hoje as opções a
partir da tabela `crm_staff` (`.eq('active', true)`), um cadastro geral de
colaboradores da empresa usado em vários módulos (Visitas, Negócios,
Promotoria). Isso traz duas dores relatadas pelo usuário:

1. A lista mostra pessoas que não estão mais ativas com a empresa — o campo
   `active` do `crm_staff` não reflete de forma confiável quem realmente
   deveria aparecer.
2. O usuário quer especificamente "usuários ativos no app Comercial", não
   colaboradores em geral — ou seja, a fonte certa é `crm_users` (a tabela
   de contas que logam no CRM, com `ativo: boolean`), não `crm_staff`.

Além disso, a lista de opções hoje é renderizada como botões tipo "chip" que
quebram linha (`flex flex-wrap`), ocupando bastante altura de tela quando há
várias pessoas.

Este é o escopo mínimo pedido: trocar a fonte de dados do campo Responsáveis
e mudar sua apresentação visual, **somente** dentro do modal de compromisso
da Agenda. Nenhum outro uso de `crm_staff` no app (Visitas, Negócios,
Promotoria) é alterado.

## Decisão confirmada com o usuário

Fonte de dados passa a ser `crm_users` filtrado por `ativo = true`, em vez
de `crm_staff` filtrado por `active = true`. Isso mostra só pessoas com
conta ativa no CRM Comercial, que é o que o usuário pediu literalmente
("usuários ativos no app Comercial").

## Design técnico

### Fonte de dados

Em `src/pages/AgendaPage.tsx`, o `useEffect` que popula `staffOptions`
(atualmente linhas 46-49):

```tsx
useEffect(() => {
  supabase.from('crm_staff').select('name').eq('active', true).order('name')
    .then(({ data }) => { if (data) setStaffOptions(data.map((s: any) => s.name)) })
}, [])
```

passa a consultar `crm_users` pelo campo `nome` (não `name`) e `ativo`
(não `active`):

```tsx
useEffect(() => {
  supabase.from('crm_users').select('nome').eq('ativo', true).order('nome')
    .then(({ data }) => { if (data) setStaffOptions(data.map((u: any) => u.nome)) })
}, [])
```

A variável e a prop continuam se chamando `staffOptions` (tipo `string[]`)
— só a query muda. Isso significa que nenhum outro código que consome
`staffOptions` (o `<select>` de filtro no topo da página, linha ~138-145,
e o `AppointmentModal`) precisa mudar de estrutura, só passa a receber uma
lista diferente de nomes.

O campo salvo no compromisso (`responsaveis: string[]`, mais
`responsavel: string | null` como espelho do primeiro item, conforme
`save()` em `AppointmentModal`) não muda de formato — continua sendo nomes
em texto livre, então compromissos já existentes com nomes de pessoas que
não têm mais conta em `crm_users` continuam exibindo o nome salvo
normalmente (não há integridade referencial a quebrar).

### Apresentação em lista

Dentro de `AppointmentModal` (`src/pages/AgendaPage.tsx`, bloco atual nas
linhas 621-650), o bloco de botões-chip com `flex flex-wrap` é substituído
por uma lista vertical de checkboxes, dentro de um contêiner com altura
máxima e rolagem:

- Contêiner: borda arredondada, `max-h-40 overflow-y-auto`, para não
  estourar a tela mesmo com muitos usuários ativos.
- Cada linha: um `<label>` clicável com `<input type="checkbox">` +
  nome, usando o mesmo `toggleResp(name)` já existente (nenhuma mudança na
  lógica de seleção — continua multi-seleção livre).
- Estado de carregamento (`staffOptions.length === 0` → "Carregando
  equipe…") é mantido como está.
- A legenda de resumo abaixo (`responsaveis.join(', ')`, linhas 647-649) é
  mantida como está — útil para ver rapidamente quem foi selecionado sem
  precisar rolar a lista.
- Comportamento de `disabled` quando `hasVisitReport` (compromisso já virou
  relatório de visita, não pode mais editar responsáveis) é preservado.

## O que NÃO muda nesta spec

- `crm_staff` e todos os outros lugares que o usam (VisitModal, EventModal,
  DealModal, DashboardVisitas, AgendaWidget, GestaoUsuarios) continuam
  exatamente como estão.
- Nenhuma migration de banco é necessária — `crm_users.ativo` já existe e
  já é a fonte de verdade usada em `GestaoUsuarios.tsx` e `AuthContext.tsx`.
- O formato de armazenamento de `responsaveis`/`responsavel` no compromisso
  não muda.

## Verificação

- `npm run build` / `npx tsc -b tsconfig.app.json` sem erros.
- Verificação manual no preview: abrir novo compromisso na Agenda, conferir
  que a lista de Responsáveis mostra usuários do CRM (comparar com a lista
  de usuários em Gestão de Usuários) e que gente inativa/sem conta no app
  não aparece. Selecionar múltiplos, salvar, reabrir pra edição e confirmar
  que os selecionados persistem. Conferir que a lista tem rolagem quando
  há mais nomes do que cabe na altura máxima.
