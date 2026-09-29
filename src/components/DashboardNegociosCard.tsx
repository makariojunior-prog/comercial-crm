import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, TrendingUp, ChevronRight, AlertTriangle } from 'lucide-react'
import type { Deal, DealStatus } from '../types'
import { getResponsaveis } from '../types'
import { daysSince } from './StatusBadge'

const STALE_DAYS = 10
const MAX_VISIBLE = 12

const CLOSED_STYLE: Partial<Record<DealStatus, { label: string; cls: string }>> = {
  SUCESSO:   { label: 'Sucesso',   cls: 'border-l-green-500' },
  DESISTIU:  { label: 'Desistiu',  cls: 'border-l-red-500' },
  CANCELADO: { label: 'Cancelado', cls: 'border-l-slate-400' },
}

interface Props {
  loading: boolean
  loadError: string | null
  novo: Deal[]
  emAndamento: Deal[]
  encerrados: Deal[]
  onRetry: () => void
  onQuickDeal: (d: Deal) => void
  onNewDeal: () => void
}

function byMostDaysWithoutContact(a: Deal, b: Deal) {
  return daysSince(b.last_contact_date) - daysSince(a.last_contact_date)
}

export default function DashboardNegociosCard({
  loading, loadError, novo, emAndamento, encerrados, onRetry, onQuickDeal, onNewDeal,
}: Props) {
  const total = novo.length + emAndamento.length

  return (
    <div className="card p-4 space-y-3 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm">
          <TrendingUp size={16} className="text-orange-500" />
          Negócios
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
            {total}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewDeal}
            className="text-xs font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-1 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-lg border border-orange-200/50 dark:border-orange-800/40 transition-colors"
          >
            <Plus size={13} /> Novo
          </button>
          <Link to="/negocios" className="text-xs font-semibold text-orange-500 hover:underline flex items-center gap-0.5">
            Kanban <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle size={14} /> {loadError}
          <button onClick={onRetry} className="ml-auto underline">Tentar novamente</button>
        </div>
      )}

      {total === 0 && encerrados.length === 0 && !loading && !loadError && (
        <p className="py-4 text-center text-sm text-slate-400">Nenhum negócio ativo</p>
      )}

      <Group title="🔵 Novos" deals={novo} onOpen={onQuickDeal} />
      <Group title="🟡 Em andamento" deals={emAndamento} onOpen={onQuickDeal} />
      <Group title="Encerrados · últimos 7 dias" deals={encerrados} onOpen={onQuickDeal} showStatus />
    </div>
  )
}

function Group({ title, deals, onOpen, showStatus }: {
  title: string
  deals: Deal[]
  onOpen: (d: Deal) => void
  showStatus?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  if (deals.length === 0) return null
  const sorted = [...deals].sort(byMostDaysWithoutContact)
  const visible = expanded ? sorted : sorted.slice(0, MAX_VISIBLE)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="font-semibold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wide">{title}</h3>
        <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
          {deals.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {visible.map(d => <MiniDealCard key={d.id} deal={d} onOpen={() => onOpen(d)} showStatus={showStatus} />)}
      </div>
      {sorted.length > MAX_VISIBLE && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1.5 text-[11px] font-semibold text-orange-500 hover:underline"
        >
          {expanded ? 'Recolher' : `Ver todos (${sorted.length})`}
        </button>
      )}
    </div>
  )
}

function MiniDealCard({ deal, onOpen, showStatus }: { deal: Deal; onOpen: () => void; showStatus?: boolean }) {
  const days = daysSince(deal.last_contact_date)
  const active = deal.status === 'NOVO' || deal.status === 'EM ANDAMENTO'
  const stale = active && days > STALE_DAYS
  const resp = getResponsaveis(deal).split(',')[0]?.trim()
  const closed = deal.status ? CLOSED_STYLE[deal.status] : undefined

  const badgeCls = !active
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
    : stale
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : days === 0
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 bg-white dark:bg-slate-800 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 active:scale-[.99] transition-all ${
        showStatus && closed ? closed.cls : stale ? 'border-l-red-400' : 'border-l-orange-300'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">{deal.client_name}</p>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeCls}`}>
          {days >= 999 ? 'sem contato' : days === 0 ? 'Hoje' : `${days}d`}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
        {resp || 'Sem responsável'}
        {showStatus && closed ? ` · ${closed.label}` : ''}
      </p>
    </button>
  )
}
