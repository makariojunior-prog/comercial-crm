# Negócios em Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a lista expansível de `/negocios` por um board Kanban arrastável, com colunas pelas 5 etapas (`status`) já existentes, atalho "Mover para..." como alternativa ao arrasto, histórico gravado a cada mudança de etapa, e preferência de ocultar colunas fechadas persistida por usuário.

**Architecture:** Quatro componentes novos e focados (`KanbanBoard`, `KanbanColumn`, `KanbanCard`, `DealHistoryModal`), uma pequena adição em `PreferencesContext` e `StatusBadge`, e uma reescrita de `RegistroNegocios.tsx` que fica mais enxuta (delega a renderização do board). Primeira dependência de drag-and-drop do projeto: `@dnd-kit/core` + `@dnd-kit/utilities`.

**Tech Stack:** React + TypeScript + Vite, Supabase JS client, `@dnd-kit` (novo), `sonner` (toast, já instalado mas ainda não usado no projeto), Tailwind.

**Nota sobre verificação:** este repositório não tem framework de testes configurado. Os passos de verificação usam `npx tsc -b tsconfig.app.json`, `npm run build` e checagem manual no preview do navegador. Sem credenciais de usuário neste ambiente, a checagem manual completa (arrastar de verdade, ver o board populado) fica pendente para o usuário — documentado no final.

---

### Task 1: Adicionar a dependência `@dnd-kit`

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)

- [ ] **Step 1: Instalar os pacotes**

```bash
npm install @dnd-kit/core @dnd-kit/utilities
```

- [ ] **Step 2: Confirmar que `package.json` foi atualizado**

```bash
grep dnd-kit package.json
```

