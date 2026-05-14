import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, ShoppingBag, AlertTriangle, CheckCircle2, Bike, ChevronLeft, ChevronRight, Package, Search, CalendarClock, CloudDownload } from 'lucide-react'
import { format, addDays, parseISO, isWeekend, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { VarejoPedido } from '../types'
import PedidoModal from '../components/PedidoModal'

type Tab = 'fila' | 'dashboard' | 'delivery' | 'amanha' | 'historico'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextBusinessDay(dateStr: string): string {
  let d = addDays(parseISO(dateStr), 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return format(d, 'yyyy-MM-dd')
}

function prevDay(dateStr: string): string {
  return format(addDays(parseISO(dateStr), -1), 'yyyy-MM-dd')
}

function getTurnoOrder(): string[] {
  const h = new Date().getHours()
  if (h >= 6  && h < 12) return ['MANHÃ', 'TARDE', 'NOITE']
  if (h >= 12 && h < 18) return ['TARDE', 'NOITE', 'MANHÃ']
  return ['NOITE', 'TARDE', 'MANHÃ']
}

function flagPriority(f: string | null): number {
  if (f === '⚠️') return 0
  if (!f || f === '') return 1
  return 2 // ✅
}

function rotaSort(r: string | null): number {
  if (!r) return 9999
  const m = r.match(/\d+/)
  return m ? parseInt(m[0]) : 999
}

function sortForDashboard(orders: VarejoPedido[]): VarejoPedido[] {
  return [...orders].sort((a, b) => {
    // Rota numericamente
    const rd = rotaSort(a.rota_definida || a.sugestao_rota) - rotaSort(b.rota_definida || b.sugestao_rota)
    if (rd !== 0) return rd
    // ⚠️ primeiro
    const fd = flagPriority(a.flag_restricao) - flagPriority(b.flag_restricao)
    if (fd !== 0) return fd
    // Com entregador antes dos sem entregador
    const ed = (a.entregador ? 0 : 1) - (b.entregador ? 0 : 1)
    if (ed !== 0) return ed
    // Bairro alfabético
    return (a.bairro ?? '').localeCompare(b.bairro ?? '', 'pt-BR')
  })
}

function borderColor(p: VarejoPedido): string {
  if (p.status_icon === '❌') return 'border-l-slate-300 opacity-50'
  if (p.status_icon === '✅') return 'border-l-green-400'
  if (p.status_icon === '🛵') return 'border-l-blue-400'
  if (p.flag_restricao === '⚠️') return 'border-l-red-400'
  if (!p.entregador) return 'border-l-amber-400'
  return 'border-l-slate-200 dark:border-l-slate-600'
}

function brl(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmpresaBadge({ empresa }: { empresa: string | null }) {
  if (!empresa) return null
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
      empresa === 'LUMAR'
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
    }`}>
      {empresa}
    </span>
  )
}

function OrigemBadge({ origem }: { origem: string }) {
  const styles: Record<string, string> = {
    'IFOOD':        'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    '99FOOD':       'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    'CARDAPIO WEB': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  }
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${styles[origem] ?? 'bg-slate-100 text-slate-500'}`}>
      {origem === 'CARDAPIO WEB' ? 'C.WEB' : origem}
    </span>
  )
}

function PedidoCard({ pedido, onClick }: { pedido: VarejoPedido; onClick: () => void }) {
  const rota = pedido.rota_definida || pedido.sugestao_rota
  return (
    <button
      onClick={onClick}
      className={`w-full text-left card border-l-4 ${borderColor(pedido)} px-3 py-2.5 hover:shadow-md active:scale-[.99] transition-all`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0">{pedido.status_icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">#{pedido.num_pedido}</span>
            <EmpresaBadge empresa={pedido.empresa} />
            <OrigemBadge origem={pedido.origem} />
            {pedido.order_timing === 'scheduled' && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                <CalendarClock size={9} /> AGENDADO
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">{pedido.cliente ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{pedido.bairro ?? '—'}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {rota && (
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{rota}</span>
            )}
            {pedido.entregador && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">👤 {pedido.entregador}</span>
            )}
            {pedido.valor_liquido != null && (
              <span className="text-[11px] text-slate-400">{brl(pedido.valor_liquido)}</span>
            )}
          </div>
          {pedido.restricao && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle size={9} className="shrink-0" />
              <span className="line-clamp-1">{pedido.restricao}</span>
            </p>
          )}
        </div>
        <span className="text-[10px] text-slate-300 dark:text-slate-600 mt-1 shrink-0">›</span>
      </div>
    </button>
  )
}

