# Integração Agenda ↔ Negócios ↔ Promotoria (Fase 7)

Data: 2026-09-22
Status: aprovado para implementação

## Contexto

A Agenda (`src/pages/AgendaPage.tsx`, componente `AppointmentModal`) já
permite converter um compromisso em relatório de **Visita**: uma seção
retrátil no modal de edição que, ao ser marcada, mostra campos extras e,
ao salvar, cria um registro em `visits` vinculado ao compromisso via
`agenda_compromissos.visit_id` (e trava o compromisso inteiro pra edição,
já que virar relatório é um encerramento).

Esta fase adiciona duas conversões novas no mesmo modal, seguindo o mesmo
padrão visual/estrutural:

1. **Converter em Negócio** — cria um registro em `deals`.
2. **Cadastrar Promotoria** — cria um registro em `crm_events`.

Investigação encontrou uma peça já existente e não documentada: criar/
editar um evento de Promotoria (`EventModal.tsx`) já faz um *upsert* em
`agenda_compromissos` usando `crm_event_id` como chave de conflito —
ou seja, **Promotoria → Agenda já sincroniza automaticamente**. Só que a
Agenda não sabe disso (`crm_event_id` nem existe no tipo
`AgendaCompromisso` hoje) e não tem como criar uma Promotoria a partir de
lá. Esta fase completa o caminho inverso (Agenda → Promotoria),
reaproveitando a mesma coluna de vínculo.

## Decisões confirmadas com o usuário

1. Duas seções retráteis novas no `AppointmentModal`, mesmo padrão visual
   de "Converter em relatório de visita" (não é um fluxo/botão separado).
2. `origem_negocio` (Novo/Incremental) é um campo persistido no negócio,
   não só uma escolha momentânea — disponível para filtrar depois.
3. O campo fica disponível em **todo** cadastro de negócio (`DealModal`),
   não só nos criados via conversão da Agenda — com um filtro
   correspondente no Kanban de Negócios.
4. "Negócio Incremental" ganha um vínculo real (`client_id`, FK pra
   `crm_clients`) via busca — mesmo padrão que Promotoria já usa.
   "Negócio Novo" mantém o campo de cliente como texto livre (cliente
   ainda não tem cadastro).
5. "Cadastrar Promotoria" usa um formulário enxuto dentro do compromisso
   (tipo de evento, data, cliente, observações) — não as 3 abas
   completas (materiais/equipe) que `EventModal` tem; esses detalhes
   continuam sendo preenchidos na tela de Promotoria normalmente, já
   vinculada.
6. Diferente da conversão em Visita, converter em Negócio ou cadastrar
   Promotoria **não trava o compromisso inteiro** — só impede reconverter
   a mesma seção duas vezes (uma vez criado o vínculo, aquela seção some/
   mostra "já vinculado"). O resto do compromisso continua editável.

## Design técnico

### 1. Migrations

```sql
-- deals: classificação (filtrável) + vínculo real com cliente existente
-- quando o negócio for do tipo "incremental".
alter table public.deals
  add column if not exists origem_negocio text
    check (origem_negocio is null or origem_negocio in ('NOVO', 'INCREMENTAL')),
  add column if not exists client_id uuid references public.crm_clients(id);

-- agenda_compromissos: vínculo com o negócio criado a partir do
-- compromisso, no mesmo padrão de visit_id/crm_event_id já existentes.
alter table public.agenda_compromissos
  add column if not exists deal_id uuid references public.deals(id);
```

`client_id` fica nulo para negócios "Novo" (ou não classificados) —
segue exatamente o padrão que `crm_events.client_id` já estabeleceu:
nulo é um estado válido e esperado, não um erro.

### 2. Tipos (`src/types/index.ts`)

```ts
export type DealOrigem = 'NOVO' | 'INCREMENTAL'
```

`Deal` ganha:
```ts
origem_negocio: DealOrigem | null
client_id: string | null
```

`AgendaCompromisso` ganha (hoje ausente do tipo, apesar de a coluna já
existir no banco):
```ts
crm_event_id: string | null
deal_id: string | null
```

### 3. `DealModal.tsx` — origem e busca de cliente

- Novo seletor "Origem" (3 botões, mesmo estilo do seletor de Status em
  `QuickUpdateModal`): Não informado / Novo / Incremental.
- Quando `origem_negocio === 'INCREMENTAL'`: o campo "Cliente" vira busca
  — reaproveita o padrão exato de `EventModal.tsx` (`clientSearch`,
  `showClientDropdown`, `filteredClients`, `onMouseDown` pra selecionar,
  `onBlur` com delay de 150ms). Selecionar um cliente preenche
  `client_name` com o nome e guarda `client_id`.
- Quando `origem_negocio` é `'NOVO'` ou nulo: campo "Cliente" continua
  texto livre como hoje, `client_id` fica nulo (se o usuário trocar de
  Incremental pra Novo depois de ter selecionado um cliente, o
  `client_id` é limpo, mas o texto do nome permanece — evita perder o que
  já foi digitado).
- Busca em `crm_clients` com `.select('id, nome').eq('status', 'ATIVO').order('nome')`,
  mesma query que `EventModal` já usa.

### 4. Kanban de Negócios — filtro por Origem

Em `src/pages/RegistroNegocios.tsx`, adicionar mais um `<select>` na
barra de filtros (junto de tipo/responsável/ordenar), com opções Todos/
Novo/Incremental/Não informado, aplicado em `filtered` do mesmo jeito que
os filtros existentes.

### 5. `AppointmentModal` — seção "Converter em Negócio"

