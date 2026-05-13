import type { DealStatus, DealPriority } from '../types'

const statusConfig: Record<DealStatus, { label: string; classes: string }> = {
  'NOVO': { label: 'Novo', classes: 'bg-blue-100 text-blue-700' },
  'EM ANDAMENTO': { label: 'Em Andamento', classes: 'bg-amber-100 text-amber-700' },
  'SUCESSO': { label: 'Sucesso', classes: 'bg-green-100 text-green-700' },
  'DESISTIU': { label: 'Desistiu', classes: 'bg-red-100 text-red-600' },
  'CANCELADO': { label: 'Cancelado', classes: 'bg-slate-100 text-slate-500' },
}

const priorityConfig: Record<DealPriority, { label: string; classes: string; dot: string }> = {
  'ALTA': { label: 'Alta', classes: 'bg-red-50 text-red-600 border border-red-200', dot: 'bg-red-500' },
  'MÉDIA': { label: 'Média', classes: 'bg-amber-50 text-amber-600 border border-amber-200', dot: 'bg-amber-500' },
  'BAIXA': { label: 'Baixa', classes: 'bg-green-50 text-green-600 border border-green-200', dot: 'bg-green-500' },
}

const typeConfig: Record<string, string> = {
  'CANTINA REVENDA': 'bg-purple-100 text-purple-700',
  'LUMAR': 'bg-blue-100 text-blue-700',
  'LUMAR / CANTINA': 'bg-indigo-100 text-indigo-700',
}

export function StatusBadge({ status }: { status: DealStatus | null }) {
  if (!status) return null
  const cfg = statusConfig[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: DealPriority | null }) {
  if (!priority) return null
  const cfg = priorityConfig[priority]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const classes = typeConfig[type] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${classes}`}>
      {type}
    </span>
  )
}

export function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / 86400000)
}

export function isStale(deal: { status: DealStatus | null; last_contact_date: string | null }, threshold = 10): boolean {
  if (deal.status !== 'NOVO' && deal.status !== 'EM ANDAMENTO') return false
  return daysSince(deal.last_contact_date) > threshold
}