function TurnoGroup({ turno, pedidos, onEdit }: {
  turno: string
  pedidos: VarejoPedido[]
  onEdit: (p: VarejoPedido) => void
}) {
  const sorted = useMemo(() => sortForDashboard(pedidos), [pedidos])
  const entregues = sorted.filter(p => p.status_icon === '✅').length
  const emRota    = sorted.filter(p => p.status_icon === '🛵').length
  const restantes = sorted.length - entregues

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white dark:bg-slate-900 py-1 z-10">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{turno}</span>
        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full font-bold">{sorted.length}</span>
        {emRota > 0 && <span className="text-[10px] text-blue-600 font-bold">🛵 {emRota}</span>}
        {entregues > 0 && <span className="text-[10px] text-green-600 font-bold">✅ {entregues}/{sorted.length}</span>}
        {restantes < sorted.length && <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${(entregues / sorted.length) * 100}%` }} /></div>}
      </div>
      <div className="space-y-1.5">
        {sorted.map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
      </div>
    </div>
  )
}

function DashboardTab({ pedidos, onEdit }: { pedidos: VarejoPedido[]; onEdit: (p: VarejoPedido) => void }) {
  const turnoOrder = getTurnoOrder()

  // Separate delivery apps from regular orders
  const regular = pedidos.filter(p => p.origem === 'CARDAPIO WEB')
  const delivery = pedidos.filter(p => p.origem === 'IFOOD' || p.origem === '99FOOD')

  // Group by turno
  const byTurno: Record<string, VarejoPedido[]> = {}
  for (const p of regular) {
    const t = p.turno ?? '_SEM_TURNO'
    byTurno[t] = byTurno[t] ? [...byTurno[t], p] : [p]
  }

  const groups = [
    ...turnoOrder.filter(t => byTurno[t]?.length),
    ...Object.keys(byTurno).filter(t => !turnoOrder.includes(t) && t !== '_SEM_TURNO'),
    ...(byTurno['_SEM_TURNO']?.length ? ['_SEM_TURNO'] : []),
  ]

  if (regular.length === 0 && delivery.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-400">
        <Package size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nenhum pedido para esta data.</p>
        <p className="text-xs mt-1">Pedidos do Cardápio Web aparecerão aqui quando chegarem.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map(turno => (
        <TurnoGroup
          key={turno}
          turno={turno === '_SEM_TURNO' ? '⏳ Turno não definido' : turno}
          pedidos={byTurno[turno]}
          onEdit={onEdit}
        />
      ))}

      {delivery.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold text-slate-400">Apps de Delivery</span>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{delivery.length}</span>
          </div>
          <div className="space-y-1.5">
            {delivery.map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function FilaTab({ pedidos, onEdit }: { pedidos: VarejoPedido[]; onEdit: (p: VarejoPedido) => void }) {
  if (pedidos.length === 0) {
    return (
      <div className="card p-10 text-center">
        <CheckCircle2 size={32} className="mx-auto mb-3 text-green-400 opacity-60" />
        <p className="text-sm text-slate-400">Ótimo! Nenhum pedido aguardando definição.</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
        <AlertTriangle size={13} />
        {pedidos.length} pedido{pedidos.length > 1 ? 's' : ''} sem data/turno definidos — clique para preencher
      </p>
      <div className="space-y-1.5">
        {pedidos.map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
      </div>
    </div>
  )
}

function DeliveryTab({ pedidos }: { pedidos: VarejoPedido[] }) {
  const ifood   = pedidos.filter(p => p.origem === 'IFOOD')
  const food99  = pedidos.filter(p => p.origem === '99FOOD')

  if (pedidos.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-400">
        <Bike size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nenhum pedido de delivery hoje.</p>
      </div>
    )
  }

  const Section = ({ title, items, color }: { title: string; items: VarejoPedido[]; color: string }) => (
    items.length > 0 ? (
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${color}`}>{title} · {items.length}</p>
        <div className="space-y-1.5">
          {items.map(p => (
            <div key={p.id} className={`card border-l-4 ${p.origem === 'IFOOD' ? 'border-l-red-400' : 'border-l-yellow-400'} px-3 py-2`}>
              <div className="flex items-center gap-2">
                <span>{p.status_icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">#{p.num_pedido}</span>
                    <span className="text-xs text-slate-500 truncate">{p.cliente}</span>
                  </div>
                  <p className="text-xs text-slate-400">{p.bairro} · {brl(p.valor_liquido)}</p>
                  {p.restricao && <p className="text-[11px] text-amber-600 mt-0.5 line-clamp-1">{p.restricao}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null
  )

  return (
    <div className="space-y-5">
      <Section title="iFood" items={ifood} color="text-red-600" />
      <Section title="99Food" items={food99} color="text-yellow-600" />
    </div>
  )
}

function HistoricoTab({ onEdit }: { onEdit: (p: VarejoPedido) => void }) {
  const [search, setSearch]   = useState('')
  const [from,   setFrom]     = useState(() => format(subDays(new Date(), 60), 'yyyy-MM-dd'))
  const [to,     setTo]       = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [data,   setData]     = useState<VarejoPedido[]>([])
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('varejo_pedidos')
      .select('*')
      .gte('data_entrega', from)
      .lte('data_entrega', to)
      .order('data_entrega', { ascending: false })
      .order('created_at',   { ascending: false })
      .limit(500)

    if (search.trim()) {
      const s = search.trim()
      q = q.or(`num_pedido.ilike.%${s}%,cliente.ilike.%${s}%,bairro.ilike.%${s}%`)
    }

    const { data: rows } = await q
    setData(rows ?? [])
    setLoading(false)
  }, [search, from, to])

  useEffect(() => { run() }, [run])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 text-sm"
            placeholder="Pedido, cliente ou bairro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <input type="date" className="input text-sm w-auto" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input text-sm w-auto" value={to}   onChange={e => setTo(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Buscando...</div>
      ) : data.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <Package size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-400">{data.length} pedido{data.length !== 1 ? 's' : ''}</p>
          {data.map(p => (
            <div key={p.id} className="relative">
              {p.data_entrega && (
                <span className="absolute right-9 top-2.5 text-[10px] text-slate-400">
                  {format(parseISO(p.data_entrega), 'dd/MM/yy')}
                </span>
              )}
              <PedidoCard pedido={p} onClick={() => onEdit(p)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function VarejoPage() {
  const [pedidos, setPedidos] = useState<VarejoPedido[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [tab, setTab] = useState<Tab>('fila')
  const [editPedido, setEditPedido] = useState<VarejoPedido | undefined>(undefined)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const webhookUrl = typeof window !== 'undefined' ? localStorage.getItem('crm_webhook_url') ?? '' : ''

  const tomorrow = useMemo(() => nextBusinessDay(selectedDate), [selectedDate])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: dated }, { data: unconf }] = await Promise.all([
      supabase
        .from('varejo_pedidos')
        .select('*')
        .in('data_entrega', [selectedDate, tomorrow])
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('varejo_pedidos')
        .select('*')
        .is('data_entrega', null)
        .neq('status_icon', '❌')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    setPedidos([...(dated ?? []), ...(unconf ?? [])])
    setLoading(false)
  }, [selectedDate, tomorrow])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('varejo_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'varejo_pedidos' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // ── Derivados ─────────────────────────────────────────────────────
  const today = pedidos.filter(p => p.data_entrega === selectedDate)
  const todayCW = today.filter(p => p.origem === 'CARDAPIO WEB')
  const todayDelivery = pedidos.filter(p =>
    p.data_entrega === selectedDate && (p.origem === 'IFOOD' || p.origem === '99FOOD')
  )
  const fila = pedidos.filter(p =>
    (p.data_entrega === null || !p.turno) &&
    p.origem === 'CARDAPIO WEB' &&
    p.status_icon !== '❌'
  )
  const amanha = pedidos.filter(p => p.data_entrega === tomorrow)

  const stats = useMemo(() => {
    const base = todayCW
    return {
      total:     base.length,
      pendentes: base.filter(p => p.status_icon === '⚠️').length,
      emRota:    base.filter(p => p.status_icon === '🛵').length,
      entregues: base.filter(p => p.status_icon === '✅').length,
    }
  }, [todayCW])

  const TABS = [
    { id: 'fila'      as Tab, label: 'Fila',           count: fila.length,         alert: fila.length > 0 },
    { id: 'dashboard' as Tab, label: 'Hoje',           count: today.length },
    { id: 'delivery'  as Tab, label: 'iFood / 99Food', count: todayDelivery.length },
    { id: 'amanha'    as Tab, label: 'Amanhã',         count: amanha.length },
    { id: 'historico' as Tab, label: 'Histórico',      count: 0 },
  ]

  const displayDate = format(parseISO(selectedDate), "EEEE, dd/MM", { locale: ptBR })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ShoppingBag size={20} className="text-orange-500" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Varejo</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedDate(prevDay(selectedDate))} className="btn-ghost p-1.5">
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            className="input py-1.5 text-sm w-auto"
            value={selectedDate}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
          />
          <button onClick={() => setSelectedDate(nextBusinessDay(selectedDate))} className="btn-ghost p-1.5">
            <ChevronRight size={16} />
          </button>
          <button onClick={load} disabled={loading} className="btn-ghost p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {webhookUrl && (
            <button
              onClick={async () => {
                setSyncing(true)
                setSyncError(null)
                try {
                  const res = await fetch(`${webhookUrl}/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                  })
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                  setTimeout(load, 3000)
                } catch (e: unknown) {
                  setSyncError(e instanceof Error ? e.message : 'Erro desconhecido')
                  setTimeout(() => setSyncError(null), 5000)
                } finally { setSyncing(false) }
              }}
              disabled={syncing}
              className={`btn-ghost p-2 ${syncError ? 'text-red-500' : 'text-purple-500'}`}
              title={syncError ?? 'Sincronizar com Planilha'}
            >
              <CloudDownload size={16} className={syncing ? 'animate-pulse' : ''} />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 capitalize -mt-2">{displayDate}</p>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <StatCard label="Total" value={stats.total} color="text-slate-700 dark:text-slate-200" />
          <StatCard label="Aguardando" value={stats.pendentes} color="text-amber-600" />
          <StatCard label="Em rota" value={stats.emRota} color="text-blue-600" />
          <StatCard label="Entregues" value={stats.entregues} color="text-green-600" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                (t as any).alert
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : tab === t.id
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'historico' ? (
        <HistoricoTab onEdit={setEditPedido} />
      ) : loading ? (
        <div className="flex justify-center py-12 text-slate-400 text-sm">Carregando...</div>
      ) : tab === 'dashboard' ? (
        <DashboardTab pedidos={today} onEdit={setEditPedido} />
      ) : tab === 'fila' ? (
        <FilaTab pedidos={fila} onEdit={setEditPedido} />
      ) : tab === 'delivery' ? (
        <DeliveryTab pedidos={todayDelivery} />
      ) : (
        <DashboardTab pedidos={amanha} onEdit={setEditPedido} />
      )}

      {editPedido && (
        <PedidoModal pedido={editPedido} onClose={() => setEditPedido(undefined)} onSaved={load} />
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card px-3 py-2.5 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
