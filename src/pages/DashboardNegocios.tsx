import { useState, useEffect, useMemo } from 'react'
import { Plus, AlertTriangle, Phone, RefreshCw, TrendingUp, User } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Deal } from '../types'
import { getResponsaveis } from '../types'
import { PriorityBadge, TypeBadge, isStale, daysSince } from '../components/StatusBadge'
import QuickUpdateModal from '../components/QuickUpdateModal'
import DealModal from '../components/DealModal'
import DashboardTasks from '../components/DashboardTasks'
import DashboardEvents from '../components/DashboardEvents'
import RecentVisitsWidget from '../components/RecentVisitsWidget'
import DashboardNotesWidget from '../components/DashboardNotesWidget'
import VehicleAlertsWidget from '../components/VehicleAlertsWidget'
import TrackingWidget from '../components/TrackingWidget'
import VarejoFilaWidget from '../components/VarejoFilaWidget'
import { usePreferences, DEFAULT_DASHBOARD_WIDGETS } from '../contexts/PreferencesContext'

export default function DashboardNegocios() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quickDeal, setQuickDeal] = useState<Deal | null>(null)
  const [newDeal, setNewDeal] = useState(false)
  const { prefs } = usePreferences()

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('start_date', { ascending: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setDeals(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const active = deals.filter(d => d.status === 'NOVO' || d.status === 'EM ANDAMENTO')
  const stale  = active.filter(d => isStale(d))
  const novo   = active.filter(d => d.status === 'NOVO')
  const emAndamento = active.filter(d => d.status === 'EM ANDAMENTO')

  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })

  // Merge saved prefs with defaults (in case new widgets were added)
  const orderedWidgets = useMemo(() => {
    const saved = prefs.dashboardWidgets
    if (!saved.length) return DEFAULT_DASHBOARD_WIDGETS
    const savedIds = new Set(saved.map(w => w.id))
    const extra = DEFAULT_DASHBOARD_WIDGETS.filter(w => !savedIds.has(w.id))
    return [...saved, ...extra].filter(w => w.visible)
  }, [prefs.dashboardWidgets])

  // Full-width widgets span both columns; half-width fit side-by-side in the grid
  const FULL_WIDTH = new Set(['frota', 'tarefas_eventos', 'visitas_negocios'])

  function renderWidget(id: string) {
    switch (id) {
      case 'tarefas_eventos':  // legado
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <DashboardTasks />
            <DashboardEvents />
          </div>
        )
      case 'visitas_negocios':  // legado
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5"><RecentVisitsWidget /></div>
            <NegociosCard
              loading={loading}
              loadError={loadError}
              stale={stale}
              novo={novo}
              emAndamento={emAndamento}
              onRetry={load}
              onQuickDeal={setQuickDeal}
              onNewDeal={() => setNewDeal(true)}
            />
          </div>
        )
      case 'tarefas':
        return <DashboardTasks />
      case 'eventos':
        return <DashboardEvents />
      case 'visitas':
        return <div className="card p-5"><RecentVisitsWidget /></div>
      case 'negocios':
        return (
          <NegociosCard
            loading={loading}
            loadError={loadError}
            stale={stale}
            novo={novo}
            emAndamento={emAndamento}
            onRetry={load}
            onQuickDeal={setQuickDeal}
            onNewDeal={() => setNewDeal(true)}
          />
        )
      case 'notas':
        return <div className="card p-5"><DashboardNotesWidget /></div>
      case 'varejo_fila':
        return <div className="card p-5"><VarejoFilaWidget /></div>
      case 'frota':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <VehicleAlertsWidget />
            <TrackingWidget />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 capitalize">{today}</p>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
             Dashboard Geral
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setNewDeal(true)} className="btn-primary">
            <Plus size={16} />
            <span className="hidden sm:inline">Novo Negócio</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {orderedWidgets.map(w => (
          <div key={w.id} className={FULL_WIDTH.has(w.id) ? 'lg:col-span-2' : ''}>
            {renderWidget(w.id)}
          </div>
        ))}
      </div>

      {/* Modals */}
      {quickDeal && (
        <QuickUpdateModal deal={quickDeal} onClose={() => setQuickDeal(null)} onSaved={load} />
      )}
      {newDeal && (
        <DealModal onClose={() => setNewDeal(false)} onSaved={load} />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function NegociosCard({ loading, loadError, stale, novo, emAndamento, onRetry, onQuickDeal, onNewDeal }: {
  loading: boolean
  loadError: string | null
  stale: Deal[]
  novo: Deal[]
  emAndamento: Deal[]
  onRetry: () => void
  onQuickDeal: (d: Deal) => void
  onNewDeal: () => void
}) {
  return (
    <div className="card p-5 space-y-4 overflow-hidden">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle size={14} /> {loadError}
          <button onClick={onRetry} className="ml-auto underline">Tentar novamente</button>
        </div>
      )}

      {stale.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />
            <p className="font-semibold text-red-700 dark:text-red-300 text-xs">
              {stale.length} negócio{stale.length > 1 ? 's' : ''} sem contato há mais de 10 dias
            </p>
          </div>
          <div className="space-y-1.5">
            {stale.map(d => <AlertDealRow key={d.id} deal={d} onUpdate={() => onQuickDeal(d)} />)}
          </div>
        </div>
      )}

      {novo.length === 0 && emAndamento.length === 0 && !loading && (
        <div className="py-6 text-center text-slate-400">
          <TrendingUp size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum negócio ativo</p>
          <button onClick={onNewDeal} className="btn-primary mt-3 mx-auto">
            <Plus size={14} /> Criar primeiro negócio
          </button>
        </div>
      )}

      {novo.length > 0 && (
        <CompactSection title="🔵 Novos" count={novo.length}>
          {novo.map(d => <DealCard key={d.id} deal={d} onUpdate={() => onQuickDeal(d)} />)}
        </CompactSection>
      )}

      {emAndamento.length > 0 && (
        <CompactSection title="🟡 Em Andamento" count={emAndamento.length}>
          {emAndamento.map(d => <DealCard key={d.id} deal={d} onUpdate={() => onQuickDeal(d)} />)}
        </CompactSection>
      )}
    </div>
  )
}

function CompactSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-semibold text-slate-700 dark:text-slate-300 text-xs">{title}</h2>
        <span className="bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AlertDealRow({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const days = daysSince(deal.last_contact_date)
  return (
    <button
      onClick={onUpdate}
      className="w-full flex items-center justify-between bg-white dark:bg-slate-700 rounded-lg px-3 py-2.5 border border-red-100 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-[.99] transition-all text-left"
    >
      <div className="min-w-0">
        <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">{deal.client_name}</p>
        <p className="text-xs text-red-500 dark:text-red-400">{days} dias sem contato · {getResponsaveis(deal)}</p>
      </div>
      <span className="text-xs text-orange-500 font-semibold shrink-0 ml-3">Toque para atualizar →</span>
    </button>
  )
}

function DealCard({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const days = daysSince(deal.last_contact_date)
  const stale = isStale(deal)

  return (
    <button
      onClick={onUpdate}
      className={`card p-4 w-full text-left transition-all hover:shadow-md active:scale-[.99] ${stale ? 'border-red-200' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TypeBadge type={deal.deal_type} />
            <PriorityBadge priority={deal.priority} />
          </div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{deal.client_name}</p>
          {deal.contact_name && (
            <p className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <Phone size={11} />
              {deal.contact_name}
              {deal.contact_phone && ` · ${deal.contact_phone}`}
            </p>
          )}
          {deal.follow_up && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 italic">"{deal.follow_up}"</p>
          )}
          <div className="flex items-center justify-between mt-2 gap-2">
            {getResponsaveis(deal) && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full border border-orange-100 dark:border-orange-800 shrink-0">
                <User size={10} /> {getResponsaveis(deal)}
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <span className={`text-xs font-medium ${stale ? 'text-red-500' : 'text-slate-400'}`}>
                {days === 0 ? '🟢 Hoje' : stale ? `⚠️ ${days}d sem contato` : `${days}d`}
              </span>
              {deal.last_contact_date && (
                <span className="text-xs text-slate-400">
                  {format(parseISO(deal.last_contact_date), 'dd/MM', { locale: ptBR })}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="text-xs text-orange-400 font-semibold shrink-0 mt-1">Toque →</span>
      </div>
    </button>
  )
}
