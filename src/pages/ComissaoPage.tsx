import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TrendingUp, Download, RefreshCw, Users, Package,
  ChevronDown, ChevronUp, Star, CheckCircle2, Clock, Banknote,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const COMMISSION_RATE = 0.01
const META_PEDIDOS    = 3
const META_VALOR      = 500
const META_COMISSAO   = 50

// ─── Interfaces ────────────────────────────────────────────────
interface PedidoComissao {
  id: string
  num_pedido: string
  data_entrega: string | null
  status_icon: string
  cliente: string | null
  bairro: string | null
  valor_liquido: number | null
  atendente: string | null
}

interface ClienteProgresso {
  id: string
  nome: string
  tipo: string | null
  indicador: string
  positivado: boolean
  positivado_em: string | null
  comissao_status: string | null
  comissao_valor: number | null
  comissao_pago_em: string | null
  n_pedidos: number
  total_compras: number
}

// ─── Helpers ───────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  try { return format(parseISO(s), 'dd/MM/yyyy') } catch { return s }
}

function fmtDateSimple(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  '✅': { label: 'Entregue',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  '🛵': { label: 'Em Entrega', cls: 'bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-400'  },
  '⚠️': { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
}

function getYears() {
  const now = new Date().getFullYear()
  const years: number[] = []
  for (let y = 2024; y <= now + 1; y++) years.push(y)
  return years
}

function exportExcel(
  pedidos: PedidoComissao[],
  titulo: string,
  showAtendente: boolean,
  byAtendente: Array<[string, { valor: number; qtd: number }]>,
) {
  const wb = XLSX.utils.book_new()
  const rows = pedidos.map(p => {
    const row: Record<string, string | number> = {
      'Pedido':        p.num_pedido,
      'Data Entrega':  p.data_entrega ?? '',
      'Status':        STATUS_MAP[p.status_icon]?.label ?? p.status_icon,
      'Cliente':       p.cliente ?? '',
      'Bairro':        p.bairro ?? '',
      'Valor (R$)':    p.valor_liquido ?? 0,
      'Comissão (R$)': +((p.valor_liquido ?? 0) * COMMISSION_RATE).toFixed(2),
    }
    if (showAtendente) row['Atendente'] = (p.atendente ?? '').toUpperCase()
    return row
  })
  const totalValor = pedidos.reduce((s, p) => s + (p.valor_liquido ?? 0), 0)
  const totalRow: Record<string, string | number> = {
    'Pedido': `TOTAL (${pedidos.length} pedidos)`,
    'Data Entrega': '', 'Status': '', 'Cliente': '', 'Bairro': '',
    'Valor (R$)': +totalValor.toFixed(2),
    'Comissão (R$)': +(totalValor * COMMISSION_RATE).toFixed(2),
  }
  if (showAtendente) totalRow['Atendente'] = ''
  rows.push(totalRow)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Pedidos')
  if (showAtendente && byAtendente.length > 0) {
    const resumo = byAtendente.map(([nome, d]) => ({
      'Atendente': nome,
      'Pedidos': d.qtd,
      'Total Bruto (R$)': +d.valor.toFixed(2),
      'Comissão 1% (R$)': +(d.valor * COMMISSION_RATE).toFixed(2),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo')
  }
  XLSX.writeFile(wb, `Comissoes_${titulo}_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// ─── Main Component ────────────────────────────────────────────
export default function ComissaoPage() {
  const { profile, isAdmin } = useAuth()
  const now = new Date()
  const selfName = (profile?.nome ?? '').toUpperCase().trim()

  const [tab, setTab] = useState<'varejo' | 'positivacoes'>('varejo')

  // ── Varejo state ──
  const [mode, setMode]           = useState<'mensal' | 'periodo'>('mensal')
  const [atendente, setAtendente] = useState(() => isAdmin ? 'TODOS' : selfName)
  const [mes, setMes]             = useState(now.getMonth())
  const [ano, setAno]             = useState(now.getFullYear())
  const [dataIni, setDataIni]     = useState('')
  const [dataFim, setDataFim]     = useState('')
  const [atendentes, setAtendentes] = useState<string[]>([])
  const [pedidos, setPedidos]       = useState<PedidoComissao[]>([])
  const [loading, setLoading]       = useState(false)
  const [showDetail, setShowDetail] = useState(true)

  useEffect(() => {
    supabase.from('crm_users').select('nome').eq('ativo', true)
      .then(({ data }) => {
        const nomes = (data ?? [])
          .map((u: any) => String(u.nome ?? '').toUpperCase().trim())
          .filter(Boolean)
        setAtendentes([...new Set(nomes)].sort())
      })
  }, [])

  useEffect(() => {
    if (!isAdmin && selfName) setAtendente(selfName)
  }, [isAdmin, selfName])

  function getDateRange() {
    if (mode === 'mensal') {
      const d = new Date(ano, mes, 1)
      return {
        ini: startOfMonth(d).toISOString().split('T')[0],
        fim: endOfMonth(d).toISOString().split('T')[0],
        titulo: `${MESES[mes]}_${ano}`,
        label: `${MESES[mes]} / ${ano}`,
      }
    }
    return {
      ini: dataIni, fim: dataFim,
      titulo: `${dataIni}_a_${dataFim}`,
      label: dataIni && dataFim ? `${fmtDate(dataIni)} a ${fmtDate(dataFim)}` : '—',
    }
  }

  const buscar = useCallback(async () => {
    const { ini, fim } = getDateRange()
    if (!ini || !fim) return
    setLoading(true)
    let q = supabase
      .from('varejo_pedidos')
      .select('id, num_pedido, data_entrega, status_icon, cliente, bairro, valor_liquido, atendente')
      .eq('origem', 'CARDAPIO WEB')
      .neq('status_icon', '❌')
      .not('data_entrega', 'is', null)
      .gte('data_entrega', ini)
      .lte('data_entrega', fim)
      .order('data_entrega', { ascending: true })
      .order('num_pedido', { ascending: true })
    if (atendente !== 'TODOS') q = q.ilike('atendente', atendente)
    const { data } = await q
    setPedidos((data ?? []) as PedidoComissao[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendente, mes, ano, mode, dataIni, dataFim])

  useEffect(() => {
    if (mode === 'periodo' && (!dataIni || !dataFim)) return
    buscar()
  }, [buscar])

  const totalValor    = useMemo(() => pedidos.reduce((s, p) => s + (p.valor_liquido ?? 0), 0), [pedidos])
  const totalComissao = useMemo(() => totalValor * COMMISSION_RATE, [totalValor])
  const ticketMedio   = useMemo(() => pedidos.length ? totalValor / pedidos.length : 0, [pedidos, totalValor])

  const byAtendente = useMemo(() => {
    const map = new Map<string, { valor: number; qtd: number }>()
    for (const p of pedidos) {
      const key = (p.atendente ?? '—').toUpperCase().trim()
      const cur = map.get(key) ?? { valor: 0, qtd: 0 }
      map.set(key, { valor: cur.valor + (p.valor_liquido ?? 0), qtd: cur.qtd + 1 })
    }
    return [...map.entries()].sort((a, b) => b[1].valor - a[1].valor)
  }, [pedidos])

  const { ini, fim, titulo, label: periodLabel } = getDateRange()
  const canExport        = pedidos.length > 0
  const showAtendenteCol = atendente === 'TODOS'

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <TrendingUp size={20} className="text-orange-500" /> Comissões
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Pedidos Cardápio Web (delivery) · Taxa:{' '}
          <strong className="text-orange-500">1%</strong> sobre valor líquido · Positivações Atacado: R$ 50,00
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
        {([
          { id: 'varejo',       label: 'Varejo (1%)' },
          { id: 'positivacoes', label: '★ Positivações Atacado' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA VAREJO ── */}
      {tab === 'varejo' && (
        <>
          {/* Filtros */}
          <div className="card p-4 space-y-4">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
              {(['mensal', 'periodo'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    mode === m
                      ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}>
                  {m === 'mensal' ? 'Por Mês / Ano' : 'Período Personalizado'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="label">Atendente</label>
                {isAdmin ? (
                  <select className="input w-44" value={atendente} onChange={e => setAtendente(e.target.value)}>
                    <option value="TODOS">Todos</option>
                    {atendentes.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                ) : (
                  <div className="input w-44 bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 cursor-default select-none">
                    {selfName || '—'}
                  </div>
                )}
              </div>

              {mode === 'mensal' ? (
                <>
                  <div>
                    <label className="label">Mês</label>
                    <select className="input w-36" value={mes} onChange={e => setMes(Number(e.target.value))}>
                      {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Ano</label>
                    <select className="input w-24" value={ano} onChange={e => setAno(Number(e.target.value))}>
                      {getYears().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="label">Data início</label>
                    <input type="date" className="input" value={dataIni} onChange={e => setDataIni(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">até</label>
                    <input type="date" className="input" value={dataFim} onChange={e => setDataFim(e.target.value)} />
                  </div>
                </>
              )}

              <button onClick={buscar} disabled={loading || (mode === 'periodo' && (!dataIni || !dataFim))}
                className="btn-secondary flex items-center gap-2 py-2">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Buscando…' : 'Atualizar'}
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Pedidos</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {loading ? <span className="animate-pulse text-slate-300">—</span> : pedidos.length}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{periodLabel}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Bruto</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
                {loading ? <span className="animate-pulse text-slate-300">—</span> : fmtBRL(totalValor)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {!loading && pedidos.length > 0 ? `Ticket médio ${fmtBRL(ticketMedio)}` : ''}
              </p>
            </div>
            <div className="card p-4 border-orange-200 dark:border-orange-700/40 bg-orange-50 dark:bg-orange-900/20">
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Comissão Total (1%)</p>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-400 mt-1 tabular-nums">
                {loading ? <span className="animate-pulse text-orange-200">—</span> : fmtBRL(totalComissao)}
              </p>
              <p className="text-[10px] text-orange-400 mt-0.5 truncate">
                {atendente === 'TODOS' ? 'Todos os atendentes' : atendente}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Atendentes</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {loading ? <span className="animate-pulse text-slate-300">—</span> : byAtendente.length}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">com pedidos no período</p>
            </div>
          </div>

          {/* Resumo por atendente */}
          {showAtendenteCol && byAtendente.length > 0 && !loading && (
            <div className="card p-4">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Users size={14} className="text-orange-500" /> Resumo por Atendente
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="pb-2 font-medium">Atendente</th>
                      <th className="pb-2 font-medium text-right">Pedidos</th>
                      <th className="pb-2 font-medium text-right">Total Bruto</th>
                      <th className="pb-2 font-medium text-right">Comissão 1%</th>
                      <th className="pb-2 font-medium text-right hidden md:table-cell">% do total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {byAtendente.map(([nome, d]) => (
                      <tr key={nome} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 font-medium text-slate-700 dark:text-slate-200">{nome}</td>
                        <td className="py-2.5 text-right text-slate-500 tabular-nums">{d.qtd}</td>
                        <td className="py-2.5 text-right text-slate-700 dark:text-slate-200 tabular-nums">{fmtBRL(d.valor)}</td>
                        <td className="py-2.5 text-right font-bold text-orange-600 tabular-nums">{fmtBRL(d.valor * COMMISSION_RATE)}</td>
                        <td className="py-2.5 text-right text-slate-400 tabular-nums hidden md:table-cell">
                          {totalValor ? (d.valor / totalValor * 100).toFixed(1) + '%' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 dark:border-slate-600">
                    <tr>
                      <td className="pt-2.5 font-bold text-slate-800 dark:text-slate-100">Total</td>
                      <td className="pt-2.5 text-right font-bold tabular-nums">{pedidos.length}</td>
                      <td className="pt-2.5 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtBRL(totalValor)}</td>
                      <td className="pt-2.5 text-right font-bold text-orange-600 tabular-nums">{fmtBRL(totalComissao)}</td>
                      <td className="pt-2.5 hidden md:table-cell"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Detalhe dos pedidos */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => setShowDetail(v => !v)}
                className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 hover:text-orange-500 transition-colors"
              >
                <Package size={14} className="text-orange-500" />
                Detalhe dos Pedidos ({loading ? '…' : pedidos.length})
                {showDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={() => exportExcel(pedidos, titulo, showAtendenteCol, byAtendente)}
                disabled={!canExport || loading}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                <Download size={13} /> Exportar Excel
              </button>
            </div>

            {showDetail && (
              loading ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw size={20} className="animate-spin text-orange-400" />
                </div>
              ) : pedidos.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  {mode === 'periodo' && (!ini || !fim)
                    ? 'Selecione as datas de início e fim para visualizar'
                    : 'Nenhum pedido Cardápio Web encontrado para o período selecionado'}
                </p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">
                        <th className="pb-2 font-medium pr-3"># Pedido</th>
                        <th className="pb-2 font-medium pr-3">Data</th>
                        <th className="pb-2 font-medium pr-3">Status</th>
                        <th className="pb-2 font-medium pr-3">Cliente</th>
                        <th className="pb-2 font-medium pr-3 hidden md:table-cell">Bairro</th>
                        <th className="pb-2 font-medium text-right pr-3">Valor</th>
                        <th className="pb-2 font-medium text-right text-orange-500 pr-3">Comissão 1%</th>
                        {showAtendenteCol && <th className="pb-2 font-medium">Atendente</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {pedidos.map(p => {
                        const comissao = (p.valor_liquido ?? 0) * COMMISSION_RATE
                        const st = STATUS_MAP[p.status_icon] ?? { label: p.status_icon, cls: 'bg-slate-100 text-slate-600' }
                        return (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 pr-3">#{p.num_pedido}</td>
                            <td className="py-1.5 text-xs text-slate-600 dark:text-slate-300 pr-3 whitespace-nowrap">{fmtDate(p.data_entrega)}</td>
                            <td className="py-1.5 pr-3">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                            </td>
                            <td className="py-1.5 pr-3 max-w-[160px]">
                              <span className="block truncate text-xs text-slate-700 dark:text-slate-200">{p.cliente ?? '—'}</span>
                            </td>
                            <td className="py-1.5 pr-3 text-xs text-slate-400 hidden md:table-cell">{p.bairro ?? '—'}</td>
                            <td className="py-1.5 pr-3 text-right font-medium text-slate-700 dark:text-slate-200 tabular-nums text-xs whitespace-nowrap">{fmtBRL(p.valor_liquido ?? 0)}</td>
                            <td className="py-1.5 pr-3 text-right font-bold text-orange-600 tabular-nums text-xs whitespace-nowrap">{fmtBRL(comissao)}</td>
                            {showAtendenteCol && (
                              <td className="py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {(p.atendente ?? '—').toUpperCase()}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 dark:border-slate-600">
                      <tr>
                        <td colSpan={3} className="pt-3 pb-1 font-bold text-slate-800 dark:text-slate-100">
                          Total — {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
                        </td>
                        <td className="hidden md:table-cell"></td>
                        <td className="hidden md:table-cell"></td>
                        <td className="pt-3 pb-1 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums whitespace-nowrap">{fmtBRL(totalValor)}</td>
                        <td className="pt-3 pb-1 text-right font-bold text-orange-600 tabular-nums whitespace-nowrap">{fmtBRL(totalComissao)}</td>
                        {showAtendenteCol && <td></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* ── ABA POSITIVAÇÕES ── */}
      {tab === 'positivacoes' && (
        <PosativacoesTab isAdmin={isAdmin} selfName={selfName} />
      )}
    </div>
  )
}

// ─── Aba de Positivações Atacado ───────────────────────────────

function ProgressBar({ value, max, label, isMoney }: {
  value: number; max: number; label: string; isMoney?: boolean
}) {
  const pct = Math.min(100, (value / max) * 100)
  const done = value >= max
  const display = isMoney ? fmtBRL(value) : String(value)
  const maxDisplay = isMoney ? fmtBRL(max) : String(max)
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className={done ? 'text-green-600 font-bold' : 'text-slate-500'}>
          {display} / {maxDisplay}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-orange-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function PosativacoesTab({ isAdmin, selfName }: { isAdmin: boolean; selfName: string }) {
  const [clientes, setClientes] = useState<ClienteProgresso[]>([])
  const [loading, setLoading]   = useState(false)
  const [filtro, setFiltro]     = useState(isAdmin ? 'TODOS' : selfName)
  const [atendentes, setAtendentes] = useState<string[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('crm_users').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => {
        const nomes = (data ?? [])
          .map((u: any) => String(u.nome ?? '').toUpperCase().trim())
          .filter(Boolean)
        setAtendentes([...new Set(nomes)].sort())
      })
  }, [])

  // Garante não-admin fixo no próprio nome
  useEffect(() => {
    if (!isAdmin && selfName) setFiltro(selfName)
  }, [isAdmin, selfName])

  const load = useCallback(async () => {
    setLoading(true)

    let q = supabase
      .from('crm_clients')
      .select('id, nome, tipo, indicador, positivado, positivado_em, comissao_status, comissao_valor, comissao_pago_em')
      .not('indicador', 'is', null)
      .neq('indicador', '')
      .order('nome')

    if (!isAdmin || filtro !== 'TODOS') {
      q = q.ilike('indicador', filtro)
    }

    const { data: cData } = await q
    const clsRaw = (cData ?? []) as any[]

    if (clsRaw.length === 0) {
      setClientes([])
      setLoading(false)
      return
    }

    // Agrega pedidos por cliente
    const ids = clsRaw.map(c => c.id)
    const { data: pData } = await supabase
      .from('atacado_pedidos')
      .select('crm_client_id, valor')
      .in('crm_client_id', ids)
      .neq('tipo', 'BONIFICACAO')
      .neq('tipo', 'CANCELADO')
      .eq('ignorado', false)

    const agg = new Map<string, { n: number; total: number }>()
    for (const p of (pData ?? [])) {
      if (!p.crm_client_id) continue
      const cur = agg.get(p.crm_client_id) ?? { n: 0, total: 0 }
      agg.set(p.crm_client_id, { n: cur.n + 1, total: cur.total + (p.valor ?? 0) })
    }

    setClientes(clsRaw.map(c => ({
      ...c,
      n_pedidos:     agg.get(c.id)?.n     ?? 0,
      total_compras: agg.get(c.id)?.total ?? 0,
    })))
    setLoading(false)
  }, [isAdmin, filtro])

  useEffect(() => { load() }, [load])

  async function confirmar(c: ClienteProgresso) {
    if (!window.confirm(
      `Confirmar positivação de ${c.nome}?\n\nIsso registrará uma comissão de R$ ${META_COMISSAO},00 para ${c.indicador}.`
    )) return
    setSavingId(c.id)
    await supabase.from('crm_clients').update({
      positivado:      true,
      positivado_em:   new Date().toISOString().substring(0, 10),
      comissao_status: 'pendente',
      comissao_valor:  META_COMISSAO,
    }).eq('id', c.id)
    setSavingId(null)
    load()
  }

  async function marcarPago(c: ClienteProgresso) {
    if (!window.confirm(
      `Marcar comissão de ${c.indicador} (cliente ${c.nome}) como paga?`
    )) return
    setSavingId(c.id)
    await supabase.from('crm_clients').update({
      comissao_status:  'pago',
      comissao_pago_em: new Date().toISOString().substring(0, 10),
    }).eq('id', c.id)
    setSavingId(null)
    load()
  }

  const elegiveis   = clientes.filter(c => !c.positivado && c.n_pedidos >= META_PEDIDOS && c.total_compras >= META_VALOR)
  const emProgresso = clientes.filter(c => !c.positivado && !(c.n_pedidos >= META_PEDIDOS && c.total_compras >= META_VALOR))
  const confirmadas = clientes.filter(c => c.positivado)

  const totalPendente = confirmadas.filter(c => c.comissao_status === 'pendente').reduce((s, c) => s + (c.comissao_valor ?? 0), 0)
  const totalPago     = confirmadas.filter(c => c.comissao_status === 'pago').reduce((s, c) => s + (c.comissao_valor ?? 0), 0)

  return (
    <div className="space-y-5">

      {/* Filtro + atualizar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Indicador</label>
            {isAdmin ? (
              <select className="input w-44" value={filtro} onChange={e => setFiltro(e.target.value)}>
                <option value="TODOS">Todos</option>
                {atendentes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <div className="input w-44 bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 cursor-default select-none">
                {selfName || '—'}
              </div>
            )}
          </div>
          <button onClick={load} disabled={loading}
            className="btn-secondary flex items-center gap-2 py-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Regra: cliente com <strong>{META_PEDIDOS} pedidos</strong> + total ≥ <strong>{fmtBRL(META_VALOR)}</strong> gera comissão de <strong className="text-purple-600">{fmtBRL(META_COMISSAO)}</strong> para o indicador.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Clock size={12} className="text-orange-400" /> Em progresso
          </p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            {loading ? '—' : emProgresso.length}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">clientes ainda não positivados</p>
        </div>
        <div className="card p-4 border-green-200 dark:border-green-700/40 bg-green-50/50 dark:bg-green-900/10">
          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
            <Star size={12} /> Elegíveis
          </p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">
            {loading ? '—' : elegiveis.length}
          </p>
          <p className="text-[10px] text-green-500 mt-0.5">aguardando confirmação ADM</p>
        </div>
        <div className="card p-4 border-purple-200 dark:border-purple-700/40 bg-purple-50/50 dark:bg-purple-900/10">
          <p className="text-xs text-purple-600 font-medium flex items-center gap-1">
            <Banknote size={12} /> Pendente pag.
          </p>
          <p className="text-xl font-bold text-purple-700 dark:text-purple-400 mt-1 tabular-nums">
            {loading ? '—' : fmtBRL(totalPendente)}
          </p>
          <p className="text-[10px] text-purple-400 mt-0.5">comissões confirmadas a pagar</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <CheckCircle2 size={12} className="text-green-500" /> Total pago
          </p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
            {loading ? '—' : fmtBRL(totalPago)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{confirmadas.filter(c => c.comissao_status === 'pago').length} positivações pagas</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={22} className="animate-spin text-purple-400" />
        </div>
      )}

      {!loading && clientes.length === 0 && (
        <div className="card p-8 text-center">
          <Star size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">
            {isAdmin
              ? 'Nenhum cliente com indicador cadastrado. Preencha o campo "Indicador" no cadastro do cliente.'
              : 'Você ainda não possui clientes indicados cadastrados.'}
          </p>
        </div>
      )}

      {/* ── Elegíveis ── */}
      {!loading && elegiveis.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
            <Star size={14} className="text-green-500" />
            Elegíveis — aguardando confirmação ({elegiveis.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {elegiveis.map(c => (
              <div key={c.id} className="card p-4 border-green-200 dark:border-green-700/40 bg-green-50/40 dark:bg-green-900/10 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{c.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.tipo && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                          {c.tipo}
                        </span>
                      )}
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                        ★ {c.indicador}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-500">{c.n_pedidos} ped. · {fmtBRL(c.total_compras)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ProgressBar value={c.n_pedidos}    max={META_PEDIDOS} label="Pedidos" />
                  <ProgressBar value={c.total_compras} max={META_VALOR}  label="Total compras" isMoney />
                </div>
                {isAdmin && (
                  <button
                    onClick={() => confirmar(c)}
                    disabled={savingId === c.id}
                    className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {savingId === c.id ? 'Salvando…' : `✓ Confirmar positivação — R$ ${META_COMISSAO},00`}
                  </button>
                )}
                {!isAdmin && (
                  <p className="text-[10px] text-center text-green-600 font-medium">
                    ✓ Critério atingido — aguardando confirmação do ADM
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Em progresso ── */}
      {!loading && emProgresso.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <Clock size={14} className="text-orange-400" />
            Em progresso ({emProgresso.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {emProgresso.map(c => (
              <div key={c.id} className="card p-3.5 space-y-2.5">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{c.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.tipo && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                        {c.tipo}
                      </span>
                    )}
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">★ {c.indicador}</span>
                  </div>
                </div>
                <ProgressBar value={c.n_pedidos}    max={META_PEDIDOS} label="Pedidos" />
                <ProgressBar value={c.total_compras} max={META_VALOR}  label="Total compras" isMoney />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Comissões confirmadas ── */}
      {!loading && confirmadas.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-purple-500" />
            Comissões confirmadas ({confirmadas.length})
          </h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    {isAdmin && <th className="px-4 py-2.5 font-medium">Indicador</th>}
                    <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Positivado em</th>
                    <th className="px-4 py-2.5 font-medium text-right">Comissão</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    {isAdmin && <th className="px-4 py-2.5 font-medium"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {confirmadas.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.nome}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-purple-600 dark:text-purple-400 font-medium text-xs">{c.indicador}</td>
                      )}
                      <td className="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell">{c.tipo ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateSimple(c.positivado_em)}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums whitespace-nowrap">
                        {fmtBRL(c.comissao_valor ?? META_COMISSAO)}
                      </td>
                      <td className="px-4 py-3">
                        {c.comissao_status === 'pago' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <CheckCircle2 size={10} /> Pago {c.comissao_pago_em ? fmtDateSimple(c.comissao_pago_em) : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            <Clock size={10} /> Pendente
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {c.comissao_status !== 'pago' && (
                            <button
                              onClick={() => marcarPago(c)}
                              disabled={savingId === c.id}
                              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {savingId === c.id ? '…' : 'Marcar pago'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40">
                  <tr>
                    <td colSpan={isAdmin ? 4 : 3} className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                      Total ({confirmadas.length} positivações)
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums">
                      {fmtBRL(totalPendente + totalPago)}
                    </td>
                    <td colSpan={isAdmin ? 2 : 1} className="px-4 py-3 text-xs text-slate-400">
                      Pendente: {fmtBRL(totalPendente)} · Pago: {fmtBRL(totalPago)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
