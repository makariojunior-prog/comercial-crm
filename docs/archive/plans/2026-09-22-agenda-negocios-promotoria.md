# Integração Agenda ↔ Negócios ↔ Promotoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir converter um compromisso da Agenda em Negócio (com classificação Novo/Incremental filtrável) e em Promotoria, completando o vínculo Agenda↔Promotoria que hoje só funciona no sentido Promotoria→Agenda.

**Architecture:** Duas migrations pequenas (`deals.origem_negocio`/`deals.client_id`, `agenda_compromissos.deal_id`). Um componente novo e reutilizável (`ClientSearchInput`) extraído do padrão de busca de cliente que `EventModal.tsx` já tinha embutido — passa a ser usado em 3 lugares (`EventModal`, `DealModal`, `AppointmentModal`) em vez de reimplementado. Duas seções retráteis novas em `AppointmentModal`, no mesmo padrão da conversão em relatório de visita já existente.

**Tech Stack:** React + TypeScript + Vite, Supabase JS client, Tailwind.

**Nota sobre verificação:** este repositório não tem framework de testes configurado. Os passos de verificação usam `npx tsc -b tsconfig.app.json`, `npm run build`, migrations aplicadas via MCP do Supabase, e checagem manual/boot no preview (sem credenciais de usuário neste ambiente, como nas fases anteriores desta sessão).

---

### Task 1: Migrations

**Files:**
- Create: `supabase/migrations/20260922140000_deals_origem_e_client_id.sql`
- Create: `supabase/migrations/20260922140100_agenda_compromissos_deal_id.sql`

- [ ] **Step 1: Migration de `deals`**

```sql
-- Classificação filtrável (Novo/Incremental) + vínculo real com cliente
-- existente quando o negócio for "incremental" — mesmo padrão que
-- crm_events.client_id já estabeleceu (ver EventModal.tsx).
alter table public.deals
  add column if not exists origem_negocio text
    check (origem_negocio is null or origem_negocio in ('NOVO', 'INCREMENTAL')),
  add column if not exists client_id uuid references public.crm_clients(id);
```

- [ ] **Step 2: Migration de `agenda_compromissos`**

```sql
-- Vínculo com o negócio criado a partir do compromisso, no mesmo padrão
-- de visit_id/crm_event_id já existentes nesta tabela.
alter table public.agenda_compromissos
  add column if not exists deal_id uuid references public.deals(id);
```

- [ ] **Step 3: Aplicar as duas migrations via MCP do Supabase**

Usar `apply_migration` com `project_id: taicaxtjtikdajmhtsxc`, um nome
descritivo por migration, conteúdo igual aos arquivos acima.

- [ ] **Step 4: Confirmar as colunas via SQL**

```sql
select table_name, column_name, data_type from information_schema.columns
where (table_name = 'deals' and column_name in ('origem_negocio', 'client_id'))
   or (table_name = 'agenda_compromissos' and column_name = 'deal_id');
```

Esperado: 3 linhas.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260922140000_deals_origem_e_client_id.sql supabase/migrations/20260922140100_agenda_compromissos_deal_id.sql
git commit -m "$(cat <<'EOF'
feat: migrations para vínculo Agenda↔Negócios↔Promotoria

deals ganha origem_negocio (Novo/Incremental, filtrável) e client_id
(vínculo real com crm_clients, só preenchido quando incremental).
agenda_compromissos ganha deal_id, espelhando visit_id/crm_event_id
que já existiam.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Atualizar tipos (`src/types/index.ts`)

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Adicionar `DealOrigem` e os campos novos em `Deal`**

De:

```ts
export interface Deal {
  id: string
  start_date: string | null
  client_name: string
  contact_name: string | null
  contact_phone: string | null
  deal_type: string | null
  responsible: string | null
  responsaveis: string[] | null
  interest: string | null
  last_contact_date: string | null
  status: DealStatus | null
  priority: DealPriority | null
  follow_up: string | null
  end_date: string | null
  potential_notes: string | null
  created_at: string
}
```

Para:

