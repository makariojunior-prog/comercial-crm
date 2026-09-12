import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw, Search, ChevronUp, ChevronDown, ChevronsUpDown,
  AlertTriangle, TrendingDown, Ban, History, Users, Package, Wallet, HelpCircle, Link2,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Client } from '../types'
import ClientHistoryModal from './ClientHistoryModal'
import VincularClientesModal from './VincularClientesModal'
import type { OrphanGroup } from './VincularClientesModal'

interface Props {
  clients: Client[]
  loading: boolean
}

interface PedidoAgg {
  crm_client_id: string
  valor: number
  data_emissao: string
}

interface PedidoOrfao {
  cliente_id: number | null
  cliente_nome: string | null
  valor: number
}

// PostgREST corta a resposta no limite de linhas configurado no servidor. A
// janela de 12 meses da Revenda passa fácil desse limite e o corte silencioso
// aparecia na tela como cliente "sem compra" e total do mês menor do que é.
const PAGE_SIZE = 1000

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return out
}

interface MesValor { qtd: number; valor: number }

type SortCol = 'nome' | 'pedidos' | 'total' | 'ticket' | 'variacao'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getYears() {
  const now = new Date().getFullYear()
  const years: number[] = []
  for (let y = 2024; y <= now + 1; y++) years.push(y)
  return years
}

