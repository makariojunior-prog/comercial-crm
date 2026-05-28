import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, MapPin, Truck, CalendarDays, ChevronDown, ChevronRight, Navigation, Pencil, Plus, Trash2, Save, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ─── Types ────────────────────────────────────────────────────────

type ScheduleEntry = { dia: string; turno: string }

interface DeliveryRoute {
  id: string
  name: string
  schedule: ScheduleEntry[] | null
  is_active: boolean
}

interface DeliverySector {
  id: number
  setor: string
  cidade: string | null
  regiao: string | null
  distancia_km: number | null
  rota: string | null
  route_id: string | null
}

// ─── Constants ────────────────────────────────────────────────────

// Ordered days of the week (matching planilha labels)
const DIAS_ORDEM = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'] as const
const DIA_ABREV: Record<string, string> = {
  SEGUNDA: 'Seg', TERÇA: 'Ter', QUARTA: 'Qua', QUINTA: 'Qui', SEXTA: 'Sex', 'SÁBADO': 'Sáb',
}
const TURNO_ORDEM = ['MANHÃ', 'TARDE', 'NOITE'] as const

const TURNO_STYLES: Record<string, string> = {
  'MANHÃ': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'TARDE': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  'NOITE': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
}
const TURNO_DOT: Record<string, string> = {
  'MANHÃ': 'bg-amber-500', 'TARDE': 'bg-blue-500', 'NOITE': 'bg-indigo-500',
}
const TURNO_LABEL: Record<string, string> = {
  'MANHÃ': 'Manhã', 'TARDE': 'Tarde', 'NOITE': 'Noite',
}

function turnoBadgeClass(turno: string) {
  return TURNO_STYLES[turno] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
}

// Table style helpers
const TH = 'text-left px-2 py-1.5 font-bold text-slate-500 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/60'
const TD = 'px-2 py-1.5 border-t border-slate-100 dark:border-slate-700'

// Build a compact schedule summary: "Seg (Manhã, Tarde) · Qua (Manhã)"
function scheduleSummary(schedule: ScheduleEntry[] | null): { dia: string; turnos: string[] }[] {
  if (!schedule || schedule.length === 0) return []
  const byDay: Record<string, Set<string>> = {}
  for (const e of schedule) {
    if (!byDay[e.dia]) byDay[e.dia] = new Set()
    byDay[e.dia].add(e.turno)
  }
  return DIAS_ORDEM
    .filter(d => byDay[d])
    .map(d => ({
      dia: d,
      turnos: TURNO_ORDEM.filter(t => byDay[d].has(t)),
    }))
}

type SubTab = 'consulta' | 'programacao' | 'rotas'

// ─── Main component ───────────────────────────────────────────────

export default function RotasEntregaTab() {
  const [subTab, setSubTab] = useState<SubTab>('consulta')
  const [routes, setRoutes] = useState<DeliveryRoute[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(true)
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({})

  async function loadRoutes() {
    const { data } = await supabase
      .from('crm_routes')
      .select('id, name, schedule, is_active')
      .order('name')
    setRoutes((data as DeliveryRoute[]) ?? [])
    setLoadingRoutes(false)
  }

  async function loadClientCounts() {
    const { data } = await supabase
      .from('crm_clients')
      .select('route_id')
      .not('route_id', 'is', null)
    const c: Record<string, number> = {}
    for (const row of (data as { route_id: string }[]) ?? []) {
      c[row.route_id] = (c[row.route_id] || 0) + 1
    }
    setClientCounts(c)
  }

  useEffect(() => {
    loadRoutes()
    loadClientCounts()
  }, [])

  // Map route_id -> route (for the lookup tab)
  const routeById = useMemo(() => {
    const m: Record<string, DeliveryRoute> = {}
    for (const r of routes) m[r.id] = r
    return m
  }, [routes])

  const SUB_TABS: { id: SubTab; label: string; icon: typeof Search }[] = [
    { id: 'consulta',    label: 'Consulta',     icon: Search },
    { id: 'programacao', label: 'Programação',  icon: CalendarDays },
    { id: 'rotas',       label: 'Rotas',        icon: Truck },
  ]

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 flex items-center justify-center shrink-0">
          <Navigation size={18} className="text-orange-500" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100">Rotas de Entrega</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Consulte qual rota atende um bairro/setor e em que dia e turno ela sai para entrega.
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              subTab === t.id
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'consulta' ? (
        <ConsultaTab routeById={routeById} clientCounts={clientCounts} />
      ) : subTab === 'programacao' ? (
        <ProgramacaoTab routes={routes} loading={loadingRoutes} />
      ) : (
        <RotasTab
          routes={routes}
          loading={loadingRoutes}
          clientCounts={clientCounts}
          onRouteSaved={() => { loadRoutes() }}
        />
      )}
    </div>
  )
}