```ts
export type DealOrigem = 'NOVO' | 'INCREMENTAL'

export interface Deal {
  id: string
  start_date: string | null
  client_name: string
  contact_name: string | null
  contact_phone: string | null
  deal_type: string | null
  responsible: string | null
  responsaveis: string[] | null
  interest: string | null
  last_contact_date: string | null
  status: DealStatus | null
  priority: DealPriority | null
  follow_up: string | null
  end_date: string | null
  potential_notes: string | null
  created_at: string
  origem_negocio: DealOrigem | null
  client_id: string | null
}
```

- [ ] **Step 2: Adicionar `crm_event_id` e `deal_id` em `AgendaCompromisso`**

De:

```ts
export interface AgendaCompromisso {
  id: string
  titulo: string
  data: string
  hora_inicio: string | null
  hora_fim: string | null
  tipo: string
  status: 'AGENDADO' | 'REALIZADO' | 'CANCELADO'
  descricao: string | null
  local: string | null
  cliente_nome: string | null
  responsavel: string | null
  responsaveis: string[]
  visit_id: string | null
  criado_por: string | null
  criado_por_id: string | null
  aprovacao_status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'SUGERIDO' | null
  aprovacao_nota: string | null
  aprovacao_sugestao_data: string | null
  aprovacao_sugestao_hora: string | null
  aprovado_por: string | null
  created_at: string
  updated_at: string
}
```

Para:

```ts
export interface AgendaCompromisso {
  id: string
  titulo: string
  data: string
  hora_inicio: string | null
  hora_fim: string | null
  tipo: string
  status: 'AGENDADO' | 'REALIZADO' | 'CANCELADO'
  descricao: string | null
  local: string | null
  cliente_nome: string | null
  responsavel: string | null
  responsaveis: string[]
  visit_id: string | null
  criado_por: string | null
  criado_por_id: string | null
  aprovacao_status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'SUGERIDO' | null
  aprovacao_nota: string | null
  aprovacao_sugestao_data: string | null
  aprovacao_sugestao_hora: string | null
  aprovado_por: string | null
  created_at: string
  updated_at: string
  crm_event_id: string | null
  deal_id: string | null
}
```

- [ ] **Step 3: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: falha aqui — `DealModal.tsx`/outros ainda não fornecem
`origem_negocio`/`client_id` ao construir objetos `Deal` em alguns
pontos, e é isso mesmo, as próximas tasks corrigem. Não faça commit
ainda se houver erro; siga para a Task 3.

Na prática, como `Deal`/`AgendaCompromisso` são lidos via `as Deal[]`/
`as AgendaCompromisso[]` a partir do Supabase (não construídos campo a
campo no código), o typecheck deve passar limpo mesmo agora — confirme
rodando o comando acima. Se passar limpo, siga direto pro commit.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "$(cat <<'EOF'
feat: tipos para origem_negocio/client_id (Deal) e deal_id (AgendaCompromisso)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ClientSearchInput.tsx` (novo, reutilizável)

**Files:**
- Create: `src/components/ClientSearchInput.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ClientOption {
  id: string
  nome: string
}

interface Props {
  clientId: string | null
  search: string
  onChange: (clientId: string | null, search: string) => void
  placeholder?: string
}

