import React, { useState, useEffect, useMemo } from 'react'
import { Plus, AlertTriangle, Phone, RefreshCw, TrendingUp, User, Lock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Deal } from '../types'
import { getResponsaveis } from '../types'
import { PriorityBadge, TypeBadge, isStale, daysSince } from '../components/StatusBadge'
import QuickUpdateModal from '../components/QuickUpdateModal'
import DealModal from '../components/DealModal'
import DashboardTasks from '../components/DashboardTasks'
import RecentVisitsWidget from '../components/RecentVisitsWidget'
import DashboardNotesWidget from '../components/DashboardNotesWidget'
import VehicleAlertsWidget from '../components/VehicleAlertsWidget'
import TrackingWidget from '../components/TrackingWidget'
import VarejoFilaWidget from '../components/VarejoFilaWidget'
import ConversacoesAlertasWidget from '../components/ConversacoesAlertasWidget'
import SocialWidget from '../components/SocialWidget'
import PosVendaWidget from '../components/PosVendaWidget'
import ResumoPedidosWidget from '../components/ResumoPedidosWidget'
import AgendaWidget from '../components/AgendaWidget'
import { usePreferences, DEFAULT_DASHBOARD_WIDGETS } from '../contexts/PreferencesContext'

export default function DashboardNegocios() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quickDeal, setQuickDeal] = useState<Deal | null>(null)
  const [newDeal, setNewDeal] = useState(false)
  const [fixedWidgets, setFixedWidgets] = useState<{ widget_id: string; visible: boolean; ordem: number }[]>([])
  const { prefs } = usePreferences()

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('last_contact_date', { ascending: false, nullsFirst: false })
      .order('start_date', { ascending: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setDeals(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    supabase
      .from('dashboard_fixed_widgets')
      .select('widget_id, visible, ordem')
      .order('ordem')
      .then(({ data }) => setFixedWidgets(data ?? []))
  }, [])

  const active = deals.filter(d => d.status === 'NOVO' || d.status === 'EM ANDAMENTO')
  const stale  = active.filter(d => isStale(d))
  const novo   = active.filter(d => d.status === 'NOVO')
  const emAndamento = active.filter(d => d.status === 'EM ANDAMENTO')

  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })

  // Merge saved prefs with defaults (in case new widgets were added)
  // conversas_alertas is always pinned first regardless of saved order
  const orderedWidgets = useMemo(() => {
    const saved = prefs.dashboardWidgets
    if (!saved.length) return DEFAULT_DASHBOARD_WIDGETS
    const savedIds = new Set(saved.map(w => w.id))
    const extra = DEFAULT_DASHBOARD_WIDGETS.filter(w => !savedIds.has(w.id))
    const all = [...saved, ...extra].filter(w => w.visible)
    const conversas = all.find(w => w.id === 'conversas_alertas')
    const rest = all.filter(w => w.id !== 'conversas_alertas')
    return conversas ? [conversas, ...rest] : all
  }, [prefs.dashboardWidgets])

  // Fixed widgets take priority — removed from the personalized section
  const fixedWidgetIds = useMemo(
    () => new Set(fixedWidgets.filter(w => w.visible).map(w => w.widget_id)),
    [fixedWidgets]
  )

  const personalWidgets = useMemo(
    () => orderedWidgets.filter(w => !fixedWidgetIds.has(w.id)),
    [orderedWidgets, fixedWidgetIds]
  )

  // Widgets that always span both columns (full width)
  const FULL_WIDTH = new Set(['frota', 'tarefas_eventos', 'visitas_negocios'])

  function renderWidget(id: string) {
    switch (id) {
      case 'tarefas_eventos':  // legado
        return <DashboardTasks />
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
        return null
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
      case 'posvendas':
        return <div className="card p-5"><PosVendaWidget /></div>
      case 'resumo_pedidos':
        return <div className="card p-5"><ResumoPedidosWidget /></div>
      case 'agenda_widget':
        return <div className="card p-5"><AgendaWidget /></div>
      case 'conversas_alertas':
        return <div className="card p-5"><ConversacoesAlertasWidget /></div>
      case 'social_comentarios':
        return <div className="card p-5"><SocialWidget /></div>
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

  // Reutilizável: gera layout masonry de 2 colunas para um grupo de widgets
  function buildMasonry(widgets: { id: string; visible: boolean }[], prefix: string) {
    const sections: React.ReactNode[] = []
    let half: { id: string; visible: boolean }[] = []
    let key = 0

    const flush = () => {
      if (!half.length) return
      const left  = half.filter((_, i) => i % 2 === 0)
      const right = half.filter((_, i) => i % 2 === 1)
      sections.push(
        <div key={`${prefix}-g${key++}`} className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <div className="flex flex-col gap-5">
            {left.map(w => <div key={w.id}>{renderWidget(w.id)}</div>)}
          </div>
          <div className="flex flex-col gap-5">
            {right.map(w => <div key={w.id}>{renderWidget(w.id)}</div>)}
          </div>
        </div>
      )
      half = []
    }

    for (const w of widgets) {
      if (FULL_WIDTH.has(w.id)) {
        flush()
        sections.push(<div key={`${prefix}-${w.id}`}>{renderWidget(w.id)}</div>)
      } else {
        half.push(w)
      }
    }
    flush()
    return sections
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

      <div className="space-y-6">
        {/* ── Seção Fixa — definida pelo administrador ── */}
        {fixedWidgets.some(w => w.visible) && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                <Lock size={9} /> Visão Geral da Empresa
              </span>
              <div className="h-px flex-1 bg-orange-200 dark:bg-orange-800/40" />
            </div>
            {buildMasonry(
              fixedWidgets.filter(w => w.visible).map(w => ({ id: w.widget_id, visible: true })),
              'fixed'
            )}
          </div>
        )}

        {/* ── Seção Personalizada ── */}
        {personalWidgets.length > 0 && (
          <div className="space-y-4">
            {fixedWidgets.some(w => w.visible) && (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                  <User size={9} /> Visão Personalizada
                </span>
                <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800/40" />
              </div>
            )}
            {buildMasonry(personalWidgets, 'personal')}
          </div>
        )}
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