// ─── Tab 1: Consulta (Lookup) ─────────────────────────────────────

function ConsultaTab({ routeById, clientCounts }: { routeById: Record<string, DeliveryRoute>; clientCounts: Record<string, number> }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DeliverySector[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const pattern = `%${q}%`
      const { data } = await supabase
        .from('crm_delivery_sectors')
        .select('id, setor, cidade, regiao, distancia_km, rota, route_id')
        .or(`setor.ilike.${pattern},cidade.ilike.${pattern},regiao.ilike.${pattern}`)
        .order('setor')
        .limit(100)
      setResults((data as DeliverySector[]) ?? [])
      setLoading(false)
      setSearched(true)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Digite o bairro, setor ou cidade..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-xs text-slate-400 px-1">Digite ao menos 2 caracteres para buscar.</p>
      )}

      {loading && (
        <div className="card p-6 text-center text-slate-400 text-sm">Buscando...</div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="card p-8 text-center">
          <MapPin size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="font-medium text-slate-600 dark:text-slate-300">Setor não encontrado</p>
          <p className="text-xs text-slate-400 mt-1">
            Verifique a grafia ou tente outro termo (bairro, setor ou cidade).
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="text-xs text-slate-400 px-1">
            {results.length} resultado{results.length !== 1 ? 's' : ''}
            {results.length === 100 ? '+ (refine a busca)' : ''}
          </p>
          <div className="space-y-2">
            {results.map(s => (
              <SectorResultCard
                key={s.id}
                sector={s}
                route={s.route_id ? routeById[s.route_id] : undefined}
                clientCount={s.route_id ? (clientCounts[s.route_id] || 0) : 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SectorResultCard({ sector, route, clientCount }: { sector: DeliverySector; route?: DeliveryRoute; clientCount: number }) {
  const summary = scheduleSummary(route?.schedule ?? null)

  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-bold text-slate-800 dark:text-slate-100">{sector.setor}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {sector.cidade && <span>{sector.cidade}</span>}
            {sector.regiao && <span className="text-slate-400 dark:text-slate-500">· {sector.regiao}</span>}
            {sector.distancia_km != null && (
              <span className="flex items-center gap-0.5 text-slate-400 dark:text-slate-500">
                <MapPin size={10} /> {sector.distancia_km} km da fábrica
              </span>
            )}
          </div>
        </div>

        {/* Route */}
        <div className="shrink-0">
          {route ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 text-xs font-bold text-orange-600 dark:text-orange-400">
              <Truck size={12} /> {route.name}
            </span>
          ) : sector.rota === 'ENCAIXES' ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400">
              Encaixe (sob demanda)
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-400">
              Sem rota definida
            </span>
          )}
        </div>
      </div>

      {/* Schedule of the matched route */}
      {route && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700">
          {summary.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Sai em</span>
              {summary.map(({ dia, turnos }) =>
                turnos.map(turno => (
                  <span key={dia + turno}
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${turnoBadgeClass(turno)}`}>
                    {DIA_ABREV[dia] ?? dia} · {TURNO_LABEL[turno] ?? turno}
                  </span>
                ))
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 italic">Sem programação semanal cadastrada para esta rota.</p>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Users size={11} /> {clientCount} cliente{clientCount !== 1 ? 's' : ''} cadastrado{clientCount !== 1 ? 's' : ''} nesta rota
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Programação (Weekly schedule) ─────────────────────────

function ProgramacaoTab({ routes, loading }: { routes: DeliveryRoute[]; loading: boolean }) {
  // Build: dia -> turno -> route names[]
  const grid = useMemo(() => {
    const g: Record<string, Record<string, string[]>> = {}
    for (const dia of DIAS_ORDEM) {
      g[dia] = {}
      for (const turno of TURNO_ORDEM) g[dia][turno] = []
    }
    for (const r of routes) {
      if (!r.schedule) continue
      const seen = new Set<string>()
      for (const e of r.schedule) {
        const key = `${e.dia}|${e.turno}|${r.name}`
        if (seen.has(key)) continue
        seen.add(key)
        if (g[e.dia] && g[e.dia][e.turno]) g[e.dia][e.turno].push(r.name)
      }
    }
    return g
  }, [routes])

  if (loading) return <div className="card p-8 text-center text-slate-400 text-sm">Carregando...</div>

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        {TURNO_ORDEM.map(t => (
          <span key={t} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className={`w-2.5 h-2.5 rounded-full ${TURNO_DOT[t]}`} />
            {TURNO_LABEL[t]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {DIAS_ORDEM.map(dia => {
          const hasAny = TURNO_ORDEM.some(t => grid[dia][t].length > 0)
          return (
            <div key={dia} className="card p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CalendarDays size={13} /> {dia}
              </h3>
              {!hasAny ? (
                <p className="text-[11px] text-slate-400 italic">Sem saídas programadas.</p>
              ) : (
                <div className="space-y-2.5">
                  {TURNO_ORDEM.filter(t => grid[dia][t].length > 0).map(turno => (
                    <div key={turno}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2 h-2 rounded-full ${TURNO_DOT[turno]}`} />
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {TURNO_LABEL[turno]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {grid[dia][turno].map(name => (
                          <span key={name}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${turnoBadgeClass(turno)}`}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab 3: Rotas (Route details) ────────────────────────────────

function RotasTab({ routes, loading, clientCounts, onRouteSaved }: {
  routes: DeliveryRoute[]
  loading: boolean
  clientCounts: Record<string, number>
  onRouteSaved: () => void
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  async function loadSectorCounts() {
    const { data } = await supabase
      .from('crm_delivery_sectors')
      .select('route_id')
      .not('route_id', 'is', null)
    const c: Record<string, number> = {}
    for (const row of (data as { route_id: string }[]) ?? []) {
      c[row.route_id] = (c[row.route_id] || 0) + 1
    }
    setCounts(c)
  }

  useEffect(() => { loadSectorCounts() }, [])

  if (loading) return <div className="card p-8 text-center text-slate-400 text-sm">Carregando...</div>

  // Routes sorted by sector count desc
  const ordered = [...routes].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))

  return (
    <div className="space-y-2">
      {ordered.map(r => (
        <RouteDetailCard
          key={r.id}
          route={r}
          sectorCount={counts[r.id] || 0}
          clientCount={clientCounts[r.id] || 0}
          expanded={expanded === r.id}
          editing={editing === r.id}
          onToggle={() => { setExpanded(expanded === r.id ? null : r.id); setEditing(null) }}
          onToggleEdit={() => { setEditing(editing === r.id ? null : r.id); if (editing !== r.id) setExpanded(null) }}
          onRouteSaved={() => { onRouteSaved(); setEditing(null) }}
          onSectorsChanged={loadSectorCounts}
        />
      ))}
    </div>
  )
}

function RouteDetailCard({ route, sectorCount, clientCount, expanded, editing, onToggle, onToggleEdit, onRouteSaved, onSectorsChanged }: {
  route: DeliveryRoute
  sectorCount: number
  clientCount: number
  expanded: boolean
  editing: boolean
  onToggle: () => void
  onToggleEdit: () => void
  onRouteSaved: () => void
  onSectorsChanged: () => void
}) {
  const { isAdmin } = useAuth()
  const [showClients, setShowClients] = useState(false)
  const summary = scheduleSummary(route.schedule)
  const dayBadges = summary.map(s => DIA_ABREV[s.dia] ?? s.dia)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <button onClick={onToggle} className="flex-1 min-w-0 flex items-start gap-3 text-left">
          <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 flex items-center justify-center shrink-0">
            <Truck size={16} className="text-orange-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 dark:text-slate-100">{route.name}</span>
              {dayBadges.length > 0 && dayBadges.map((d, i) => (
                <span key={d + i} className="text-[10px] font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full border border-orange-100 dark:border-orange-800">
                  {d}
                </span>
              ))}
            </div>

            {/* Schedule summary */}
            {summary.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {summary.map(({ dia, turnos }) =>
                  turnos.map(turno => (
                    <span key={dia + turno}
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${turnoBadgeClass(turno)}`}>
                      {DIA_ABREV[dia] ?? dia} · {TURNO_LABEL[turno] ?? turno}
                    </span>
                  ))
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic mt-1">Sem programação semanal cadastrada.</p>
            )}
          </div>
        </button>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <button
                onClick={onToggleEdit}
                title="Editar rota"
                className={`p-1.5 rounded-lg border transition-colors ${
                  editing
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'border-slate-200 dark:border-slate-600 text-slate-400 hover:text-orange-500 hover:border-orange-300'
                }`}>
                <Pencil size={13} />
              </button>
            )}
            <button onClick={onToggle} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className="text-[10px] font-bold whitespace-nowrap">
                {sectorCount} setor{sectorCount !== 1 ? 'es' : ''}
              </span>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
          {/* Client count badge — clickable */}
          <button
            onClick={() => setShowClients(v => !v)}
            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
              clientCount > 0
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800 hover:bg-orange-100'
                : 'bg-slate-50 dark:bg-slate-700/50 text-slate-400 border-slate-100 dark:border-slate-600'
            }`}>
            <Users size={11} /> {clientCount} cliente{clientCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {showClients && <RouteClientList routeId={route.id} total={clientCount} />}
      {expanded && !editing && <RouteSectorList routeId={route.id} total={sectorCount} />}
      {editing && (
        <RouteEditPanel
          route={route}
          onRouteSaved={onRouteSaved}
          onSectorsChanged={onSectorsChanged}
        />
      )}
    </div>
  )
}

function RouteClientList({ routeId, total }: { routeId: string; total: number }) {
  const [clients, setClients] = useState<{ id: string; nome: string; setor: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('crm_clients')
      .select('id, nome, setor')
      .eq('route_id', routeId)
      .order('nome')
      .limit(50)
      .then(({ data }) => {
        if (!active) return
        setClients((data as { id: string; nome: string; setor: string | null }[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [routeId])

  const remaining = total - clients.length

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 bg-orange-50/40 dark:bg-orange-900/5 px-4 py-3">
      {loading ? (
        <p className="text-xs text-slate-400">Carregando clientes...</p>
      ) : clients.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Nenhum cliente vinculado a esta rota.</p>
      ) : (
        <>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Users size={11} /> Clientes da rota
          </p>
          <div className="flex flex-wrap gap-1.5">
            {clients.map(c => (
              <span key={c.id}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                title={c.setor ?? undefined}>
                {c.nome}
              </span>
            ))}
          </div>
          {remaining > 0 && (
            <p className="text-[11px] text-slate-400 mt-2">+ {remaining} cliente{remaining !== 1 ? 's' : ''} a mais</p>
          )}
        </>
      )}
    </div>
  )
}

function RouteSectorList({ routeId, total }: { routeId: string; total: number }) {
  const [sectors, setSectors] = useState<DeliverySector[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('crm_delivery_sectors')
      .select('id, setor, cidade, regiao, distancia_km, rota, route_id')
      .eq('route_id', routeId)
      .order('setor')
      .limit(20)
      .then(({ data }) => {
        if (!active) return
        setSectors((data as DeliverySector[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [routeId])

  const remaining = total - sectors.length

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
      {loading ? (
        <p className="text-xs text-slate-400">Carregando setores...</p>
      ) : sectors.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Nenhum setor vinculado a esta rota.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {sectors.map(s => (
              <span key={s.id}
                className="text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                title={[s.cidade, s.regiao].filter(Boolean).join(' · ')}>
                {s.setor}
              </span>
            ))}
          </div>
          {remaining > 0 && (
            <p className="text-[11px] text-slate-400 mt-2">+ {remaining} setor{remaining !== 1 ? 'es' : ''} a mais</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Edit panel (admin) ───────────────────────────────────────────

function RouteEditPanel({ route, onRouteSaved, onSectorsChanged }: {
  route: DeliveryRoute
  onRouteSaved: () => void
  onSectorsChanged: () => void
}) {
  // Schedule matrix: Set of "DIA|TURNO"
  const [cells, setCells] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const e of route.schedule ?? []) s.add(`${e.dia}|${e.turno}`)
    return s
  })
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleErr, setScheduleErr] = useState<string | null>(null)

  function toggleCell(dia: string, turno: string) {
    const key = `${dia}|${turno}`
    setCells(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function saveSchedule() {
    setSavingSchedule(true)
    setScheduleErr(null)
    const schedule: ScheduleEntry[] = []
    const daysSet = new Set<string>()
    for (const dia of DIAS_ORDEM) {
      for (const turno of TURNO_ORDEM) {
        if (cells.has(`${dia}|${turno}`)) {
          schedule.push({ dia, turno })
          daysSet.add(dia)
        }
      }
    }
    const days_of_week = DIAS_ORDEM.filter(d => daysSet.has(d))
    const { error } = await supabase
      .from('crm_routes')
      .update({ schedule, days_of_week })
      .eq('id', route.id)
    setSavingSchedule(false)
    if (error) { setScheduleErr(error.message); return }
    onRouteSaved()
  }

  return (
    <div className="border-t border-orange-100 dark:border-orange-900/40 bg-orange-50/30 dark:bg-orange-900/5 p-4 space-y-5">
      {/* ── Schedule editor ── */}
      <div>
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <CalendarDays size={12} /> Programação Semanal
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={TH}>Dia</th>
                {TURNO_ORDEM.map(t => <th key={t} className={`${TH} text-center`}>{TURNO_LABEL[t]}</th>)}
              </tr>
            </thead>
            <tbody>
              {DIAS_ORDEM.map(dia => (
                <tr key={dia}>
                  <td className={`${TD} font-bold text-slate-600 dark:text-slate-300`}>{DIA_ABREV[dia] ?? dia}</td>
                  {TURNO_ORDEM.map(turno => {
                    const on = cells.has(`${dia}|${turno}`)
                    return (
                      <td key={turno} className={`${TD} text-center`}>
                        <button
                          type="button"
                          onClick={() => toggleCell(dia, turno)}
                          className={`w-7 h-7 rounded-lg border-2 transition-all inline-flex items-center justify-center ${
                            on
                              ? 'bg-orange-500 border-orange-500 text-white'
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-transparent hover:border-orange-300'
                          }`}>
                          {on ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scheduleErr && <p className="text-[11px] text-red-500 mt-1">{scheduleErr}</p>}
        <div className="flex justify-end mt-2">
          <button onClick={saveSchedule} disabled={savingSchedule} className="btn-primary gap-1.5 text-xs py-1.5 px-3">
            <Save size={13} /> {savingSchedule ? 'Salvando...' : 'Salvar programação'}
          </button>
        </div>
      </div>

      {/* ── Sectors editor ── */}
      <RouteSectorEditor route={route} onSectorsChanged={onSectorsChanged} />
    </div>
  )
}

function RouteSectorEditor({ route, onSectorsChanged }: {
  route: DeliveryRoute
  onSectorsChanged: () => void
}) {
  const [sectors, setSectors] = useState<DeliverySector[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // new sector form
  const [nSetor, setNSetor] = useState('')
  const [nCidade, setNCidade] = useState('')
  const [nRegiao, setNRegiao] = useState('')
  const [nDist, setNDist] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, count } = await supabase
      .from('crm_delivery_sectors')
      .select('id, setor, cidade, regiao, distancia_km, rota, route_id', { count: 'exact' })
      .eq('route_id', route.id)
      .order('setor')
      .limit(50)
    setSectors((data as DeliverySector[]) ?? [])
    setTotal(count ?? (data?.length ?? 0))
    setLoading(false)
  }

  useEffect(() => { load() }, [route.id])

  async function addSector() {
    if (!nSetor.trim()) { setErr('Informe o nome do setor'); return }
    setAdding(true)
    setErr(null)
    const dist = nDist.trim() ? Number(nDist.replace(',', '.')) : null
    const { error } = await supabase.from('crm_delivery_sectors').insert({
      setor: nSetor.trim(),
      cidade: nCidade.trim() || null,
      regiao: nRegiao.trim() || null,
      distancia_km: dist != null && !Number.isNaN(dist) ? dist : null,
      rota: route.name,
      route_id: route.id,
    })
    setAdding(false)
    if (error) { setErr(error.message); return }
    setNSetor(''); setNCidade(''); setNRegiao(''); setNDist('')
    await load()
    onSectorsChanged()
  }

  async function deleteSector(id: number) {
    const { error } = await supabase.from('crm_delivery_sectors').delete().eq('id', id)
    if (error) { setErr(error.message); return }
    await load()
    onSectorsChanged()
  }

  async function updateField(id: number, field: 'setor' | 'cidade' | 'regiao' | 'distancia_km', raw: string) {
    let value: string | number | null = raw.trim() || null
    if (field === 'distancia_km') {
      const n = raw.trim() ? Number(raw.replace(',', '.')) : null
      value = n != null && !Number.isNaN(n) ? n : null
    }
    // optimistic local update
    setSectors(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    const { error } = await supabase.from('crm_delivery_sectors').update({ [field]: value }).eq('id', id)
    if (error) setErr(error.message)
  }

  const remaining = total - sectors.length

  return (
    <div>
      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <MapPin size={12} /> Setores da Rota
        {loading && <span className="text-slate-400 normal-case font-medium">— Carregando setores...</span>}
        {!loading && total > 0 && <span className="text-slate-400 normal-case font-medium">({total})</span>}
      </h4>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className={TH}>Setor</th>
              <th className={TH}>Cidade</th>
              <th className={TH}>Região</th>
              <th className={`${TH} text-right`}>Dist. (km)</th>
              <th className={`${TH} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            {!loading && sectors.length === 0 && (
              <tr><td colSpan={5} className={`${TD} text-center text-slate-400 italic`}>Nenhum setor cadastrado nesta rota.</td></tr>
            )}
            {sectors.map(s => (
              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <td className={TD}>
                  <input className="input py-1 text-xs h-auto" defaultValue={s.setor}
                    onBlur={e => { if (e.target.value.trim() !== s.setor) updateField(s.id, 'setor', e.target.value) }} />
                </td>
                <td className={TD}>
                  <input className="input py-1 text-xs h-auto" defaultValue={s.cidade ?? ''}
                    onBlur={e => { if ((e.target.value.trim() || null) !== (s.cidade ?? null)) updateField(s.id, 'cidade', e.target.value) }} />
                </td>
                <td className={TD}>
                  <input className="input py-1 text-xs h-auto" defaultValue={s.regiao ?? ''}
                    onBlur={e => { if ((e.target.value.trim() || null) !== (s.regiao ?? null)) updateField(s.id, 'regiao', e.target.value) }} />
                </td>
                <td className={`${TD} text-right`}>
                  <input className="input py-1 text-xs h-auto text-right" inputMode="decimal" defaultValue={s.distancia_km ?? ''}
                    onBlur={e => updateField(s.id, 'distancia_km', e.target.value)} />
                </td>
                <td className={`${TD} text-center`}>
                  <button onClick={() => deleteSector(s.id)} title="Remover setor"
                    className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {/* Add row */}
            <tr className="bg-orange-50/50 dark:bg-orange-900/10">
              <td className={TD}>
                <input className="input py-1 text-xs h-auto" placeholder="Novo setor" value={nSetor} onChange={e => setNSetor(e.target.value)} />
              </td>
              <td className={TD}>
                <input className="input py-1 text-xs h-auto" placeholder="Cidade" value={nCidade} onChange={e => setNCidade(e.target.value)} />
              </td>
              <td className={TD}>
                <input className="input py-1 text-xs h-auto" placeholder="Região" value={nRegiao} onChange={e => setNRegiao(e.target.value)} />
              </td>
              <td className={`${TD} text-right`}>
                <input className="input py-1 text-xs h-auto text-right" inputMode="decimal" placeholder="km" value={nDist} onChange={e => setNDist(e.target.value)} />
              </td>
              <td className={`${TD} text-center`}>
                <button onClick={addSector} disabled={adding} title="Adicionar setor"
                  className="p-1 rounded-md text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30">
                  <Plus size={14} />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {remaining > 0 && (
        <p className="text-[11px] text-slate-400 mt-1.5">Mostrando 50 de {total} setores. Refine pela busca na aba Consulta para editar os demais.</p>
      )}
      <div className="flex items-center justify-between mt-2">
        {err ? <p className="text-[11px] text-red-500">{err}</p> : <span />}
        <button onClick={addSector} disabled={adding} className="btn-secondary gap-1.5 text-xs py-1.5 px-3">
          <Plus size={13} /> {adding ? 'Adicionando...' : 'Adicionar setor'}
        </button>
      </div>
    </div>
  )
}
