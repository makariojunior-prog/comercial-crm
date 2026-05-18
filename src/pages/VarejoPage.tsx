import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, ShoppingBag, AlertTriangle, CheckCircle2, Bike, ChevronLeft, ChevronRight, Package, Search, CalendarClock, CloudDownload } from 'lucide-react'
import { format, addDays, parseISO, isWeekend, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { VarejoPedido } from '../types'
import PedidoModal from '../components/PedidoModal'
import PosVendaTab from '../components/PosVendaTab'

type Tab = 'fila' | 'dashboard' | 'delivery' | 'amanha' | 'historico' | 'posvendas' | 'retirada'

const RETIRADA_VALS = ['RETIRADA']
const isRetirada = (p: VarejoPedido) => RETIRADA_VALS.includes(p.entregador ?? '')

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
  // SR (Sem Restrição de Horário) always appears last — pode ir a qualquer hora
  if (h >= 6  && h < 12) return ['MANHÃ', 'TARDE', 'NOITE', 'SR']
  if (h >= 12 && h < 18) return ['TARDE', 'NOITE', 'MANHÃ', 'SR']
  return ['NOITE', 'TARDE', 'MANHÃ', 'SR']
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

function statusPriority(s: string | null): number {
  if (s === '⚠️') return 0
  if (s === '🛵') return 1
  if (s === '✅') return 2
  if (s === '❌') return 3
  return 4
}

function sortForDashboard(orders: VarejoPedido[]): VarejoPedido[] {
  return [...orders].sort((a, b) => {
    // Primary: Rota numericamente (rota_definida ou sugestao_rota)
    const rd = rotaSort(a.rota_definida || a.sugestao_rota) - rotaSort(b.rota_definida || b.sugestao_rota)
    if (rd !== 0) return rd
    // Secondary: Entregador alfabético (null/missing → last via sentinel)
    const ae = a.entregador ?? '￿'
    const be = b.entregador ?? '￿'
    const ed = ae.localeCompare(be, 'pt-BR')
    if (ed !== 0) return ed
    // Tertiary: Status icon priority (⚠️=0, 🛵=1, ✅=2, ❌=3, null=4)
    const sd = statusPriority(a.status_icon) - statusPriority(b.status_icon)
    if (sd !== 0) return sd
    // Quaternary: Flag restrição priority (⚠️ primeiro)
    const fd = flagPriority(a.flag_restricao) - flagPriority(b.flag_restricao)
    if (fd !== 0) return fd
    // Final: Bairro alfabético
    return (a.bairro ?? '').localeCompare(b.bairro ?? '', 'pt-BR')
  })
}

function borderColor(p: VarejoPedido): string {
  if (p.status_icon === '❌') return 'border-l-slate-300 opacity-50'
  if (p.status_icon === '✅') return 'border-l-green-400'
  if (p.status_icon === '🛵') return 'border-l-blue-400'
  if (p.flag_restricao === '⚠️' || p.restricao) return 'border-l-red-500'
  if (!p.entregador) return 'border-l-amber-400'
  return 'border-l-slate-200 dark:border-l-slate-600'
}

const TURNO_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  'MANHÃ':  { icon: '🌅', label: 'Manhã',              color: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-300 dark:border-amber-700'  },
  'TARDE':  { icon: '☀️', label: 'Tarde',              color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20',  border: 'border-orange-300 dark:border-orange-700' },
  'NOITE':  { icon: '🌙', label: 'Noite',              color: 'text-indigo-700 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20',  border: 'border-indigo-300 dark:border-indigo-700' },
  'SR':     { icon: '🕐', label: 'SR — Sem Restrição', color: 'text-slate-600 dark:text-slate-300',   bg: 'bg-slate-100 dark:bg-slate-800/60',   border: 'border-slate-300 dark:border-slate-600'   },
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
              <span className="text-[11px] text-slate-500 dark:text-slate-400">🛵 {pedido.entregador}</span>
            )}
            {pedido.atendente && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">📞 {pedido.atendente}</span>
            )}
            {pedido.valor_liquido != null && (
              <span className="text-[11px] text-slate-400">{brl(pedido.valor_liquido)}</span>
            )}
          </div>
          {pedido.restricao && (
            <div className="mt-1.5 flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-1">
              <AlertTriangle size={10} className="text-red-500 dark:text-red-400 shrink-0" />
              <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 line-clamp-1">{pedido.restricao}</span>
            </div>
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

  const cfg = TURNO_CONFIG[turno]
  const displayLabel = cfg?.label ?? turno

  // Build consecutive groups by entregador
  const groups: { entregador: string | null; items: VarejoPedido[] }[] = []
  for (const p of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.entregador === (p.entregador ?? null)) {
      last.items.push(p)
    } else {
      groups.push({ entregador: p.entregador ?? null, items: [p] })
    }
  }

  const showDividers = groups.length > 1

  return (
    <div className={`rounded-xl border ${cfg?.border ?? 'border-slate-200 dark:border-slate-700'} overflow-hidden`}>
      {/* Colored section header */}
      <div className={`flex items-center gap-2 px-3 py-2 sticky top-0 z-10 ${cfg?.bg ?? 'bg-slate-50 dark:bg-slate-800'} border-b ${cfg?.border ?? 'border-slate-200 dark:border-slate-700'}`}>
        {cfg?.icon && <span className="text-base shrink-0">{cfg.icon}</span>}
        <span className={`text-sm font-bold ${cfg?.color ?? 'text-slate-700 dark:text-slate-200'}`}>{displayLabel}</span>
        <span className="text-[10px] bg-white/70 dark:bg-black/20 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full font-bold">{sorted.length}</span>
        {emRota > 0 && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">🛵 {emRota}</span>}
        {entregues > 0 && <span className="text-[10px] text-green-600 dark:text-green-400 font-bold">✅ {entregues}/{sorted.length}</span>}
        {restantes < sorted.length && (
          <div className="flex-1 h-1.5 bg-white/40 dark:bg-black/20 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${(entregues / sorted.length) * 100}%` }} />
          </div>
        )}
      </div>
      {/* Orders */}
      <div className="p-2 space-y-1.5">
        {groups.map((g, gi) => (
          <div key={`${g.entregador ?? '_none_'}-${gi}`} className="space-y-1.5">
            {showDividers && (
              <div className="flex items-center gap-2 my-1.5">
                <div className="h-px bg-slate-100 dark:bg-slate-700 flex-1" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                  {g.entregador ? `👤 ${g.entregador} · ${g.items.length}` : `⏳ Sem entregador · ${g.items.length}`}
                </span>
                <div className="h-px bg-slate-100 dark:bg-slate-700 flex-1" />
              </div>
            )}
            {g.items.map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
          </div>
        ))}
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
        {pedidos.length} pedido{pedidos.length > 1 ? 's' : ''} aguardando definição de turno — clique para preencher
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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [from,   setFrom]     = useState(() => format(subDays(new Date(), 540), 'yyyy-MM-dd'))
  const [to,     setTo]       = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [data,   setData]     = useState<VarejoPedido[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!from || !to) return
      setLoading(true)
      let q = supabase
        .from('varejo_pedidos')
        .select('*')
        .gte('data_entrega', from)
        .lte('data_entrega', to)
        .order('data_entrega', { ascending: false })
        .order('created_at',   { ascending: false })
        .limit(500)

      if (debouncedSearch) {
        const s = debouncedSearch.replace(/[%,]/g, '')
        if (s) q = q.or(`num_pedido.ilike.%${s}%,cliente.ilike.%${s}%,bairro.ilike.%${s}%`)
      }

      const { data: rows } = await q
      if (!active) return
      setData(rows ?? [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [debouncedSearch, from, to])

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

function RetiradaTab({ fila, hoje, amanha, onEdit }: {
  fila:   VarejoPedido[]
  hoje:   VarejoPedido[]
  amanha: VarejoPedido[]
  onEdit: (p: VarejoPedido) => void
}) {
  const total = fila.length + hoje.length + amanha.length

  if (total === 0) {
    return (
      <div className="card p-10 text-center text-slate-400">
        <Package size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nenhuma retirada pendente.</p>
        <p className="text-xs mt-1">Pedidos marcados como RETIRADA aparecerão aqui.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {fila.length > 0 && (
        <div>
          <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-2">⏳ Fila · {fila.length}</p>
          <div className="space-y-1.5">
            {fila.map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
          </div>
        </div>
      )}
      {hoje.length > 0 && (
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">📦 Hoje · {hoje.length}</p>
          <div className="space-y-1.5">
            {sortForDashboard(hoje).map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
          </div>
        </div>
      )}
      {amanha.length > 0 && (
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">📋 Amanhã · {amanha.length}</p>
          <div className="space-y-1.5">
            {sortForDashboard(amanha).map(p => <PedidoCard key={p.id} pedido={p} onClick={() => onEdit(p)} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sync direto com Google Sheets API ───────────────────────────────────────

async function syncFromSheets(): Promise<number> {
  const apiKey    = localStorage.getItem('crm_sheets_api_key') ?? ''
  const sheetId   = localStorage.getItem('crm_sheet_id')       ?? '15ygrVoRh7cd8iVWn0eBXpEz-jBVsOa4jxemmmva2rnA'
  const sheetName = localStorage.getItem('crm_sheet_name')     ?? 'REG-CANTINA'

  const range = `${sheetName}!A2:U`
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body?.error?.message ?? `Erro ${res.status} ao acessar planilha`)
  }

  const json  = await res.json() as { values?: string[][] }
  const rows: string[][] = json.values ?? []

  function parseDateBR(val: unknown): string | null {
    const s = String(val ?? '').trim()
    // Full: DD/MM/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    // Short: DD/MM (spreadsheet formatted without year) — assume current year
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (m2) {
      const year = new Date().getFullYear()
      return `${year}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    return null
  }

  function toNum(raw: unknown): number | null {
    const s = String(raw ?? '').replace(',', '.').trim()
    if (!s) return null
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }

  const mapped = rows
    .filter(row => {
      const n = String(row[3] ?? '').trim()
      return n.length > 0 && /^\d/.test(n) && !n.includes('/')
    })
    .map(row => {
      const dataISO = parseDateBR(row[0])
      const MAX_FUTURE_DAYS = 60
      const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + MAX_FUTURE_DAYS)
      const dateValid = !dataISO || new Date(dataISO) <= maxDate
      const qtdParsed = parseInt(String(row[16] ?? ''), 10)
      return {
        num_pedido:           String(row[3]  ?? '').trim(),
        data_entrega:         dateValid ? dataISO : null,
        status_icon:          String(row[1]  ?? '').trim() || '⚠️',
        marcador:             String(row[2]  ?? '').trim() || null,
        cliente:              String(row[4]  ?? '').trim() || null,
        bairro:               String(row[5]  ?? '').trim() || null,
        turno:                String(row[6]  ?? '').trim().toUpperCase() || null,
        rota_definida:        String(row[8]  ?? '').trim() || null,
        restricao:            String(row[9]  ?? '').trim() || null,
        entregador:           String(row[10] ?? '').trim() || null,
        flag_restricao:       String(row[11] ?? '').trim() || null,
        origem:               String(row[12] ?? '').trim() || 'CARDAPIO WEB',
        atendente:            String(row[13] ?? '').trim() || null,
        valor_liquido:        toNum(row[14]),
        frete:                toNum(row[15]),
        qtd_pedidos_cliente:  Number.isFinite(qtdParsed) && qtdParsed > 0 ? qtdParsed : 1,
        telefone:             String(row[17] ?? '').replace(/\D/g, '') || null,
        endereco_completo:    String(row[19] ?? '').trim() || null,
        complemento:          String(row[20] ?? '').trim() || null,
        data_entrega_definida: !!(dateValid && dataISO && String(row[6] ?? '').trim()),
        source: 'sync',
      }
    })

  // Deduplica por num_pedido mantendo a última ocorrência (mais recente na planilha)
  const seen = new Map<string, typeof mapped[0]>()
  for (const r of mapped) seen.set(r.num_pedido, r)
  const records = Array.from(seen.values())

  const BATCH = 200
  let synced = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabase
      .from('varejo_pedidos')
      .upsert(records.slice(i, i + BATCH), { onConflict: 'num_pedido', ignoreDuplicates: false })
    if (error) throw new Error(error.message)
    synced += records.slice(i, i + BATCH).length
  }
  return synced
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function VarejoPage() {
  const [pedidos, setPedidos] = useState<VarejoPedido[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [tab, setTab] = useState<Tab>('fila')
  const [editPedido, setEditPedido] = useState<VarejoPedido | undefined>(undefined)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg]   = useState<string | null>(null)
  const [posVendaAtivos, setPosVendaAtivos] = useState(0)
  const sheetsApiKey = typeof window !== 'undefined' ? localStorage.getItem('crm_sheets_api_key') ?? '' : ''

  const tomorrow = useMemo(() => nextBusinessDay(selectedDate), [selectedDate])
  // "Amanhã" = actual next calendar day from today (not nextBusinessDay — varejo entrega aos fins de semana)
  const actualTomorrow = useMemo(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'), [])

  const load = useCallback(async () => {
    setLoading(true)
    // Always fetch selectedDate, its next day, AND the real tomorrow (they may differ)
    const datesToFetch = [...new Set([selectedDate, tomorrow, actualTomorrow])]
    const [{ data: dated }, { data: unconf }] = await Promise.all([
      supabase
        .from('varejo_pedidos')
        .select('*')
        .in('data_entrega', datesToFetch)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('varejo_pedidos')
        .select('*')
        .is('data_entrega', null)
        .eq('status_icon', '⚠️')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    setPedidos([...(dated ?? []), ...(unconf ?? [])])
    setLoading(false)
  }, [selectedDate, tomorrow, actualTomorrow])

  useEffect(() => { load() }, [load])

  // Auto-navigate to most recent date with data (runs once on mount)
  useEffect(() => {
    (async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: result } = await supabase
        .from('varejo_pedidos')
        .select('data_entrega')
        .not('data_entrega', 'is', null)
        .lte('data_entrega', today)
        .order('data_entrega', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (result?.data_entrega && result.data_entrega < today) {
        setSelectedDate(result.data_entrega)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`varejo_realtime_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'varejo_pedidos' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // ── Derivados ─────────────────────────────────────────────────────
  const today = pedidos.filter(p => p.data_entrega === selectedDate && !isRetirada(p))
  const todayCW = today.filter(p => p.origem === 'CARDAPIO WEB')
  const todayDelivery = pedidos.filter(p =>
    p.data_entrega === selectedDate && (p.origem === 'IFOOD' || p.origem === '99FOOD')
  )
  // Fila: CW orders pending turno assignment (⚠️ sem turno definido) — excludes retirada
  const fila = pedidos.filter(p =>
    p.status_icon === '⚠️' &&
    !p.turno &&
    p.origem === 'CARDAPIO WEB' &&
    !isRetirada(p)
  )
  // Amanhã = always actual tomorrow (não relativo ao selectedDate)
  const amanha = pedidos.filter(p => p.data_entrega === actualTomorrow && !isRetirada(p))

  // Retirada
  const retiradaFila  = pedidos.filter(p => isRetirada(p) && p.status_icon === '⚠️' && !p.data_entrega)
  const retiradaHoje  = pedidos.filter(p => isRetirada(p) && p.data_entrega === selectedDate)
  const retiradaAmanha = pedidos.filter(p => isRetirada(p) && p.data_entrega === actualTomorrow)
  const retiradaTotal = retiradaFila.length + retiradaHoje.length + retiradaAmanha.length

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
    { id: 'retirada'  as Tab, label: 'Retiradas',      count: retiradaTotal,        alert: retiradaFila.length > 0 },
    { id: 'delivery'  as Tab, label: 'iFood / 99Food', count: todayDelivery.length },
    { id: 'amanha'    as Tab, label: `Amanhã ${format(parseISO(actualTomorrow), 'dd/MM')}`, count: amanha.length },
    { id: 'historico' as Tab, label: 'Histórico',      count: 0 },
    { id: 'posvendas' as Tab, label: 'Pós-Venda',      count: posVendaAtivos, alert: posVendaAtivos > 0 },
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
          {sheetsApiKey && (
            <button
              onClick={async () => {
                setSyncing(true)
                setSyncMsg(null)
                try {
                  const count = await syncFromSheets()
                  setSyncMsg(`✓ ${count} pedidos`)
                  setTimeout(() => { setSyncMsg(null); load() }, 2000)
                } catch (e: unknown) {
                  setSyncMsg(e instanceof Error ? e.message : 'Erro')
                  setTimeout(() => setSyncMsg(null), 5000)
                } finally { setSyncing(false) }
              }}
              disabled={syncing}
              className={`btn-ghost px-2 py-1 flex items-center gap-1 text-xs ${
                syncMsg?.startsWith('✓') ? 'text-green-500' : syncMsg ? 'text-red-500' : 'text-purple-500'
              }`}
              title="Sincronizar com Planilha"
            >
              <CloudDownload size={14} className={syncing ? 'animate-pulse' : ''} />
              {syncing ? 'Sincronizando…' : syncMsg ?? 'Sync'}
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
          <div key={t.id} className="flex items-stretch shrink-0">
            {t.id === 'posvendas' && (
              <div className="w-px bg-slate-200 dark:bg-slate-600 self-stretch my-1.5 mr-1" />
            )}
            <button onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                t.id === 'posvendas'
                  ? tab === t.id
                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-purple-400 dark:text-purple-500 hover:text-purple-600 dark:hover:text-purple-400'
                  : tab === t.id
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}>
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                  (t as any).alert
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : t.id === 'posvendas'
                    ? tab === t.id
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                      : 'bg-purple-50 dark:bg-purple-900/20 text-purple-400'
                    : tab === t.id
                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                }`}>{t.count}</span>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Content */}
      {tab === 'posvendas' ? (
        <PosVendaTab onCountsChange={(p1, p2) => setPosVendaAtivos(p1 + p2)} />
      ) : tab === 'historico' ? (
        <HistoricoTab onEdit={setEditPedido} />
      ) : loading ? (
        <div className="flex justify-center py-12 text-slate-400 text-sm">Carregando...</div>
      ) : tab === 'retirada' ? (
        <RetiradaTab fila={retiradaFila} hoje={retiradaHoje} amanha={retiradaAmanha} onEdit={setEditPedido} />
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
