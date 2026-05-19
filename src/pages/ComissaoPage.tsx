import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Search, Download, RefreshCw, Users, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

const COMMISSION_RATE = 0.01 // 1%

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

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  try { return format(parseISO(s), 'dd/MM/yyyy') } catch { return s }
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

  // Aba detalhe
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

  // Aba resumo por atendente
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

export default function ComissaoPage() {
  const now = new Date()

  const [mode, setMode]               = useState<'mensal' | 'periodo'>('mensal')
  const [atendente, setAtendente]     = useState('TODOS')
  const [mes, setMes]                 = useState(now.getMonth())
  const [ano, setAno]                 = useState(now.getFullYear())
  const [dataIni, setDataIni]         = useState('')
  const [dataFim, setDataFim]         = useState('')

  const [atendentes, setAtendentes]   = useState<string[]>([])
  const [pedidos, setPedidos]         = useState<PedidoComissao[]>([])
  const [loading, setLoading]         = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [showDetail, setShowDetail]   = useState(true)

  // Carrega atendentes distintos na montagem
  useEffect(() => {
    supabase
      .from('varejo_pedidos')
      .select('atendente')
      .eq('origem', 'CARDAPIO WEB')
      .not('atendente', 'is', null)
      .then(({ data }) => {
        const set = new Set<string>()
        ;(data ?? []).forEach((r: any) => {
          const v = String(r.atendente ?? '').toUpperCase().trim()
          if (v) set.add(v)
        })
        setAtendentes([...set].sort())
      })
  }, [])

  function getDateRange() {
    if (mode === 'mensal') {
      const d = new Date(ano, mes, 1)
      return {
        ini: startOfMonth(d).toISOString().split('T')[0],
        fim: endOfMonth(d).toISOString().split('T')[0],
        titulo: `${MESES[mes].replace('ç','c').replace('ã','a')}_${ano}`,
        label: `${MESES[mes]} / ${ano}`,
      }
    }
    return {
      ini: dataIni, fim: dataFim,
      titulo: `${dataIni}_a_${dataFim}`,
      label: dataIni && dataFim ? `${fmtDate(dataIni)} a ${fmtDate(dataFim)}` : '—',
    }
  }

  async function buscar() {
    const { ini, fim } = getDateRange()
    if (!ini || !fim) return
    setLoading(true)
    setPedidos([])
    setHasSearched(false)

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
    setHasSearched(true)
  }

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
  const canSearch        = Boolean(ini && fim)
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
          <strong className="text-orange-500">1%</strong> sobre valor líquido ·{' '}
          iFood e 99Food não comissionados
        </p>
      </div>

      {/* Filtros */}
      <div className="card p-4 space-y-4">
        {/* Toggle modo */}
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
          {/* Atendente */}
          <div>
            <label className="label">Atendente</label>
            <select className="input w-44" value={atendente} onChange={e => setAtendente(e.target.value)}>
              <option value="TODOS">Todos</option>
              {atendentes.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
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

          <button onClick={buscar} disabled={!canSearch || loading}
            className="btn-primary flex items-center gap-2">
            {loading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
            Calcular
          </button>
        </div>
      </div>

      {/* ── Resultados ── */}
      {hasSearched && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Pedidos</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{pedidos.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{periodLabel}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Bruto</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{fmtBRL(totalValor)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Ticket médio {fmtBRL(ticketMedio)}</p>
            </div>
            <div className="card p-4 border-orange-200 dark:border-orange-700/40 bg-orange-50 dark:bg-orange-900/20">
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Comissão Total (1%)</p>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-400 mt-1 tabular-nums">{fmtBRL(totalComissao)}</p>
              <p className="text-[10px] text-orange-400 mt-0.5 truncate">
                {atendente === 'TODOS' ? 'Todos os atendentes' : atendente}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Atendentes</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{byAtendente.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">com pedidos no período</p>
            </div>
          </div>

          {/* Resumo por atendente */}
          {showAtendenteCol && byAtendente.length > 0 && (
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

          {/* Detalhe dos pedidos (colapsável) */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => setShowDetail(v => !v)}
                className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 hover:text-orange-500 transition-colors"
              >
                <Package size={14} className="text-orange-500" />
                Detalhe dos Pedidos ({pedidos.length})
                {showDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={() => exportExcel(pedidos, titulo, showAtendenteCol, byAtendente)}
                disabled={pedidos.length === 0}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                <Download size={13} /> Exportar Excel
              </button>
            </div>

            {showDetail && (
              pedidos.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  Nenhum pedido Cardápio Web encontrado para o período selecionado
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
    </div>
  )
}