Local: logo abaixo da seção "Converter em relatório de visita" (mesmo
componente, mesmo padrão de `useState` boolean + borda colorida +
chevron).

- Só aparece para compromissos já salvos (`item` existe), igual à seção
  de visita.
- Se `item.deal_id` já estiver preenchido: mostra um aviso fixo
  "✓ Negócio já criado a partir deste compromisso" com um link pra abrir
  o negócio (navega pra `/negocios`), em vez do formulário — não permite
  reconverter.
- Caso contrário, ao marcar o toggle, mostra:
  - Origem: Novo / Incremental (2 botões)
  - Se Incremental: busca de cliente (mesmo padrão de `EventModal`)
  - Se Novo: campo de texto livre, pré-preenchido com `form.cliente_nome`
    (o nome já digitado no compromisso, se houver)
  - Tipo de negócio (`deal_type`, mesmo `<select>` de `DEAL_TYPES` que
    `DealModal` usa)
- Ao salvar o compromisso, se essa seção estiver marcada:
  ```ts
  const { data: dealData, error: dealErr } = await supabase.from('deals').insert({
    client_name: dealOrigem === 'INCREMENTAL' ? dealClientSearch : dealClientName,
    client_id: dealOrigem === 'INCREMENTAL' ? (dealClientId || null) : null,
    origem_negocio: dealOrigem,
    deal_type: dealType,
    responsaveis,
    responsible: responsaveis[0] ?? null,
  }).select('id').single()
  if (dealData?.id) {
    await supabase.from('agenda_compromissos')
      .update({ deal_id: dealData.id, updated_at: new Date().toISOString() })
      .eq('id', apptId)
  }
  ```
  (`client_name` é `NOT NULL` na tabela — por isso sempre populado a
  partir de um dos dois campos conforme a origem. Demais campos do
  negócio, como prioridade/interesse/acompanhamento, ficam com os
  defaults da tabela e são preenchidos depois pelo usuário editando o
  negócio normalmente — igual à conversão em Visita, que também só pede
  o essencial.)

### 6. `AppointmentModal` — seção "Cadastrar Promotoria"

Mesmo padrão de seção retrátil, logo abaixo da seção de Negócio.

- Se `item.crm_event_id` já estiver preenchido: mostra aviso fixo
  "✓ Promotoria já criada a partir deste compromisso" com link pra abrir
  em `/promotoria`, sem formulário.
- Caso contrário, ao marcar:
  - Tipo de evento (`<select>`: Degustação/Promoção/Evento Comemorativo/
    Inauguração/Outro — mesma lista de `EventModal.tsx`, campo próprio,
    independente do `form.tipo` do compromisso)
  - Busca de cliente (mesmo padrão reaproveitado de `EventModal`)
  - Observações, pré-preenchidas com `form.descricao`
- Ao salvar:
  ```ts
  const eventDateTime = form.data + 'T' + (form.hora_inicio || '00:00')
  const { data: eventData, error: eventErr } = await supabase.from('crm_events').insert({
    title: titulo, // mesmo título auto-gerado do compromisso
    client_id: eventClientId || null,
    event_type: eventType,
    event_date: eventDateTime,
    status: 'AGENDADO',
    notes: eventNotes || null,
  }).select('id').single()
  if (eventData?.id) {
    await supabase.from('agenda_compromissos')
      .update({ crm_event_id: eventData.id, updated_at: new Date().toISOString() })
      .eq('id', apptId)
  }
  ```
  Isso NÃO usa o `upsert(..., { onConflict: 'crm_event_id' })` que
  `EventModal` usa (aquele é pro sentido Promotoria→Agenda). Aqui é uma
  atualização direta e pontual do compromisso já existente — cria o
  evento primeiro, depois aponta este compromisso específico pra ele.
  Depois de criado, `EventModal` (ao editar esse evento futuramente) vai
  continuar sincronizando de volta pra este mesmo compromisso normalmente
  via `onConflict: 'crm_event_id'`, já que a chave bate.

## O que NÃO muda nesta spec

- `visit_id`/conversão em relatório de visita continuam exatamente como
  estão hoje, sem alteração.
- `EventModal.tsx`/`EventsPage.tsx` não são alterados — a sincronização
  Promotoria→Agenda que já existe continua igual; só passa a também ser
  alimentada no sentido contrário por este compromisso específico.
- Nenhuma mudança em `QuickUpdateModal`, `crm_deal_history`, ou no fluxo
  de arrastar cards do Kanban (fase 6) — `origem_negocio`/`client_id` são
  só mais dois campos que passeiam junto com o resto do negócio.
- Não há botão de criar negócio/promotoria direto em cada coluna do board
  ou em cada dia da Agenda — só a partir do modal de edição de
  compromisso, como pedido.

## Verificação

- `npx tsc -b tsconfig.app.json` sem erros.
- Migrations aplicadas e verificadas via SQL (colunas novas existem,
  FKs corretas).
- Verificação manual no preview: abrir um compromisso existente na
  Agenda, marcar "Converter em Negócio" com Origem "Incremental", buscar
  e selecionar um cliente, salvar — conferir que o negócio aparece no
  Kanban já com `client_id` preenchido e filtrável por "Incremental".
  Repetir com "Novo" (campo livre). Testar "Cadastrar Promotoria" e
  conferir que o evento aparece em `/promotoria` já vinculado, e que
  editar esse evento por lá continua atualizando o mesmo compromisso
  (não cria um duplicado). Confirmar que reabrir o compromisso depois de
  converter mostra o aviso "já criado" em vez do formulário, e que o
  resto do compromisso (data, hora, responsáveis) continua editável
  normalmente.