// Brasil não tem horário de verão desde 2019 — offset fixo -3h para
// extrair o "mês comercial" correto de um timestamp emitido em UTC
function monthKeyBR(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().substring(0, 7)
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function monthLabel(mk: string): string {
  try { return format(parseISO(mk + '-01'), 'MMM/yy', { locale: ptBR }) } catch { return mk }
}

// Barras compactas para tendência dentro de uma linha de tabela
function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-[2px] h-6" title="Últimos 12 meses">
      {values.map((v, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${v > 0 ? 'bg-orange-400 dark:bg-orange-500' : 'bg-slate-200 dark:bg-slate-700'}`}
          style={{ height: `${v > 0 ? Math.max(v / max * 100, 12) : 4}%` }}
        />
      ))}
    </div>
  )
}

// Gráfico de evolução geral (agregado de todos os clientes de revenda)
function EvolucaoChart({ data }: { data: { mes: string; total: number }[] }) {
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <div className="flex items-end gap-2 h-36 pt-4">
      {data.map(d => (
        <div key={d.mes} className="flex-1 flex flex-col items-center gap-1.5 group relative min-w-0">
          <div className="w-full flex-1 flex items-end relative">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 dark:bg-slate-950 text-white text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap z-10">
              {fmtBRL(d.total)}
            </div>
            <div
              className="w-full bg-orange-400 dark:bg-orange-500 rounded-t transition-all group-hover:bg-orange-500 dark:group-hover:bg-orange-400"
              style={{ height: `${Math.max(d.total / max * 100, d.total > 0 ? 3 : 1)}%` }}
            />
          </div>
          <span className="text-[9px] text-slate-400 whitespace-nowrap">{monthLabel(d.mes)}</span>
        </div>
      ))}
    </div>
  )
}

function contarMesesSemCompra(meses: Map<string, MesValor> | undefined, monthKeysDesc: string[]): number {
  let n = 0
  for (const mk of monthKeysDesc) {
    if ((meses?.get(mk)?.valor ?? 0) > 0) break
    n++
  }
  return n
}

export default function RevendaComprasTab({ clients, loading: loadingClients }: Props) {
  const now = new Date()
  const [refMonth, setRefMonth] = useState(now.getMonth())
  const [refYear, setRefYear]   = useState(now.getFullYear())
  const [search, setSearch]     = useState('')
  const [sortCol, setSortCol]   = useState<SortCol>('total')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')

  const [pedidos, setPedidos]         = useState<PedidoAgg[]>([])
  const [orfaos, setOrfaos]           = useState<PedidoOrfao[]>([])
  const [loading, setLoading]         = useState(true)
  const [historyClient, setHistoryClient] = useState<{ id: string; nome: string } | null>(null)
  const [showVincular, setShowVincular]   = useState(false)

  const load = useCallback(async () => {
    if (clients.length === 0) { setPedidos([]); setOrfaos([]); setLoading(false); return }
    setLoading(true)

    const refDate     = new Date(refYear, refMonth, 1)
    const windowStart  = startOfMonth(subMonths(refDate, 11))
    const windowEnd    = endOfMonth(refDate)
    const ids = clients.map(c => c.id)

    const [pData, orphanData] = await Promise.all([
      fetchAllPages<PedidoAgg>((from, to) => supabase
        .from('atacado_pedidos')
        .select('crm_client_id, valor, data_emissao')
        .in('crm_client_id', ids)
        .eq('ignorado', false)
        .neq('tipo', 'BONIFICACAO')
        .neq('tipo', 'CANCELADO')
        .gte('data_emissao', windowStart.toISOString())
        .lte('data_emissao', windowEnd.toISOString())
        .order('id', { ascending: true })
        .range(from, to)),
      fetchAllPages<PedidoOrfao>((from, to) => supabase
        .from('atacado_pedidos')
        .select('cliente_id, cliente_nome, valor')
        .is('crm_client_id', null)
        .eq('ignorado', false)
        .neq('tipo', 'BONIFICACAO')
        .neq('tipo', 'CANCELADO')
        .gte('data_emissao', startOfMonth(refDate).toISOString())
        .lte('data_emissao', endOfMonth(refDate).toISOString())
        .order('id', { ascending: true })
        .range(from, to)),
    ])

    setPedidos(pData)
    setOrfaos(orphanData)
    setLoading(false)
  }, [clients, refMonth, refYear])

  // Pedidos sem vínculo agrupados pelo cliente do ERP — é esta lista que a
  // tela de vinculação usa para consertar o de-para.
  const orphanGroups = useMemo(() => {
    const map = new Map<string, OrphanGroup>()
    for (const o of orfaos) {
      const nome = (o.cliente_nome ?? '').trim() || 'Sem nome no ERP'
      const key  = o.cliente_id != null ? `id:${o.cliente_id}` : `nome:${nome}`
      const cur  = map.get(key)
      if (cur) { cur.qtd++; cur.valor += o.valor ?? 0; cur.nome = nome }
      else map.set(key, { key, clienteId: o.cliente_id ?? null, nome, qtd: 1, valor: o.valor ?? 0 })
    }
    return [...map.values()]
  }, [orfaos])

  const orphanValue = useMemo(() => orfaos.reduce((s, o) => s + (o.valor ?? 0), 0), [orfaos])
  const orphanCount = orfaos.length

  useEffect(() => { load() }, [load])

  const refMonthKey  = useMemo(() => monthKey(refYear, refMonth), [refYear, refMonth])
  const prevMonthKey = useMemo(() => {
    const d = subMonths(new Date(refYear, refMonth, 1), 1)
    return monthKey(d.getFullYear(), d.getMonth())
  }, [refYear, refMonth])

  // Últimos 12 meses, do mais antigo para o mais recente (para os gráficos)
  const last12Months = useMemo(() => {
    const keys: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(refYear, refMonth, 1), i)
      keys.push(monthKey(d.getFullYear(), d.getMonth()))
    }
    return keys
  }, [refYear, refMonth])
  const last12MonthsDesc = useMemo(() => [...last12Months].reverse(), [last12Months])

  // Map<clientId, Map<mesKey, {qtd,valor}>>
  const porClientePorMes = useMemo(() => {
    const map = new Map<string, Map<string, MesValor>>()
    for (const p of pedidos) {
      if (!p.crm_client_id) continue
      const mk = monthKeyBR(p.data_emissao)
      if (!map.has(p.crm_client_id)) map.set(p.crm_client_id, new Map())
      const clienteMeses = map.get(p.crm_client_id)!
      const cur = clienteMeses.get(mk) ?? { qtd: 0, valor: 0 }
      clienteMeses.set(mk, { qtd: cur.qtd + 1, valor: cur.valor + (p.valor ?? 0) })
    }
    return map
  }, [pedidos])

  const linhas = useMemo(() => clients.map(c => {
    const meses    = porClientePorMes.get(c.id)
    const atual    = meses?.get(refMonthKey)  ?? { qtd: 0, valor: 0 }
    const anterior = meses?.get(prevMonthKey) ?? { qtd: 0, valor: 0 }
    const variacaoPct = anterior.valor > 0
      ? ((atual.valor - anterior.valor) / anterior.valor) * 100
      : (atual.valor > 0 ? 100 : 0)
    return {
      cliente: c,
      pedidos: atual.qtd,
      total: atual.valor,
      ticket: atual.qtd > 0 ? atual.valor / atual.qtd : 0,
      totalAnterior: anterior.valor,
      variacaoPct,
      mesesSemCompra: contarMesesSemCompra(meses, last12MonthsDesc),
      sparkline: last12Months.map(mk => meses?.get(mk)?.valor ?? 0),
    }
  }), [clients, porClientePorMes, refMonthKey, prevMonthKey, last12Months, last12MonthsDesc])

  const linhasFiltradas = useMemo(() => {
    let arr = linhas
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(l => l.cliente.nome.toLowerCase().includes(q))
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      switch (sortCol) {
        case 'nome':      return a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR') * dir
        case 'pedidos':   return (a.pedidos - b.pedidos) * dir
        case 'ticket':    return (a.ticket - b.ticket) * dir
        case 'variacao':  return (a.variacaoPct - b.variacaoPct) * dir
        case 'total':
        default:          return (a.total - b.total) * dir
      }
    })
  }, [linhas, search, sortCol, sortDir])

  function toggleSort(col: SortCol) {
    if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortCol(col)
    setSortDir(col === 'nome' ? 'asc' : 'desc')
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={11} className="text-slate-300 dark:text-slate-600" />
    return sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
  }

  // KPIs do mês de referência
  const totalMes            = linhas.reduce((s, l) => s + l.total, 0)
  const pedidosMes          = linhas.reduce((s, l) => s + l.pedidos, 0)
  const clientesComCompra   = linhas.filter(l => l.pedidos > 0).length
  const ticketMedioGeral    = pedidosMes > 0 ? totalMes / pedidosMes : 0

  // Evolução geral (soma de todos os clientes de revenda por mês)
  const evolucaoGeral = useMemo(() => last12Months.map(mk => {
    let total = 0
    for (const meses of porClientePorMes.values()) total += meses.get(mk)?.valor ?? 0
    return { mes: mk, total }
  }), [last12Months, porClientePorMes])

  // Alertas
  const alertasQueda = useMemo(() =>
    linhas.filter(l => l.totalAnterior > 0 && l.total > 0 && l.variacaoPct <= -50)
      .sort((a, b) => b.totalAnterior - a.totalAnterior),
  [linhas])

  const alertasParou = useMemo(() =>
    linhas.filter(l => l.totalAnterior > 0 && l.total === 0)
      .sort((a, b) => b.totalAnterior - a.totalAnterior),
  [linhas])

  const alertasInativos = useMemo(() =>
    linhas.filter(l => l.mesesSemCompra >= 2 && l.cliente.status !== 'PERDIDO')
      .sort((a, b) => b.mesesSemCompra - a.mesesSemCompra),
  [linhas])

  async function marcarPerdendo(clientId: string) {
    if (!window.confirm('Marcar este cliente como "Perdendo"? Isso atualiza o status no cadastro do cliente.')) return
    await supabase.from('crm_clients').update({ status: 'PERDENDO' }).eq('id', clientId)
    await load()
  }

  const isLoading = loadingClients || loading

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Mês de referência</label>
          <select className="input w-36" value={refMonth} onChange={e => setRefMonth(Number(e.target.value))}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Ano</label>
          <select className="input w-24" value={refYear} onChange={e => setRefYear(Number(e.target.value))}>
            {getYears().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <label className="label">Buscar cliente</label>
          <Search className="absolute left-3 top-[calc(50%+7px)] -translate-y-1/2 text-slate-400" size={14} />
          <input
            className="input pl-8"
            placeholder="Nome do cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={load} disabled={isLoading} className="btn-secondary flex items-center gap-2 py-2">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            <Wallet size={12} className="text-orange-400" /> Total do mês
          </p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
            {isLoading ? <span className="animate-pulse text-slate-300">—</span> : fmtBRL(totalMes)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{MESES[refMonth]} / {refYear}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            <Users size={12} className="text-orange-400" /> Clientes com compra
          </p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
            {isLoading ? <span className="animate-pulse text-slate-300">—</span> : `${clientesComCompra}/${clients.length}`}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{pedidosMes} pedido{pedidosMes !== 1 ? 's' : ''} no mês</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
            <Package size={12} className="text-orange-400" /> Ticket médio
          </p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
            {isLoading ? <span className="animate-pulse text-slate-300">—</span> : fmtBRL(ticketMedioGeral)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">por pedido, no mês</p>
        </div>
        <button
          type="button"
          onClick={() => { if (orphanGroups.length) setShowVincular(true) }}
          disabled={isLoading || orphanGroups.length === 0}
          className="card p-4 text-left border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-900/10 enabled:hover:border-amber-300 enabled:hover:bg-amber-50 dark:enabled:hover:bg-amber-900/20 transition-colors disabled:cursor-default"
          title="Pedidos do Atacado no mês que não puderam ser vinculados automaticamente a nenhum cliente cadastrado — clique para fazer o de-para com o cadastro do CRM"
        >
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
            <HelpCircle size={12} /> Não vinculados (mês)
          </p>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
            {isLoading ? <span className="animate-pulse text-amber-200">—</span> : fmtBRL(orphanValue)}
          </p>
          <p className="text-[10px] text-amber-500 mt-0.5">
            {orphanCount} pedido{orphanCount !== 1 ? 's' : ''} sem cliente no Atacado
          </p>
          {!isLoading && orphanGroups.length > 0 && (
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <Link2 size={10} /> Vincular {orphanGroups.length} cliente{orphanGroups.length !== 1 ? 's' : ''} do ERP
            </p>
          )}
        </button>
      </div>

      {/* Alertas */}
      {!isLoading && (alertasQueda.length > 0 || alertasParou.length > 0 || alertasInativos.length > 0) && (
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" /> Alertas
          </h2>

          {alertasParou.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                <Ban size={11} /> Pararam de comprar este mês ({alertasParou.length})
              </p>
              {alertasParou.map(l => (
                <AlertRow key={l.cliente.id} l={l}
                  detail={`Comprava ${fmtBRL(l.totalAnterior)} em ${monthLabel(prevMonthKey)} · zero em ${monthLabel(refMonthKey)}`}
                  onHistorico={() => setHistoryClient({ id: l.cliente.id, nome: l.cliente.nome })}
                  onMarcarPerdendo={l.cliente.status !== 'PERDENDO' ? () => marcarPerdendo(l.cliente.id) : undefined}
                />
              ))}
            </div>
          )}

          {alertasQueda.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <TrendingDown size={11} /> Queda forte vs mês anterior ({alertasQueda.length})
              </p>
              {alertasQueda.map(l => (
                <AlertRow key={l.cliente.id} l={l}
                  detail={`${fmtBRL(l.totalAnterior)} → ${fmtBRL(l.total)} (${l.variacaoPct.toFixed(0)}%)`}
                  onHistorico={() => setHistoryClient({ id: l.cliente.id, nome: l.cliente.nome })}
                  onMarcarPerdendo={l.cliente.status !== 'PERDENDO' ? () => marcarPerdendo(l.cliente.id) : undefined}
                />
              ))}
            </div>
          )}

          {alertasInativos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <History size={11} /> Sem compra há 2+ meses ({alertasInativos.length})
              </p>
              {alertasInativos.map(l => (
                <AlertRow key={l.cliente.id} l={l}
                  detail={`${l.mesesSemCompra} meses seguidos sem pedido`}
                  onHistorico={() => setHistoryClient({ id: l.cliente.id, nome: l.cliente.nome })}
                  onMarcarPerdendo={l.cliente.status !== 'PERDENDO' ? () => marcarPerdendo(l.cliente.id) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evolução geral */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Evolução — todos os clientes de Revenda</h2>
        <p className="text-[11px] text-slate-400 mb-2">Últimos 12 meses, até {MESES[refMonth]}/{refYear}</p>
        {isLoading ? (
          <div className="h-36 flex items-center justify-center">
            <RefreshCw size={18} className="animate-spin text-orange-300" />
          </div>
        ) : (
          <EvolucaoChart data={evolucaoGeral} />
        )}
      </div>

      {/* Tabela por cliente */}
      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          Compras por cliente — {MESES[refMonth]} / {refYear}
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : linhasFiltradas.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">Nenhum cliente encontrado</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">
                  <th className="pb-2 font-medium pr-3">
                    <button onClick={() => toggleSort('nome')} className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300">
                      Cliente <SortIcon col="nome" />
                    </button>
                  </th>
                  <th className="pb-2 font-medium pr-3 text-right">
                    <button onClick={() => toggleSort('pedidos')} className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300">
                      Pedidos <SortIcon col="pedidos" />
                    </button>
                  </th>
                  <th className="pb-2 font-medium pr-3 text-right">
                    <button onClick={() => toggleSort('total')} className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300">
                      Total <SortIcon col="total" />
                    </button>
                  </th>
                  <th className="pb-2 font-medium pr-3 text-right hidden md:table-cell">
                    <button onClick={() => toggleSort('ticket')} className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300">
                      Ticket médio <SortIcon col="ticket" />
                    </button>
                  </th>
                  <th className="pb-2 font-medium pr-3 text-right hidden lg:table-cell">
                    <button onClick={() => toggleSort('variacao')} className="flex items-center gap-1 ml-auto hover:text-slate-600 dark:hover:text-slate-300">
                      Vs. mês ant. <SortIcon col="variacao" />
                    </button>
                  </th>
                  <th className="pb-2 font-medium pr-3 hidden xl:table-cell">Tendência (12m)</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {linhasFiltradas.map(l => (
                  <tr key={l.cliente.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${l.pedidos === 0 ? 'opacity-60' : ''}`}>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{l.cliente.nome}</span>
                      {l.pedidos === 0 && (
                        <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400">
                          sem compra
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-500 dark:text-slate-400 tabular-nums">{l.pedidos}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{fmtBRL(l.total)}</td>
                    <td className="py-2 pr-3 text-right text-slate-500 dark:text-slate-400 tabular-nums hidden md:table-cell">
                      {l.pedidos > 0 ? fmtBRL(l.ticket) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums hidden lg:table-cell">
                      {l.totalAnterior === 0 && l.total === 0 ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span className={l.variacaoPct > 0 ? 'text-green-600 dark:text-green-400 font-medium' : l.variacaoPct < 0 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-slate-400'}>
                          {l.variacaoPct > 0 ? '+' : ''}{l.variacaoPct.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 hidden xl:table-cell">
                      <MiniBars values={l.sparkline} />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => setHistoryClient({ id: l.cliente.id, nome: l.cliente.nome })}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-orange-500 transition-colors"
                        title="Ver histórico de pedidos"
                      >
                        <History size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 dark:border-slate-600">
                <tr>
                  <td className="pt-2.5 font-bold text-slate-800 dark:text-slate-100">Total ({linhasFiltradas.length} clientes)</td>
                  <td className="pt-2.5 text-right font-bold tabular-nums">{linhasFiltradas.reduce((s, l) => s + l.pedidos, 0)}</td>
                  <td className="pt-2.5 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtBRL(linhasFiltradas.reduce((s, l) => s + l.total, 0))}</td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden lg:table-cell" />
                  <td className="hidden xl:table-cell" />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {historyClient && (
        <ClientHistoryModal
          clientId={historyClient.id}
          clienteName={historyClient.nome}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {showVincular && (
        <VincularClientesModal
          groups={orphanGroups}
          clients={clients}
          periodo={`${MESES[refMonth]}/${refYear}`}
          onClose={() => setShowVincular(false)}
          onSaved={() => { setShowVincular(false); load() }}
        />
      )}
    </div>
  )
}

function AlertRow({ l, detail, onHistorico, onMarcarPerdendo }: {
  l: { cliente: Client }
  detail: string
  onHistorico: () => void
  onMarcarPerdendo?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 text-xs">
      <div className="min-w-0">
        <p className="font-semibold text-slate-700 dark:text-slate-200 truncate">{l.cliente.nome}</p>
        <p className="text-slate-400">{detail}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onMarcarPerdendo && (
          <button
            onClick={onMarcarPerdendo}
            className="px-2 py-1 rounded-lg text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors whitespace-nowrap"
          >
            Marcar Perdendo
          </button>
        )}
        <button onClick={onHistorico} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 hover:text-orange-500 transition-colors" title="Ver histórico">
          <History size={13} />
        </button>
      </div>
    </div>
  )
}