export default function ClientSearchInput({ clientId, search, onChange, placeholder }: Props) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    supabase.from('crm_clients').select('id, nome').eq('status', 'ATIVO').order('nome')
      .then(({ data }) => { if (data) setClients(data as ClientOption[]) })
  }, [])

  const filtered = clients.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="relative">
      <input
        className="input pr-8"
        value={search}
        onChange={e => onChange(null, e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder ?? 'Buscar cliente pelo nome...'}
      />
      {search && (
        <button
          type="button"
          onClick={() => onChange(null, '')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      )}
      {showDropdown && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          <button
            type="button"
            onMouseDown={() => onChange(null, '')}
            className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700"
          >
            (Sem cliente vinculado)
          </button>
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => onChange(c.id, c.nome)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                clientId === c.id
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/10'
              }`}
            >
              {c.nome}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-slate-400 italic">
              Nenhum cliente encontrado para "{search}"
            </p>
          )}
        </div>
      )}
      {clientId && (
        <p className="text-[10px] text-green-600 dark:text-green-400 font-medium mt-1">Cliente vinculado</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/ClientSearchInput.tsx
git commit -m "$(cat <<'EOF'
feat: ClientSearchInput — busca de cliente reutilizável

Extraído do padrão que EventModal.tsx já tinha embutido (input +
dropdown com onMouseDown, opção "sem cliente vinculado", delay de
blur). Vai ser usado por EventModal, DealModal e AppointmentModal em
vez de reimplementado em cada um.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Refatorar `EventModal.tsx` pra usar `ClientSearchInput`

**Files:**
- Modify: `src/components/EventModal.tsx`

- [ ] **Step 1: Atualizar imports**

De:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { X, Calendar, MapPin, Package, Users, Save, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Event, EventStatus, Client, Staff, EventMaterial } from '../types'
import { useEscKey } from '../hooks/useEscKey'
```

Para:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { X, Calendar, Package, Users, Save, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Event, EventStatus, Staff, EventMaterial } from '../types'
import { useEscKey } from '../hooks/useEscKey'
import ClientSearchInput from './ClientSearchInput'
```

(Remove `MapPin` — só era usado no indicador "Cliente selecionado" que
sai nesta task — e `Client`, que só tipava o state `clients` removido.)

- [ ] **Step 2: Trocar `clientId` pra `string | null` e remover o state/funções que vão pro componente novo**

De:

```tsx
  const [clientId, setClientId] = useState(event?.client_id ?? '')
  const [clientSearch, setClientSearch] = useState(event?.client_nome ?? '')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [eventType, setEventType] = useState(event?.event_type ?? 'Degustação')
  const [eventDate, setEventDate] = useState(event?.event_date ? event.event_date.substring(0, 16) : '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'AGENDADO')
  const [notes, setNotes] = useState(event?.notes ?? '')

  const [materials, setMaterials] = useState<Partial<EventMaterial>[]>(event?.materials ?? [])
  const [selectedStaff, setSelectedStaff] = useState<string[]>(event?.staff?.map(s => s.staff_id) ?? [])

  const [clients, setClients] = useState<Client[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'materials' | 'staff'>('info')

  const filteredClients = clients.filter(c =>
    c.nome.toLowerCase().includes(clientSearch.toLowerCase())
  )

  function selectClient(client: Client) {
    setClientId(client.id)
    setClientSearch(client.nome)
    setShowClientDropdown(false)
  }

  function clearClient() {
    setClientId('')
    setClientSearch('')
    setShowClientDropdown(false)
  }

  useEffect(() => {
    async function loadData() {
      const { data: cData } = await supabase.from('crm_clients').select('id, nome').eq('status', 'ATIVO').order('nome')
      const { data: sData } = await supabase.from('crm_staff').select('*, role:crm_roles(name)').eq('active', true).order('name')
      if (cData) setClients(cData as Client[])
      if (sData) setAllStaff(sData as Staff[])
    }
    loadData()
  }, [])
```

Para:

```tsx
  const [clientId, setClientId] = useState<string | null>(event?.client_id ?? null)
  const [clientSearch, setClientSearch] = useState(event?.client_nome ?? '')
  const [eventType, setEventType] = useState(event?.event_type ?? 'Degustação')
  const [eventDate, setEventDate] = useState(event?.event_date ? event.event_date.substring(0, 16) : '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'AGENDADO')
  const [notes, setNotes] = useState(event?.notes ?? '')

  const [materials, setMaterials] = useState<Partial<EventMaterial>[]>(event?.materials ?? [])
  const [selectedStaff, setSelectedStaff] = useState<string[]>(event?.staff?.map(s => s.staff_id) ?? [])

  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'materials' | 'staff'>('info')

  useEffect(() => {
    supabase.from('crm_staff').select('*, role:crm_roles(name)').eq('active', true).order('name')
      .then(({ data }) => { if (data) setAllStaff(data as Staff[]) })
  }, [])
```

- [ ] **Step 3: Trocar `clientId || null` por `clientId` no payload do save (já é `string | null` agora)**

De:

```tsx
      const eventData = {
        title: title.trim(),
        client_id: clientId || null,
        event_type: eventType,
        event_date: eventDate,
        status,
        notes: notes.trim() || null,
      }
```

Para:

```tsx
      const eventData = {
        title: title.trim(),
        client_id: clientId,
        event_type: eventType,
        event_date: eventDate,
        status,
        notes: notes.trim() || null,
      }
```

- [ ] **Step 4: Substituir o bloco JSX do campo Cliente**

De (bloco inteiro do campo "Cliente", dentro da aba Info):

```tsx
              <div>
                <label className="label">Cliente</label>
                <div className="relative">
                  <input
                    className="input pr-8"
                    value={clientSearch}
                    onChange={e => {
                      setClientSearch(e.target.value)
                      setClientId('')
                      setShowClientDropdown(true)
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                    placeholder="Buscar cliente pelo nome..."
                  />
                  {clientSearch && (
                    <button
                      type="button"
                      onClick={clearClient}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {showClientDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      <button
                        type="button"
                        onMouseDown={clearClient}
                        className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-50 border-b border-slate-50"
                      >
                        (Sem cliente vinculado)
                      </button>
                      {filteredClients.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => selectClient(c)}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                            clientId === c.id
                              ? 'bg-orange-50 text-orange-600 font-bold'
                              : 'text-slate-700 hover:bg-orange-50'
                          }`}
                        >
                          {c.nome}
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <p className="px-3 py-3 text-xs text-slate-400 italic">
                          Nenhum cliente encontrado para "{clientSearch}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {clientId && (
                  <p className="text-[10px] text-green-600 font-medium mt-1 flex items-center gap-1">
                    <MapPin size={10} /> Cliente selecionado
                  </p>
                )}
              </div>
```

Para:

```tsx
              <div>
                <label className="label">Cliente</label>
                <ClientSearchInput
                  clientId={clientId}
                  search={clientSearch}
                  onChange={(id, search) => { setClientId(id); setClientSearch(search) }}
                />
              </div>
```

- [ ] **Step 5: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/EventModal.tsx
git commit -m "$(cat <<'EOF'
refactor: EventModal usa ClientSearchInput em vez de busca embutida

Mesmo comportamento, código duplicado a menos. Preparação pra Task 5/7
reaproveitarem o mesmo componente em DealModal e AppointmentModal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `DealModal.tsx` — origem e busca de cliente

**Files:**
- Modify: `src/components/DealModal.tsx`

- [ ] **Step 1: Import do componente novo**

De:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { X, AlertCircle, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Deal, DealStatus, DealPriority } from '../types'
import { DEAL_TYPES, STATUS_ORDER } from '../types'
import { useEscKey } from '../hooks/useEscKey'
```

Para:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { X, AlertCircle, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Deal, DealStatus, DealPriority, DealOrigem } from '../types'
import { DEAL_TYPES, STATUS_ORDER } from '../types'
import { useEscKey } from '../hooks/useEscKey'
import ClientSearchInput from './ClientSearchInput'
```

- [ ] **Step 2: Novo state de origem/cliente**

De:

```tsx
  const [responsaveis, setResponsaveis] = useState<string[]>(initResponsaveis)
  const [staffOptions, setStaffOptions] = useState<string[]>([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  useEscKey(useCallback(onClose, [onClose]))
```

Para:

```tsx
  const [responsaveis, setResponsaveis] = useState<string[]>(initResponsaveis)
  const [staffOptions, setStaffOptions] = useState<string[]>([])
  const [origemNegocio, setOrigemNegocio] = useState<DealOrigem | ''>(deal?.origem_negocio ?? '')
  const [clientId, setClientId] = useState<string | null>(deal?.client_id ?? null)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  useEscKey(useCallback(onClose, [onClose]))

  function setOrigem(value: DealOrigem | '') {
    setOrigemNegocio(value)
    if (value !== 'INCREMENTAL') setClientId(null)
  }
```

- [ ] **Step 3: Incluir `origem_negocio`/`client_id` no payload de salvamento**

De:

```tsx
    const payload = {
      ...form,
      responsible:     responsaveis[0] ?? null,
      responsaveis:    responsaveis,
      end_date:        form.end_date        || null,
      potential_notes: form.potential_notes || null,
    }
```

Para:

```tsx
    const payload = {
      ...form,
      responsible:     responsaveis[0] ?? null,
      responsaveis:    responsaveis,
      end_date:        form.end_date        || null,
      potential_notes: form.potential_notes || null,
      origem_negocio:  origemNegocio || null,
      client_id:       origemNegocio === 'INCREMENTAL' ? clientId : null,
    }
```

- [ ] **Step 4: Adicionar o seletor de Origem e trocar o campo Cliente condicionalmente**

De:

```tsx
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Cliente *</label>
              <input className="input" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nome do cliente" />
            </div>
```

Para:

```tsx
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Origem</label>
              <div className="flex gap-2">
                {([['', 'Não informado'], ['NOVO', 'Negócio Novo'], ['INCREMENTAL', 'Negócio Incremental']] as [DealOrigem | '', string][]).map(([value, label]) => (
                  <button
                    key={value || 'none'}
                    type="button"
                    onClick={() => setOrigem(value)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                      origemNegocio === value
                        ? 'bg-purple-50 border-purple-400 text-purple-700 border-2'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="label">Cliente *</label>
              {origemNegocio === 'INCREMENTAL' ? (
                <ClientSearchInput
                  clientId={clientId}
                  search={form.client_name}
                  onChange={(id, search) => { setClientId(id); set('client_name', search) }}
                  placeholder="Buscar cliente já cadastrado..."
                />
              ) : (
                <input className="input" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nome do cliente" />
              )}
            </div>
```

- [ ] **Step 5: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/DealModal.tsx
git commit -m "$(cat <<'EOF'
feat(negocios): seletor de Origem (Novo/Incremental) e busca de cliente

Disponível em qualquer negócio, não só nos criados via Agenda. Quando
Incremental, o campo Cliente vira busca com vínculo real (client_id);
Novo (ou não informado) continua texto livre como antes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Filtro de Origem no Kanban de Negócios

**Files:**
- Modify: `src/pages/RegistroNegocios.tsx`

- [ ] **Step 1: Novo state de filtro**

De:

```tsx
  const [filterResp, setFilterResp] = useState<string>(ALL)
  const [filterType, setFilterType] = useState<string>(ALL)
```

Para:

```tsx
  const [filterResp, setFilterResp] = useState<string>(ALL)
  const [filterType, setFilterType] = useState<string>(ALL)
  const [filterOrigem, setFilterOrigem] = useState<string>(ALL)
```

- [ ] **Step 2: Aplicar o filtro em `filtered`**

De:

```tsx
      const respArr = d.responsaveis?.length ? d.responsaveis : (d.responsible ? [d.responsible] : [])
      const matchResp = filterResp === ALL || respArr.includes(filterResp)
      const matchType = filterType === ALL || d.deal_type === filterType
      return matchSearch && matchResp && matchType
    })
```

Para:

```tsx
      const respArr = d.responsaveis?.length ? d.responsaveis : (d.responsible ? [d.responsible] : [])
      const matchResp = filterResp === ALL || respArr.includes(filterResp)
      const matchType = filterType === ALL || d.deal_type === filterType
      const matchOrigem = filterOrigem === ALL || (d.origem_negocio ?? 'NAO_INFORMADO') === filterOrigem
      return matchSearch && matchResp && matchType && matchOrigem
    })
```

E atualizar a dependência do `useMemo` logo abaixo:

De:

```tsx
  }, [deals, search, filterResp, filterType, sortBy])
```

Para:

```tsx
  }, [deals, search, filterResp, filterType, filterOrigem, sortBy])
```

- [ ] **Step 3: Adicionar o `<select>` na barra de filtros**

De:

```tsx
          <select className="input shrink-0 w-auto text-xs" value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
```

Para:

```tsx
          <select className="input shrink-0 w-auto text-xs" value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={filterOrigem} onChange={e => setFilterOrigem(e.target.value)}>
            <option value={ALL}>Origem: Todos</option>
            <option value="NOVO">Negócio Novo</option>
            <option value="INCREMENTAL">Negócio Incremental</option>
            <option value="NAO_INFORMADO">Não informado</option>
          </select>
          <select className="input shrink-0 w-auto text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
```

- [ ] **Step 4: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RegistroNegocios.tsx
git commit -m "$(cat <<'EOF'
feat(negocios): filtro por Origem (Novo/Incremental) no Kanban

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `AppointmentModal` — seções "Converter em Negócio" e "Cadastrar Promotoria"

**Files:**
- Modify: `src/pages/AgendaPage.tsx`

- [ ] **Step 1: Novos imports**

De (topo do arquivo):

```tsx
import { Plus, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, CalendarDays, CalendarPlus, X, Clock, Users, Copy, Trash2, AlertCircle, FileText, Search, ThumbsUp, ThumbsDown, CalendarClock, CheckCircle2, Lock } from 'lucide-react'
```

Para:

```tsx
import { Plus, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, CalendarDays, CalendarPlus, X, Clock, Users, Copy, Trash2, AlertCircle, FileText, Search, ThumbsUp, ThumbsDown, CalendarClock, CheckCircle2, Lock, Briefcase, PartyPopper, ExternalLink } from 'lucide-react'
```

De:

```tsx
import type { AgendaCompromisso } from '../types'
```

Para:

```tsx
import type { AgendaCompromisso } from '../types'
import { DEAL_TYPES } from '../types'
import ClientSearchInput from '../components/ClientSearchInput'
```

- [ ] **Step 2: Novo state, logo após o bloco de `nextAppt`**

De:

```tsx
  const [nextAppt, setNextAppt] = useState({
    data:        defaultNextDate,
    hora_inicio: item?.hora_inicio?.substring(0, 5) ?? '',
    descricao:   '',
  })

  function set(field: string, value: string) {
```

Para:

```tsx
  const [nextAppt, setNextAppt] = useState({
    data:        defaultNextDate,
    hora_inicio: item?.hora_inicio?.substring(0, 5) ?? '',
    descricao:   '',
  })

  // Converter em Negócio (só para edição sem negócio já vinculado)
  const [convertDeal, setConvertDeal] = useState(false)
  const [dealOrigem, setDealOrigem] = useState<'NOVO' | 'INCREMENTAL'>('NOVO')
  const [dealClientId, setDealClientId] = useState<string | null>(null)
  const [dealClientSearch, setDealClientSearch] = useState('')
  const [dealClientName, setDealClientName] = useState(item?.cliente_nome ?? '')
  const [dealType, setDealType] = useState<string>(DEAL_TYPES[0])

  // Cadastrar Promotoria (só para edição sem evento já vinculado)
  const [convertEvent, setConvertEvent] = useState(false)
  const [eventType, setEventType] = useState('Degustação')
  const [eventClientId, setEventClientId] = useState<string | null>(null)
  const [eventClientSearch, setEventClientSearch] = useState('')
  const [eventNotes, setEventNotes] = useState(item?.descricao ?? '')

  function set(field: string, value: string) {
```

- [ ] **Step 3: Adicionar os passos 3 e 4 em `save()`, entre a conversão em Visita e o agendamento do próximo compromisso**

De:

```tsx
    // 3. Schedule next appointment
    if (scheduleNext) {
```

Para:

```tsx
    // 3. Convert to Negócio
    const dealClientNameResolved = dealOrigem === 'INCREMENTAL' ? dealClientSearch.trim() : dealClientName.trim()
    if (convertDeal && apptId && dealClientNameResolved) {
      const { data: dealData, error: dealErr } = await supabase.from('deals').insert({
        client_name:     dealClientNameResolved,
        client_id:       dealOrigem === 'INCREMENTAL' ? dealClientId : null,
        origem_negocio:  dealOrigem,
        deal_type:       dealType,
        responsaveis,
        responsible:     responsaveis[0] ?? null,
      }).select('id').single()
      if (!dealErr && dealData?.id) {
        await supabase.from('agenda_compromissos')
          .update({ deal_id: dealData.id, updated_at: new Date().toISOString() })
          .eq('id', apptId)
      }
    }

    // 4. Cadastrar Promotoria
    if (convertEvent && apptId) {
      const eventDateTime = form.data + 'T' + (form.hora_inicio || '00:00')
      const { data: eventData, error: eventErr } = await supabase.from('crm_events').insert({
        title:      titulo,
        client_id:  eventClientId,
        event_type: eventType,
        event_date: eventDateTime,
        status:     'AGENDADO',
        notes:      eventNotes.trim() || null,
      }).select('id').single()
      if (!eventErr && eventData?.id) {
        await supabase.from('agenda_compromissos')
          .update({ crm_event_id: eventData.id, updated_at: new Date().toISOString() })
          .eq('id', apptId)
      }
    }

    // 5. Schedule next appointment
    if (scheduleNext) {
```

- [ ] **Step 4: Inserir as duas seções na JSX, entre "Converter em relatório de visita" e "Agendar próximo compromisso"**

Localizar o fechamento da seção de visita:

```tsx
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                    Uma visita será registrada automaticamente e o compromisso marcado como Realizado.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Agendar próximo compromisso ── */}
```

Substituir por (adiciona as duas seções novas entre as duas existentes):

```tsx
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                    Uma visita será registrada automaticamente e o compromisso marcado como Realizado.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Converter em Negócio ── */}
          {item && !item.deal_id && (
            <div className={`rounded-xl border transition-all overflow-hidden ${convertDeal ? 'border-purple-300 dark:border-purple-700' : 'border-slate-200 dark:border-slate-600'}`}>
              <button
                type="button"
                onClick={() => setConvertDeal(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors ${convertDeal ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                <span className="flex items-center gap-2">
                  <Briefcase size={14} className={convertDeal ? 'text-purple-600' : 'text-slate-400'} />
                  <span className={convertDeal ? 'text-purple-700 dark:text-purple-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}>
                    Converter em Negócio
                  </span>
                </span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${convertDeal ? 'rotate-180' : ''}`} />
              </button>
              {convertDeal && (
                <div className="px-3 pb-3 pt-2 space-y-2 bg-purple-50 dark:bg-purple-900/10 border-t border-purple-200 dark:border-purple-800">
                  <div>
                    <label className="label">Origem</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDealOrigem('NOVO')} className={`flex-1 py-2 rounded-lg border text-xs font-medium ${dealOrigem === 'NOVO' ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-400 text-purple-700 dark:text-purple-300 border-2' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500'}`}>Negócio Novo</button>
                      <button type="button" onClick={() => setDealOrigem('INCREMENTAL')} className={`flex-1 py-2 rounded-lg border text-xs font-medium ${dealOrigem === 'INCREMENTAL' ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-400 text-purple-700 dark:text-purple-300 border-2' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500'}`}>Negócio Incremental</button>
                    </div>
                  </div>
                  <div>
                    <label className="label">Cliente</label>
                    {dealOrigem === 'INCREMENTAL' ? (
                      <ClientSearchInput
                        clientId={dealClientId}
                        search={dealClientSearch}
                        onChange={(id, search) => { setDealClientId(id); setDealClientSearch(search) }}
                        placeholder="Buscar cliente já cadastrado..."
                      />
                    ) : (
                      <input className="input" value={dealClientName} onChange={e => setDealClientName(e.target.value)} placeholder="Nome do cliente (ainda não cadastrado)" />
                    )}
                  </div>
                  <div>
                    <label className="label">Tipo</label>
                    <select className="input" value={dealType} onChange={e => setDealType(e.target.value)}>
                      {DEAL_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                    Um negócio será criado a partir deste compromisso — prioridade e acompanhamento você preenche depois, editando o negócio.
                  </p>
                </div>
              )}
            </div>
          )}
          {item && item.deal_id && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700">
              <Briefcase size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
              <p className="text-xs text-purple-700 dark:text-purple-300 font-medium flex-1">Negócio já criado a partir deste compromisso.</p>
              <a href="#/negocios" className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-semibold shrink-0">
                Ver <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* ── Cadastrar Promotoria ── */}
          {item && !item.crm_event_id && (
            <div className={`rounded-xl border transition-all overflow-hidden ${convertEvent ? 'border-pink-300 dark:border-pink-700' : 'border-slate-200 dark:border-slate-600'}`}>
              <button
                type="button"
                onClick={() => setConvertEvent(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors ${convertEvent ? 'bg-pink-50 dark:bg-pink-900/20' : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                <span className="flex items-center gap-2">
                  <PartyPopper size={14} className={convertEvent ? 'text-pink-600' : 'text-slate-400'} />
                  <span className={convertEvent ? 'text-pink-700 dark:text-pink-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}>
                    Cadastrar Promotoria
                  </span>
                </span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${convertEvent ? 'rotate-180' : ''}`} />
              </button>
              {convertEvent && (
                <div className="px-3 pb-3 pt-2 space-y-2 bg-pink-50 dark:bg-pink-900/10 border-t border-pink-200 dark:border-pink-800">
                  <div>
                    <label className="label">Tipo de evento</label>
                    <select className="input" value={eventType} onChange={e => setEventType(e.target.value)}>
                      <option>Degustação</option>
                      <option>Promoção</option>
                      <option>Evento Comemorativo</option>
                      <option>Inauguração</option>
                      <option>Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Cliente</label>
                    <ClientSearchInput
                      clientId={eventClientId}
                      search={eventClientSearch}
                      onChange={(id, search) => { setEventClientId(id); setEventClientSearch(search) }}
                    />
                  </div>
                  <div>
                    <label className="label">Observações</label>
                    <textarea
                      className="input resize-none"
                      rows={2}
                      value={eventNotes}
                      onChange={e => setEventNotes(e.target.value)}
                      placeholder="Detalhes estratégicos..."
                    />
                  </div>
                  <p className="text-[10px] text-pink-600 dark:text-pink-400 font-medium">
                    Uma promotoria será criada a partir deste compromisso — materiais e equipe você adiciona depois, na tela de Promotoria.
                  </p>
                </div>
              )}
            </div>
          )}
          {item && item.crm_event_id && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-700">
              <PartyPopper size={14} className="text-pink-600 dark:text-pink-400 shrink-0" />
              <p className="text-xs text-pink-700 dark:text-pink-300 font-medium flex-1">Promotoria já criada a partir deste compromisso.</p>
              <a href="#/promotoria" className="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1 font-semibold shrink-0">
                Ver <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* ── Agendar próximo compromisso ── */}
```

- [ ] **Step 5: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "$(cat <<'EOF'
feat(agenda): converter compromisso em Negócio ou cadastrar Promotoria

Duas seções retráteis novas no modal de edição de compromisso, mesmo
padrão da conversão em relatório de visita. Negócio: Origem Novo (nome
livre) ou Incremental (busca de cliente existente, client_id
vinculado). Promotoria: formulário enxuto (tipo, data do compromisso,
cliente, observações) — materiais/equipe continuam sendo adicionados
na tela de Promotoria, já vinculada via crm_event_id. Nenhuma das duas
seções trava o resto do compromisso; só impede reconverter a mesma
seção duas vezes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Verificação final

**Files:** nenhum (só checagem)

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 2: Boot check no preview**

Abrir o preview (`npm run dev`), confirmar que a tela de login carrega
sem erro no console.

- [ ] **Step 3: Checklist manual pendente para o usuário**

Documentar como pendência (sem credenciais de usuário neste ambiente):

1. Editar um compromisso existente, marcar "Converter em Negócio",
   Origem "Incremental", buscar e selecionar um cliente, salvar —
   conferir que o negócio aparece no Kanban de `/negocios` já com o
   filtro "Origem: Incremental" encontrando ele.
2. Repetir com Origem "Novo" (campo de texto livre).
3. Reabrir esse mesmo compromisso e confirmar que aparece o aviso
   "Negócio já criado..." em vez do formulário, com link funcionando
   pra `/negocios`.
4. Marcar "Cadastrar Promotoria" num outro compromisso, preencher e
   salvar — conferir que o evento aparece em `/promotoria` já vinculado
   (cliente preenchido se buscado).
5. Editar esse evento por `/promotoria` (`EventModal`) e confirmar que
   ainda atualiza o MESMO compromisso na Agenda (não cria um duplicado)
   — a sincronização já existente (`onConflict: 'crm_event_id'`) deve
   continuar funcionando.
6. Confirmar que o resto do compromisso (data, hora, responsáveis)
   continua editável normalmente depois de converter em Negócio ou
   cadastrar Promotoria (não trava como a conversão em Visita trava).
7. No cadastro/edição normal de um negócio (`/negocios` → clicar num
   card), confirmar que o seletor de Origem aparece e funciona, com a
   busca de cliente condicionada a "Incremental".
8. Testar `EventModal` (Promotoria) isoladamente pra confirmar que o
   refactor pra `ClientSearchInput` não quebrou nada (buscar, selecionar,
   limpar cliente).
