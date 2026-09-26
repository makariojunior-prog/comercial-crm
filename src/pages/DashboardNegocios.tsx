import React, { useState, useEffect, useMemo } from 'react'
import { Plus, AlertTriangle, Phone, TrendingUp, User, Lock, ChevronRight } from 'lucide-react'
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
import SocialWidget from '../components/SocialWidget'
import PosVendaWidget from '../components/PosVendaWidget'
import ResumoPedidosWidget from '../components/ResumoPedidosWidget'
import AgendaWidget from '../components/AgendaWidget'
import DeliveryDashboardCard from '../components/DeliveryDashboardCard'
import { usePreferences, DEFAULT_DASHBOARD_WIDGETS } from '../contexts/PreferencesContext'
import { useSearchParams, Link } from 'react-router-dom'


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
      .limit(500)
    if (error) { setLoadError(error.message); setLoading(false); return }
    setDeals(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const openId = searchParams.get('openId')
    if (!openId) return
    setSearchParams({}, { replace: true })
    supabase.from('deals').select('*').eq('id', openId).single()
      .then(({ data }) => { if (data) setQuickDeal(data as Deal) })
  }, [])

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



  // Merge saved prefs with defaults (in case new widgets were added)
  const orderedWidgets = useMemo(() => {
    const saved = prefs.dashboardWidgets
    if (!saved.length) return DEFAULT_DASHBOARD_WIDGETS
    const savedIds = new Set(saved.map(w => w.id))
    const extra = DEFAULT_DASHBOARD_WIDGETS.filter(w => !savedIds.has(w.id))
    return [...saved, ...extra].filter(w => w.visible)
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
  const FULL_WIDTH = new Set(['frota', 'tarefas_eventos', 'visitas_negocios', 'status_loja'])

  function renderWidget(id: string) {
    switch (id) {
      case 'status_loja':
        return <DeliveryDashboardCard />
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
  const [showAllStale, setShowAllStale] = useState(false)
  const totalAtivos = novo.length + emAndamento.length

  return (
    <div className="card p-5 space-y-4 overflow-hidden">
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm">
          <TrendingUp size={16} className="text-orange-500" />
          Negócios Ativos
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
            {totalAtivos}
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

      {stale.length > 0 && (
        <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/50 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle size={14} className="text-red-500 dark:text-red-400 shrink-0" />
              <p className="font-semibold text-red-700 dark:text-red-300 text-xs truncate">
                {stale.length} negócio{stale.length > 1 ? 's' : ''} sem contato há mais de 10 dias
              </p>
            </div>
            {stale.length > 3 && (
              <button
                onClick={() => setShowAllStale(prev => !prev)}
                className="text-[11px] text-red-600 dark:text-red-400 font-semibold hover:underline shrink-0"
              >
                {showAllStale ? 'Recolher' : `Ver todos (${stale.length})`}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {(showAllStale ? stale : stale.slice(0, 3)).map(d => (
              <AlertDealRow key={d.id} deal={d} onUpdate={() => onQuickDeal(d)} />
            ))}
          </div>
        </div>
      )}

      {totalAtivos === 0 && !loading && (
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
          {novo.slice(0, 4).map(d => <DealCard key={d.id} deal={d} onUpdate={() => onQuickDeal(d)} />)}
          {novo.length > 4 && (
            <div className="text-center pt-1">
              <Link to="/negocios" className="text-xs text-orange-500 hover:underline font-medium inline-flex items-center gap-1">
                + {novo.length - 4} outros novos negócios no Kanban <ChevronRight size={12} />
              </Link>
            </div>
          )}
        </CompactSection>
      )}

      {emAndamento.length > 0 && (
        <CompactSection title="🟡 Em Andamento" count={emAndamento.length}>
          {emAndamento.slice(0, 4).map(d => <DealCard key={d.id} deal={d} onUpdate={() => onQuickDeal(d)} />)}
          {emAndamento.length > 4 && (
            <div className="text-center pt-1">
              <Link to="/negocios" className="text-xs text-orange-500 hover:underline font-medium inline-flex items-center gap-1">
                + {emAndamento.length - 4} outros negócios em andamento no Kanban <ChevronRight size={12} />
              </Link>
            </div>
          )}
        </CompactSection>
      )}
    </div>
  )
}

function CompactSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-xs">{title}</h3>
        <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>
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
      className="w-full flex items-center justify-between bg-white/90 dark:bg-slate-800/90 hover:bg-red-50/70 dark:hover:bg-red-900/30 rounded-lg px-2.5 py-1.5 border border-red-100 dark:border-red-900/30 active:scale-[.99] transition-all text-left group"
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">{deal.client_name}</p>
        {getResponsaveis(deal) && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate hidden sm:inline">
            · {getResponsaveis(deal).split(',')[0]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100/70 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
          {days}d sem contato
        </span>
        <ChevronRight size={12} className="text-slate-300 dark:text-slate-600 group-hover:text-red-500 transition-colors" />
      </div>
    </button>
  )
}

function DealCard({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const days = daysSince(deal.last_contact_date)
  const stale = isStale(deal)

  return (
    <button
      onClick={onUpdate}
      className={`card p-3 w-full text-left transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 active:scale-[.99] group ${
        stale ? 'border-red-200/70 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/20' : ''
      }`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate flex-1">{deal.client_name}</p>
          <div className="flex items-center gap-1 shrink-0 scale-90 origin-top-right">
            <TypeBadge type={deal.deal_type} />
            <PriorityBadge priority={deal.priority} />
          </div>
        </div>
        
        {deal.follow_up ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 italic">"{deal.follow_up}"</p>
        ) : deal.contact_name ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
            <Phone size={10} className="shrink-0" /> {deal.contact_name} {deal.contact_phone && `· ${deal.contact_phone}`}
          </p>
        ) : null}

        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-1.5 truncate">
            {getResponsaveis(deal) ? (
              <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded border border-orange-100 dark:border-orange-800/40 truncate">
                {getResponsaveis(deal).split(',')[0]}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">Sem responsável</span>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                stale
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : days === 0
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {days === 0 ? '🟢 Hoje' : stale ? `⚠️ ${days}d sem contato` : `${days}d`}
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}
