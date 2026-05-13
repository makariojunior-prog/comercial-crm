import { useState, useEffect } from 'react'
import { Plus, Route, Edit2, Trash2, Play, RefreshCw, Users, Calendar, Repeat, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Route as RouteType, RouteExecution, CrmUser } from '../types'
import { ROUTE_DAYS } from '../types'
import RouteModal from '../components/RouteModal'
import RouteExecutionModal from '../components/RouteExecutionModal'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const FREQ_LABELS: Record<string, string> = {
  semanal:   'Semanal',
  quinzenal: 'Quinzenal',
  mensal:    'Mensal',
}

const EXEC_STATUS_COLOR: Record<string, string> = {
  AGENDADA:    'bg-blue-100 text-blue-700',
  EM_ANDAMENTO:'bg-amber-100 text-amber-700',
  CONCLUIDA:   'bg-green-100 text-green-700',
  CANCELADA:   'bg-red-100 text-red-700',
}

const EXEC_STATUS_LABEL: Record<string, string> = {
  AGENDADA:    'Agendada',
  EM_ANDAMENTO:'Em Andamento',
  CONCLUIDA:   'Concluída',
  CANCELADA:   'Cancelada',
}

export default function RoutesPage() {
  const { isAdmin, user } = useAuth()
  const [routes, setRoutes]             = useState<RouteType[]>([])
  const [executions, setExecutions]     = useState<RouteExecution[]>([])
  const [users, setUsers]               = useState<CrmUser[]>([])
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({})
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<'routes' | 'history'>('routes')
  const [showModal, setShowModal]       = useState(false)
  const [editingRoute, setEditingRoute] = useState<RouteType | null>(null)
  const [executingRoute, setExecutingRoute] = useState<RouteType | null>(null)
  const [expandedRoute, setExpandedRoute]   = useState<string | null>(null)

  async function load() {
    setLoading(true)

    const [routesRes, usersRes, countRes, execRes] = await Promise.all([
      supabase
        .from('crm_routes')
        .select('*, responsible:crm_users!crm_routes_responsible_id_fkey(nome)')
        .order('name'),
      supabase.from('crm_users').select('id, nome').eq('ativo', true),
      supabase.from('crm_route_clients').select('route_id'),
      supabase
        .from('crm_route_executions')
        .select('*, route:crm_routes(name), executor:crm_users!crm_route_executions_executor_id_fkey(nome)')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    setRoutes((routesRes.data || []) as RouteType[])
    setUsers((usersRes.data || []) as CrmUser[])
    setExecutions((execRes.data || []) as RouteExecution[])

    // Client count per route
    const counts: Record<string, number> = {}
    for (const row of (countRes.data || [])) {
      counts[row.route_id] = (counts[row.route_id] || 0) + 1
    }
    setClientCounts(counts)

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteRoute(r: RouteType) {
    if (!confirm(`Excluir a rota "${r.name}"? Esta ação não pode ser desfeita.`)) return
    await supabase.from('crm_routes').delete().eq('id', r.id)
    setRoutes(prev => prev.filter(x => x.id !== r.id))
  }

  const activeRoutes   = routes.filter(r => r.is_active)
  const inactiveRoutes = routes.filter(r => !r.is_active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Route className="text-orange-500" size={24} /> Rotas Comerciais
          </h1>
          <p className="text-sm text-slate-500">
            Gerencie rotas de visitação e acompanhamento da carteira de clientes
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button onClick={() => { setEditingRoute(null); setShowModal(true) }} className="btn-primary">
              <Plus size={18} /> Nova Rota
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['routes', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'routes'
              ? `Rotas (${routes.length})`
              : `Histórico (${executions.filter(e => e.status === 'CONCLUIDA').length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Carregando rotas...</div>
      ) : tab === 'routes' ? (
        /* ── ROUTES TAB ── */
        <div className="space-y-6">
          {routes.length === 0 ? (
            <div className="card p-16 text-center text-slate-400">
              <Route size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">Nenhuma rota cadastrada</p>
              {isAdmin && (
                <button onClick={() => setShowModal(true)} className="btn-primary mt-4 mx-auto">
                  <Plus size={16} /> Criar primeira rota
                </button>
              )}
            </div>
          ) : (
            <>
              {activeRoutes.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rotas Ativas ({activeRoutes.length})</h2>
                  {activeRoutes.map(r => (
                    <RouteCard
                      key={r.id}
                      route={r}
                      clientCount={clientCounts[r.id] || 0}
                      isAdmin={isAdmin}
                      expanded={expandedRoute === r.id}
                      onExpand={() => setExpandedRoute(expandedRoute === r.id ? null : r.id)}
                      onEdit={() => { setEditingRoute(r); setShowModal(true) }}
                      onDelete={() => deleteRoute(r)}
                      onExecute={() => setExecutingRoute(r)}
                    />
                  ))}
                </div>
              )}
              {inactiveRoutes.length > 0 && (
                <div className="space-y-3 opacity-60">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inativas ({inactiveRoutes.length})</h2>
                  {inactiveRoutes.map(r => (
                    <RouteCard
                      key={r.id}
                      route={r}
                      clientCount={clientCounts[r.id] || 0}
                      isAdmin={isAdmin}
                      expanded={expandedRoute === r.id}
                      onExpand={() => setExpandedRoute(expandedRoute === r.id ? null : r.id)}
                      onEdit={() => { setEditingRoute(r); setShowModal(true) }}
                      onDelete={() => deleteRoute(r)}
                      onExecute={() => setExecutingRoute(r)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── HISTORY TAB ── */
        <div className="space-y-3">
          {executions.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">
              <Clock size={40} className="mx-auto mb-3 opacity-20" />
              <p>Nenhuma execução registrada ainda</p>
            </div>
          ) : executions.map(exec => (
            <ExecutionRow key={exec.id} execution={exec} />
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <RouteModal
          route={editingRoute}
          onClose={() => { setShowModal(false); setEditingRoute(null) }}
          onSaved={load}
        />
      )}
      {executingRoute && (
        <RouteExecutionModal
          route={executingRoute}
          onClose={() => setExecutingRoute(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ─── RouteCard ─────────────────────────────────────────────────
function RouteCard({
  route, clientCount, isAdmin, expanded, onExpand, onEdit, onDelete, onExecute
}: {
  route: RouteType
  clientCount: number
  isAdmin: boolean
  expanded: boolean
  onExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onExecute: () => void
}) {
  const dayLabels = ROUTE_DAYS.filter(d => route.days_of_week?.includes(d.id)).map(d => d.label)

  return (
    <div className="card bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
            <Route size={18} className="text-orange-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800">{route.name}</h3>
                {route.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{route.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onExecute}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-colors shadow-sm"
                >
                  <Play size={12} /> Executar
                </button>
                {isAdmin && (
                  <>
                    <button onClick={onEdit} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {/* Responsible */}
              {(route.responsible as any)?.nome && (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  <Users size={9} /> {(route.responsible as any).nome}
                </span>
              )}
              {/* Frequency */}
              <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                <Repeat size={9} /> {FREQ_LABELS[route.frequency] ?? route.frequency}
              </span>
              {/* Days */}
              {dayLabels.map(d => (
                <span key={d} className="text-[10px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
                  {d}
                </span>
              ))}
              {/* Client count */}
              <button
                onClick={onExpand}
                className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 transition-colors ml-auto"
              >
                {clientCount} cliente{clientCount !== 1 ? 's' : ''}
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded client list */}
      {expanded && <RouteClientList routeId={route.id} />}
    </div>
  )
}

// ─── RouteClientList ────────────────────────────────────────────
function RouteClientList({ routeId }: { routeId: string }) {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('crm_route_clients')
      .select('*, client:crm_clients(nome, setor, telefone)')
      .eq('route_id', routeId)
      .order('visit_order')
      .then(({ data }) => { setClients(data || []); setLoading(false) })
  }, [routeId])

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
      {loading ? (
        <p className="text-xs text-slate-400">Carregando clientes...</p>
      ) : clients.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Nenhum cliente nesta rota</p>
      ) : (
        <div className="space-y-2">
          {clients.map((rc, i) => (
            <div key={rc.id} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700">{rc.client?.nome}</p>
                {rc.observations && (
                  <p className="text-[10px] text-orange-700 italic mt-0.5">{rc.observations}</p>
                )}
              </div>
              {rc.client?.setor && (
                <span className="text-[9px] text-slate-400 shrink-0">{rc.client.setor}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ExecutionRow ───────────────────────────────────────────────
function ExecutionRow({ execution }: { execution: RouteExecution }) {
  const routeName   = (execution.route as any)?.name ?? 'Rota'
  const executorName = (execution.executor as any)?.nome ?? 'Equipe'

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
        <CheckCircle2 size={16} className="text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-slate-800 truncate">{routeName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-500">{executorName}</span>
          {execution.scheduled_date && (
            <span className="text-xs text-slate-400">
              · {format(parseISO(execution.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${EXEC_STATUS_COLOR[execution.status]}`}>
        {EXEC_STATUS_LABEL[execution.status]}
      </span>
    </div>
  )
}