Esperado: duas linhas, `@dnd-kit/core` e `@dnd-kit/utilities`, em `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: adiciona @dnd-kit (primeira lib de drag-and-drop do projeto)

Base para o board Kanban de Negócios. Só @dnd-kit/core +
@dnd-kit/utilities — @dnd-kit/sortable não é necessário porque a ordem
dos cards dentro de cada coluna continua controlada pelo dropdown
"Ordenar por" já existente, não por reordenação manual.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Exportar `statusConfig` de `StatusBadge.tsx`

**Files:**
- Modify: `src/components/StatusBadge.tsx:3`

- [ ] **Step 1: Adicionar `export` na constante**

De:

```tsx
const statusConfig: Record<DealStatus, { label: string; classes: string }> = {
```

Para:

```tsx
export const statusConfig: Record<DealStatus, { label: string; classes: string }> = {
```

Nenhuma outra linha do arquivo muda — `StatusBadge`, `PriorityBadge`, `TypeBadge`, `daysSince`, `isStale` continuam como estão.

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros (mudança aditiva).

- [ ] **Step 3: Commit**

```bash
git add src/components/StatusBadge.tsx
git commit -m "$(cat <<'EOF'
refactor: exporta statusConfig de StatusBadge.tsx

Vai ser reaproveitado pelo cabeçalho das colunas do Kanban de Negócios,
pra não duplicar o mapa de cores/labels por status.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Preferência "ocultar fechados" em `PreferencesContext.tsx`

**Files:**
- Modify: `src/contexts/PreferencesContext.tsx`

- [ ] **Step 1: Adicionar o campo na interface `UserPreferences`**

De:

```tsx
export interface UserPreferences {
  navOrder: string[]
  dashboardWidgets: DashboardWidget[]
  sidebarMode: SidebarMode
}
```

Para:

```tsx
export interface UserPreferences {
  navOrder: string[]
  dashboardWidgets: DashboardWidget[]
  sidebarMode: SidebarMode
  negociosOcultarFechados: boolean
}
```

- [ ] **Step 2: Adicionar o default**

De:

```tsx
const DEFAULT_PREFS: UserPreferences = {
  navOrder: [],
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
  sidebarMode: 'full',
}
```

Para:

```tsx
const DEFAULT_PREFS: UserPreferences = {
  navOrder: [],
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
  sidebarMode: 'full',
  negociosOcultarFechados: false,
}
```

- [ ] **Step 3: Ler o campo salvo em `loadPrefs`**

De:

```tsx
    return {
      navOrder: parsed.navOrder ?? [],
      dashboardWidgets: widgets,
      sidebarMode: (parsed.sidebarMode as SidebarMode | undefined) ?? 'full',
    }
```

Para:

```tsx
    return {
      navOrder: parsed.navOrder ?? [],
      dashboardWidgets: widgets,
      sidebarMode: (parsed.sidebarMode as SidebarMode | undefined) ?? 'full',
      negociosOcultarFechados: parsed.negociosOcultarFechados ?? false,
    }
```

- [ ] **Step 4: Adicionar o setter na interface do contexto**

De:

```tsx
interface PreferencesContextValue {
  prefs: UserPreferences
  updateNavOrder: (order: string[]) => void
  updateDashboardWidgets: (widgets: DashboardWidget[]) => void
  updateSidebarMode: (mode: SidebarMode) => void
  resetNavOrder: () => void
  resetDashboardWidgets: () => void
}
```

Para:

```tsx
interface PreferencesContextValue {
  prefs: UserPreferences
  updateNavOrder: (order: string[]) => void
  updateDashboardWidgets: (widgets: DashboardWidget[]) => void
  updateSidebarMode: (mode: SidebarMode) => void
  updateNegociosOcultarFechados: (value: boolean) => void
  resetNavOrder: () => void
  resetDashboardWidgets: () => void
}
```

- [ ] **Step 5: Adicionar a função `updateNegociosOcultarFechados` no provider**

Logo depois da função `updateSidebarMode` (antes de `resetNavOrder`), adicionar:

```tsx
  const updateNegociosOcultarFechados = useCallback((negociosOcultarFechados: boolean) => {
    setPrefs(prev => {
      const next = { ...prev, negociosOcultarFechados }
      if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(next))
      return next
    })
  }, [userId])
```

- [ ] **Step 6: Incluir no valor do Provider**

De:

```tsx
    <PreferencesContext.Provider value={{ prefs, updateNavOrder, updateDashboardWidgets, updateSidebarMode, resetNavOrder, resetDashboardWidgets }}>
```

Para:

```tsx
    <PreferencesContext.Provider value={{ prefs, updateNavOrder, updateDashboardWidgets, updateSidebarMode, updateNegociosOcultarFechados, resetNavOrder, resetDashboardWidgets }}>
```

- [ ] **Step 7: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/PreferencesContext.tsx
git commit -m "$(cat <<'EOF'
feat: preferência negociosOcultarFechados em PreferencesContext

Segue o mesmo padrão já usado para sidebarMode — persistida por
usuário em localStorage. Vai controlar se as colunas fechadas
(Sucesso/Desistiu/Cancelado) aparecem no board Kanban de Negócios.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `DealHistoryModal.tsx` (novo)

**Files:**
- Create: `src/components/DealHistoryModal.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
import { useCallback } from 'react'
import { X } from 'lucide-react'
import type { Deal } from '../types'
import DealHistoryTimeline from './DealHistory'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  deal: Deal
  onClose: () => void
}

export default function DealHistoryModal({ deal, onClose }: Props) {
  useEscKey(useCallback(onClose, [onClose]))

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Histórico</p>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">{deal.client_name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DealHistoryTimeline dealId={deal.id} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros (o arquivo ainda não é usado por ninguém, mas deve compilar sozinho).

- [ ] **Step 3: Commit**

```bash
git add src/components/DealHistoryModal.tsx
git commit -m "$(cat <<'EOF'
feat: DealHistoryModal — modal leve reaproveitando DealHistoryTimeline

Usado pelo menu de ações do card no Kanban de Negócios ("Histórico"),
em vez do timeline inline que a lista antiga usava expandido na linha.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `KanbanCard.tsx` (novo)

**Files:**
- Create: `src/components/KanbanCard.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MoreVertical, MessageCircle, History, Trash2, ArrowRightLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Deal, DealStatus } from '../types'
import { STATUS_ORDER, getResponsaveis } from '../types'
import { TypeBadge, PriorityBadge } from './StatusBadge'

interface CardProps {
  deal: Deal
  onOpenEdit: () => void
  onMove: (status: DealStatus) => void
  onDelete: () => void
  onShowHistory: () => void
}

const STATUS_LABEL: Record<DealStatus, string> = {
  'NOVO': 'Novo',
  'EM ANDAMENTO': 'Em Andamento',
  'SUCESSO': 'Sucesso',
  'DESISTIU': 'Desistiu',
  'CANCELADO': 'Cancelado',
}

export function DealCardContent({ deal, onOpenEdit, onMove, onDelete, onShowHistory, dragging }: CardProps & { dragging?: boolean }) {
  const [showMove, setShowMove] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const startDate = deal.start_date ? format(parseISO(deal.start_date), 'dd/MM/yy', { locale: ptBR }) : '-'
  const lastContact = deal.last_contact_date ? format(parseISO(deal.last_contact_date), 'dd/MM/yy', { locale: ptBR }) : '-'
  const digits = deal.contact_phone?.replace(/\D/g, '') ?? ''
  const waNum = digits.length >= 10 ? (digits.startsWith('55') ? digits : '55' + digits) : null

  return (
    <div
      onClick={onOpenEdit}
      className={`card p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow ${dragging ? 'shadow-lg rotate-1' : ''}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <TypeBadge type={deal.deal_type} />
        <PriorityBadge priority={deal.priority} />
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{deal.client_name}</p>
      {getResponsaveis(deal) && (
        <p className="text-xs text-slate-500">{getResponsaveis(deal)}</p>
      )}
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span>Início: {startDate}</span>
        <span>Contato: {lastContact}</span>
      </div>
      {deal.follow_up && (
        <p className="text-xs text-slate-500 line-clamp-2 italic">"{deal.follow_up}"</p>
      )}

      <div
        className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-700"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {waNum && (
          <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600" title="WhatsApp">
            <MessageCircle size={13} />
          </a>
        )}
        <div className="relative">
          <button onClick={() => setShowMove(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400" title="Mover para...">
            <ArrowRightLeft size={13} />
          </button>
          {showMove && (
            <div className="absolute z-10 mt-1 left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 w-40">
              {STATUS_ORDER.filter(s => s !== deal.status).map(s => (
                <button
                  key={s}
                  onClick={() => { onMove(s); setShowMove(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative ml-auto">
          <button onClick={() => setShowMenu(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400" title="Mais ações">
            <MoreVertical size={13} />
          </button>
          {showMenu && (
            <div className="absolute z-10 mt-1 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 w-36">
              <button
                onClick={() => { onShowHistory(); setShowMenu(false) }}
                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <History size={12} /> Histórico
              </button>
              <button
                onClick={() => { onDelete(); setShowMenu(false) }}
                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KanbanCard({ deal, onOpenEdit, onMove, onDelete, onShowHistory }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? 'opacity-40' : ''}>
      <DealCardContent deal={deal} onOpenEdit={onOpenEdit} onMove={onMove} onDelete={onDelete} onShowHistory={onShowHistory} />
    </div>
  )
}
```

Ponto importante: o `onPointerDown`/`onClick` com `stopPropagation()` na fileira de ações (WhatsApp/Mover/⋮) impede que clicar num desses botões dispare também o `onClick={onOpenEdit}` do card (que fica no elemento pai) e impede que o sensor de arrasto do `@dnd-kit` (escutando no wrapper externo) capture esse toque como início de arrasto.

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/KanbanCard.tsx
git commit -m "$(cat <<'EOF'
feat: KanbanCard — card arrastável de negócio pro board

Corpo clicável abre o DealModal de edição completa. Ações rápidas:
WhatsApp (se tiver telefone), "Mover para..." (atalho de status sem
precisar arrastar — útil no celular, mesmo padrão do Trello) e um
menu com Histórico/Excluir. Exporta DealCardContent separadamente pra
reaproveitar no DragOverlay sem chamar useDraggable duas vezes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `KanbanColumn.tsx` (novo)

**Files:**
- Create: `src/components/KanbanColumn.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
import { useDroppable } from '@dnd-kit/core'
import type { Deal, DealStatus } from '../types'
import KanbanCard from './KanbanCard'
import { statusConfig } from './StatusBadge'

interface Props {
  status: DealStatus
  deals: Deal[]
  onOpenEdit: (deal: Deal) => void
  onMove: (deal: Deal, status: DealStatus) => void
  onDelete: (deal: Deal) => void
  onShowHistory: (deal: Deal) => void
}

export default function KanbanColumn({ status, deals, onOpenEdit, onMove, onDelete, onShowHistory }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const cfg = statusConfig[status]

  return (
    <div className="flex flex-col shrink-0 w-72">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${cfg.classes}`}>
        <span className="text-sm font-bold">{cfg.label}</span>
        <span className="text-xs font-bold bg-white/60 dark:bg-black/20 rounded-full px-2 py-0.5">{deals.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 p-2 rounded-b-xl border border-t-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 min-h-[120px] max-h-[calc(100vh-320px)] overflow-y-auto transition-colors ${
          isOver ? 'bg-orange-50 dark:bg-orange-900/10' : ''
        }`}
      >
        {deals.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Nenhum negócio aqui</p>
        ) : (
          deals.map(deal => (
            <KanbanCard
              key={deal.id}
              deal={deal}
              onOpenEdit={() => onOpenEdit(deal)}
              onMove={s => onMove(deal, s)}
              onDelete={() => onDelete(deal)}
              onShowHistory={() => onShowHistory(deal)}
            />
          ))
        )}
      </div>
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
git add src/components/KanbanColumn.tsx
git commit -m "$(cat <<'EOF'
feat: KanbanColumn — coluna droppable de uma etapa do funil

Cabeçalho usa as mesmas cores/labels de StatusBadge.tsx (statusConfig).
Rolagem vertical interna própria pra não esticar a página quando uma
coluna tem muitos negócios.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `KanbanBoard.tsx` (novo)

**Files:**
- Create: `src/components/KanbanBoard.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Deal, DealStatus } from '../types'
import { STATUS_ORDER } from '../types'
import KanbanColumn from './KanbanColumn'
import { DealCardContent } from './KanbanCard'

const CLOSED_STATUSES: DealStatus[] = ['SUCESSO', 'DESISTIU', 'CANCELADO']

interface Props {
  deals: Deal[]
  hideClosed: boolean
  onOpenEdit: (deal: Deal) => void
  onMove: (deal: Deal, status: DealStatus) => void
  onDelete: (deal: Deal) => void
  onShowHistory: (deal: Deal) => void
}

export default function KanbanBoard({ deals, hideClosed, onOpenEdit, onMove, onDelete, onShowHistory }: Props) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const byStatus = (status: DealStatus) => deals.filter(d => d.status === status)
  const visibleStatuses = hideClosed
    ? STATUS_ORDER.filter(s => !CLOSED_STATUSES.includes(s))
    : STATUS_ORDER

  function handleDragStart(event: DragStartEvent) {
    setActiveDeal((event.active.data.current as { deal: Deal } | undefined)?.deal ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null)
    const deal = (event.active.data.current as { deal: Deal } | undefined)?.deal
    const newStatus = event.over?.id as DealStatus | undefined
    if (!deal || !newStatus) return
    onMove(deal, newStatus)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {visibleStatuses.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            deals={byStatus(status)}
            onOpenEdit={onOpenEdit}
            onMove={onMove}
            onDelete={onDelete}
            onShowHistory={onShowHistory}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? (
          <DealCardContent
            deal={activeDeal}
            onOpenEdit={() => {}}
            onMove={() => {}}
            onDelete={() => {}}
            onShowHistory={() => {}}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
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
git add src/components/KanbanBoard.tsx
git commit -m "$(cat <<'EOF'
feat: KanbanBoard — DndContext, agrupa negócios em colunas por status

PointerSensor com activationConstraint de 8px de distância — permite
clique normal no card (abre edição) sem engatar arrasto sem querer.
DragOverlay mostra uma cópia visual do card sendo arrastado usando
DealCardContent direto (sem chamar useDraggable de novo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Reescrever `RegistroNegocios.tsx`

**Files:**
- Modify: `src/pages/RegistroNegocios.tsx` (reescrita completa)

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```tsx
import { useEffect, useState, useMemo } from 'react'
import { Plus, Search, Download, RefreshCw, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { exportDeals } from '../lib/export'
import type { Deal, DealStatus } from '../types'
import DealModal from '../components/DealModal'
import DealHistoryModal from '../components/DealHistoryModal'
import KanbanBoard from '../components/KanbanBoard'
import { usePreferences } from '../contexts/PreferencesContext'

const ALL = 'TODOS'

export default function RegistroNegocios() {
  const { prefs, updateNegociosOcultarFechados } = usePreferences()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterResp, setFilterResp] = useState<string>(ALL)
  const [filterType, setFilterType] = useState<string>(ALL)
  const [sortBy, setSortBy] = useState<'date' | 'client' | 'contact' | 'priority'>('date')
  const [editDeal, setEditDeal] = useState<Deal | null | undefined>(undefined)
  const [historyDeal, setHistoryDeal] = useState<Deal | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('last_contact_date', { ascending: false, nullsFirst: false })
      .order('start_date', { ascending: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setDeals(data as Deal[] ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteDeal(id: string) {
    if (!confirm('Excluir este negócio?')) return
    await supabase.from('deals').delete().eq('id', id)
    setDeals(d => d.filter(x => x.id !== id))
  }

  async function moveDeal(deal: Deal, newStatus: DealStatus) {
    if (deal.status === newStatus) return
    const previous = deals
    setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
    const { error } = await supabase.from('deals').update({ status: newStatus }).eq('id', deal.id)
    if (error) {
      setDeals(previous)
      toast.error('Não foi possível mover o negócio. Tente novamente.')
      return
    }
    await supabase.from('crm_deal_history').insert({
      deal_id: deal.id,
      client_name: deal.client_name,
      status_before: deal.status,
      status_after: newStatus,
      follow_up: null,
      last_contact_date: null,
    })
  }

  const responsaveis = useMemo(() => [ALL, ...Array.from(new Set(
    deals.flatMap(d => d.responsaveis?.length ? d.responsaveis : (d.responsible ? [d.responsible] : []))
  ))], [deals])
  const types = useMemo(() => [ALL, ...Array.from(new Set(deals.map(d => d.deal_type).filter(Boolean) as string[]))], [deals])

  const PRIORITY_ORDER: Record<string, number> = { 'ALTA': 0, 'MÉDIA': 1, 'BAIXA': 2 }

  const filtered = useMemo(() => {
    const result = deals.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        d.client_name.toLowerCase().includes(q) ||
        (d.contact_name ?? '').toLowerCase().includes(q) ||
        (d.follow_up ?? '').toLowerCase().includes(q) ||
        (d.interest ?? '').toLowerCase().includes(q)
      const respArr = d.responsaveis?.length ? d.responsaveis : (d.responsible ? [d.responsible] : [])
      const matchResp = filterResp === ALL || respArr.includes(filterResp)
      const matchType = filterType === ALL || d.deal_type === filterType
      return matchSearch && matchResp && matchType
    })
    return result.sort((a, b) => {
      if (sortBy === 'client')   return a.client_name.localeCompare(b.client_name, 'pt')
      if (sortBy === 'contact')  return (a.last_contact_date ?? '').localeCompare(b.last_contact_date ?? '')
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9)
      const dateA = a.last_contact_date ?? a.start_date ?? ''
      const dateB = b.last_contact_date ?? b.start_date ?? ''
      return dateB.localeCompare(dateA)
    })
  }, [deals, search, filterResp, filterType, sortBy])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">Negócios</h1>
        <div className="flex gap-2">
          <button
            onClick={() => updateNegociosOcultarFechados(!prefs.negociosOcultarFechados)}
            className={`btn-secondary text-xs py-1.5 ${prefs.negociosOcultarFechados ? 'text-orange-600' : ''}`}
            title={prefs.negociosOcultarFechados ? 'Mostrar colunas fechadas' : 'Ocultar colunas fechadas'}
          >
            {prefs.negociosOcultarFechados ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden sm:inline">{prefs.negociosOcultarFechados ? 'Mostrar fechados' : 'Ocultar fechados'}</span>
          </button>
          <button onClick={() => { try { exportDeals(filtered) } catch { alert('Erro ao exportar Excel') } }} className="btn-secondary text-xs py-1.5" title="Exportar para Excel">
            <Download size={14} /> Excel
          </button>
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditDeal(null)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Novo</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar cliente, contato ou acompanhamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select className="input shrink-0 w-auto text-xs" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Mais recentes</option>
            <option value="contact">Último contato</option>
            <option value="client">A–Z cliente</option>
            <option value="priority">Prioridade</option>
          </select>
        </div>
        <p className="text-xs text-slate-400">{filtered.length} de {deals.length} negócios</p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> Erro ao carregar: {loadError}
          <button onClick={load} className="ml-auto text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
      ) : (
        <KanbanBoard
          deals={filtered}
          hideClosed={prefs.negociosOcultarFechados}
          onOpenEdit={deal => setEditDeal(deal)}
          onMove={moveDeal}
          onDelete={deal => deleteDeal(deal.id)}
          onShowHistory={deal => setHistoryDeal(deal)}
        />
      )}

      {editDeal !== undefined && (
        <DealModal deal={editDeal} onClose={() => setEditDeal(undefined)} onSaved={load} />
      )}
      {historyDeal && (
        <DealHistoryModal deal={historyDeal} onClose={() => setHistoryDeal(null)} />
      )}
    </div>
  )
}
```

Isso remove: `DealRow`, `filterStatus`/`statuses` (o filtro de status vira as colunas), `quickDeal`/`QuickUpdateModal` (a função de "Atualizar rápido" some da tela — "Mover para..." cobre mudar status rápido, e clicar no card cobre editar tudo, incluindo follow-up), `StatusBadge`/`PriorityBadge`/`TypeBadge`/`History`/`Pencil`/`Trash2`/`getResponsaveis`/`format`/`parseISO`/`ptBR`/`DealHistoryTimeline` (usados só dentro do `DealRow` antigo, agora dentro dos componentes novos).

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/RegistroNegocios.tsx
git commit -m "$(cat <<'EOF'
feat(negocios): substitui lista expansível por board Kanban

/negocios agora renderiza KanbanBoard em vez da lista de DealRow. O
filtro de status vira as colunas do board. Botão novo "Ocultar
fechados" liga a preferência persistida. QuickUpdateModal sai desta
página (a função de mudar status rápido virou o atalho "Mover para..."
de cada card) — continua existindo e sendo usado normalmente pelo
widget do Dashboard, sem alteração de contrato.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Verificação final

**Files:** nenhum (só checagem)

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 2: Boot check no preview**

Abrir o preview (`npm run dev`), confirmar que a tela de login carrega sem
erro no console (não dá pra testar o board de verdade sem login neste
ambiente — ver nota abaixo).

- [ ] **Step 3: Checklist manual pendente para o usuário**

Documentar como pendência (mesma limitação das fases anteriores desta
sessão — sem credenciais de usuário aqui):

1. Abrir `/negocios` logado e confirmar que as 5 colunas aparecem com os
   negócios certos, agrupados por status.
2. Arrastar um card de uma coluna pra outra (mouse e touch/celular) e
   confirmar que o status muda e que "⋮" → Histórico mostra o novo
   registro.
3. Testar "Mover para..." como alternativa ao arrastar.
4. Clicar no corpo do card e confirmar que abre o `DealModal` de edição.
5. Testar "Ocultar fechados", recarregar a página e confirmar que a
   preferência persiste.
6. Testar busca, filtro de tipo, filtro de responsável e ordenação.
7. Testar em viewport mobile (rolagem horizontal do board + arrasto por
   toque funcionando, sem crashar o layout).
8. Confirmar que excluir um card (menu "⋮" → Excluir) funciona igual a
   antes.
9. Confirmar que o widget de Negócios no Dashboard (`DashboardNegocios.tsx`,
   `NegociosCard`/`QuickUpdateModal`) continua funcionando normalmente —
   não foi alterado por este plano, mas vale confirmar que nada quebrou
   por tabela.
