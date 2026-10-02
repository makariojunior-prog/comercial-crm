import React, { useState, useEffect, useMemo } from 'react'
import { User, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Deal } from '../types'
import DashboardNegociosCard from '../components/DashboardNegociosCard'
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
import ErrorBoundary from '../components/ErrorBoundary'
import { usePreferences, DEFAULT_DASHBOARD_WIDGETS } from '../contexts/PreferencesContext'
import { useSearchParams } from 'react-router-dom'

const CLOSED_STATUSES = ['SUCESSO', 'DESISTIU', 'CANCELADO']
const RECENT_DAYS = 7

function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString()
}



export default function DashboardNegocios() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [recentlyClosedIds, setRecentlyClosedIds] = useState<Set<string>>(new Set())
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

    // Fechados só entram no card se mudaram de status nos últimos 7 dias
    const { data: hist } = await supabase
      .from('crm_deal_history')
      .select('deal_id')
      .in('status_after', CLOSED_STATUSES)
      .gte('updated_at', daysAgoISO(RECENT_DAYS))
    setRecentlyClosedIds(new Set((hist ?? []).map(h => h.deal_id as string)))
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
      .then(async ({ data }) => {
        const rows = data ?? []
        setFixedWidgets(rows)
        // Se ainda não existir 'status_loja' na tabela do banco, tenta inserir no topo
        if (!rows.some(w => w.widget_id === 'status_loja')) {
          try {
            await supabase.from('dashboard_fixed_widgets').insert({
              widget_id: 'status_loja',
              visible: true,
              ordem: -1,
              updated_at: new Date().toISOString(),
            })
          } catch {
            // Ignora se não for admin
          }
        }
      })
  }, [])

  // status é nullable no banco — sem status conta como NOVO (mesma regra do Kanban)
  const novo = deals.filter(d => (d.status ?? 'NOVO') === 'NOVO')
  const emAndamento = deals.filter(d => d.status === 'EM ANDAMENTO')
  const encerrados = deals.filter(d => {
    if (!d.status || !CLOSED_STATUSES.includes(d.status)) return false
    if (recentlyClosedIds.has(d.id)) return true
    // Sem histórico (fechado antes do histórico existir): usa a data de encerramento
    return !!d.end_date && new Date(d.end_date).getTime() >= Date.now() - RECENT_DAYS * 86400000
  })

  // Garante que 'status_loja' esteja sempre presente no topo da seção fixa para todos os usuários
  const effectiveFixedWidgets = useMemo(() => {
    const list = [...fixedWidgets]
    const exists = list.some(w => w.widget_id === 'status_loja')
    if (!exists) {
      list.unshift({ widget_id: 'status_loja', visible: true, ordem: -1 })
    }
    return list
  }, [fixedWidgets])

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
    () => new Set(effectiveFixedWidgets.filter(w => w.visible).map(w => w.widget_id)),
    [effectiveFixedWidgets]
  )

  const personalWidgets = useMemo(
    () => orderedWidgets.filter(w => !fixedWidgetIds.has(w.id)),
    [orderedWidgets, fixedWidgetIds]
  )

  // Widgets that always span both columns (full width)
  const FULL_WIDTH = new Set(['frota', 'tarefas_eventos', 'visitas_negocios', 'status_loja', 'posvendas'])

  function renderWidget(id: string) {
    switch (id) {
      case 'status_loja':
        return (
          <ErrorBoundary>
            <DeliveryDashboardCard />
          </ErrorBoundary>
        )

      case 'tarefas_eventos':  // legado
        return <DashboardTasks />
      case 'visitas_negocios':  // legado
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card p-5"><RecentVisitsWidget /></div>
            <DashboardNegociosCard
              loading={loading}
              loadError={loadError}
              novo={novo}
              emAndamento={emAndamento}
              encerrados={encerrados}
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
          <DashboardNegociosCard
            loading={loading}
            loadError={loadError}
            novo={novo}
            emAndamento={emAndamento}
            encerrados={encerrados}
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
        sections.push(
          <div key={`${prefix}-${w.id}`} className={w.id === 'status_loja' ? 'lg:hidden' : undefined}>
            {renderWidget(w.id)}
          </div>
        )
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
        {/* ── Seção Fixa — definida pelo administrador (Visível para todos os usuários) ── */}
        {effectiveFixedWidgets.some(w => w.visible) && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                <Lock size={9} /> Visão Geral da Empresa
              </span>
              <div className="h-px flex-1 bg-orange-200 dark:bg-orange-800/40" />
            </div>
            {buildMasonry(
              effectiveFixedWidgets.filter(w => w.visible).map(w => ({ id: w.widget_id, visible: true })),
              'fixed'
            )}
          </div>
        )}

        {/* ── Seção Personalizada ── */}
        {personalWidgets.length > 0 && (
          <div className="space-y-4">
            {effectiveFixedWidgets.some(w => w.visible) && (
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
