import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, X, Pencil, Trash2, FileText, TrendingUp, Clock, AlertTriangle, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client } from '../types'

interface CobrancaRecord {
  id: number
  crm_client_id: string | null
  cliente_nome: string
  tipo: 'NOTA' | 'BOLETO'
  numero: string | null
  empresa: 'CANTINA' | 'LUMAR'
  data_emissao: string | null
  valor: number
  situacao: 'EM ABERTO' | 'PAGO' | 'PROTESTO'
  data_pagamento: string | null
  observacao: string | null
  created_at: string
}

const SITUACAO_COLORS: Record<string, string> = {
  'EM ABERTO': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200',
  'PAGO':      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200',
  'PROTESTO':  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200',
}

const AGING_BUCKETS = [
  { label: '< 30 dias',     min: 0,   max: 29,        bar: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20',  border: 'border-green-200 dark:border-green-800'  },
  { label: '30–60 dias',    min: 30,  max: 59,        bar: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800' },
  { label: '60–90 dias',    min: 60,  max: 89,        bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
  { label: '90–180 dias',   min: 90,  max: 179,       bar: 'bg-red-500',    text: 'text-red-700 dark:text-red-400',       bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800'       },
  { label: '180+ dias',     min: 180, max: Infinity,  bar: 'bg-purple-600', text: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800' },
] as const

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function diasAberto(dataEmissao: string | null): number {
  if (!dataEmissao) return 0
  return Math.floor((Date.now() - new Date(dataEmissao + 'T12:00:00').getTime()) / 86400000)
}

function agingStyle(dias: number) {
  if (dias < 30)  return { badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',  label: `${dias}d` }
  if (dias < 60)  return { badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', label: `${dias}d` }
  if (dias < 90)  return { badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400', label: `${dias}d` }
  if (dias < 180) return { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',           label: `${dias}d` }
  return                 { badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', label: `${dias}d` }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CobrancaPage() {
  const [records,        setRecords]        = useState<CobrancaRecord[]>([])
  const [clients,        setClients]        = useState<Pick<Client, 'id' | 'nome'>[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [editingRecord,  setEditingRecord]  = useState<CobrancaRecord | null>(null)
  const [situacaoFilter, setSituacaoFilter] = useState<string>('EM ABERTO')
  const [empresaFilter,  setEmpresaFilter]  = useState<string>('TODOS')
  const [search,         setSearch]         = useState('')
  const [analysisTab,    setAnalysisTab]    = useState<'ranking' | 'aging' | 'oldest'>('ranking')
  const [showAnalysis,   setShowAnalysis]   = useState(true)

  async function loadData() {
    setLoading(true)
    const [{ data: recs }, { data: cls }] = await Promise.all([
      supabase.from('cobranca').select('*').order('data_emissao', { ascending: false }),
      supabase.from('crm_clients').select('id, nome').order('nome'),
    ])
    setRecords((recs ?? []) as CobrancaRecord[])
    setClients((cls ?? []) as Pick<Client, 'id' | 'nome'>[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function deleteRecord(id: number) {
    if (!confirm('Excluir este lançamento?')) return
    await supabase.from('cobranca').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  // ─── Base filters ────────────────────────────────────────────
  const filtered = useMemo(() => records.filter(r => {
    if (situacaoFilter !== 'TODOS' && r.situacao !== situacaoFilter) return false
    if (empresaFilter  !== 'TODOS' && r.empresa  !== empresaFilter)  return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!r.cliente_nome.toLowerCase().includes(q)) return false
    }
    return true
  }), [records, situacaoFilter, empresaFilter, search])

  // ─── KPI memos ──────────────────────────────────────────────
  const openRecords    = useMemo(() => records.filter(r => r.situacao === 'EM ABERTO'), [records])
  const totalAberto    = useMemo(() => openRecords.reduce((s, r) => s + r.valor, 0), [openRecords])
  const totalProtesto  = useMemo(() => records.filter(r => r.situacao === 'PROTESTO').reduce((s, r) => s + r.valor, 0), [records])
  const filteredAberto = useMemo(() => filtered.filter(r => r.situacao === 'EM ABERTO').reduce((s, r) => s + r.valor, 0), [filtered])

  // ─── Analysis memos ─────────────────────────────────────────
  const topDebtors = useMemo(() => {
    const map = new Map<string, { total: number; count: number; empresas: string[] }>()
    openRecords.forEach(r => {
      const ex = map.get(r.cliente_nome)
      if (ex) {
        ex.total += r.valor
        ex.count++
        if (!ex.empresas.includes(r.empresa)) ex.empresas.push(r.empresa)
      } else {
        map.set(r.cliente_nome, { total: r.valor, count: 1, empresas: [r.empresa] })
      }
    })
    return [...map.entries()]
      .map(([nome, d]) => ({ nome, ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [openRecords])

  const agingData = useMemo(() => {
    return AGING_BUCKETS.map(b => {
      const items = openRecords.filter(r => {
        const d = diasAberto(r.data_emissao)
        return d >= b.min && d <= b.max
      })
      return { ...b, total: items.reduce((s, r) => s + r.valor, 0), count: items.length }
    })
  }, [openRecords])

  const oldestItems = useMemo(() =>
    [...openRecords]
      .filter(r => r.data_emissao)
      .map(r => ({ ...r, dias: diasAberto(r.data_emissao) }))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 10)
  , [openRecords])

  const maxDebt = topDebtors[0]?.total ?? 1

  function filterByClient(nome: string) {
    setSearch(nome)
    setSituacaoFilter('EM ABERTO')
    setShowAnalysis(false)
  }

  function openNew() { setEditingRecord(null); setShowModal(true) }
  function openEdit(r: CobrancaRecord) { setEditingRecord(r); setShowModal(true) }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <FileText size={22} className="text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Cobrança</h1>
            <p className="text-xs text-slate-400">Controle de notas e boletos a receber</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} /> Novo Lançamento
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total em Aberto</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmtCurrency(totalAberto)}</p>
          <p className="text-[10px] text-slate-400">{openRecords.length} lançamentos</p>
        </div>
        <div className="card p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Em Protesto</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{fmtCurrency(totalProtesto)}</p>
          <p className="text-[10px] text-slate-400">{records.filter(r => r.situacao === 'PROTESTO').length} lançamentos</p>
        </div>
        <div className="card p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Clientes inadimplentes</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{topDebtors.length}</p>
          <p className="text-[10px] text-slate-400">com ao menos 1 nota aberta</p>
        </div>
        <div className="card p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Vencimento crítico</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
            {fmtCurrency(agingData.filter(b => b.min >= 90).reduce((s, b) => s + b.total, 0))}
          </p>
          <p className="text-[10px] text-slate-400">90+ dias em aberto</p>
        </div>
      </div>

      {/* ── Analysis Panel ── */}
      {!loading && openRecords.length > 0 && (
        <div className="card overflow-hidden">
          {/* Panel header */}
          <button
            onClick={() => setShowAnalysis(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <BarChart2 size={15} className="text-orange-500" />
              Análise de Cobrança
            </span>
            {showAnalysis ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
          </button>

          {showAnalysis && (
            <>
              {/* Tabs */}
              <div className="flex border-t border-b border-slate-100 dark:border-slate-700">
                {([
                  { id: 'ranking', label: 'Maiores Devedores', icon: TrendingUp },
                  { id: 'aging',   label: 'Envelhecimento',    icon: Clock },
                  { id: 'oldest',  label: 'Mais Antigos',      icon: AlertTriangle },
                ] as const).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setAnalysisTab(id)}
                    className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      analysisTab === id
                        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-b-2 border-orange-500'
                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Ranking ── */}
              {analysisTab === 'ranking' && (
                <div className="p-4 space-y-2">
                  <p className="text-[10px] text-slate-400 mb-3">Clique em um cliente para filtrar a tabela abaixo.</p>
                  {topDebtors.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">Nenhum valor em aberto.</p>
                  ) : topDebtors.map((d, i) => (
                    <button
                      key={d.nome}
                      onClick={() => filterByClient(d.nome)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {/* Rank badge */}
                        <span className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                          i === 0 ? 'bg-amber-400 text-white' :
                          i === 1 ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200' :
                          i === 2 ? 'bg-orange-300 text-white' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}>{i + 1}</span>

                        {/* Client name */}
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate flex-1 group-hover:text-orange-500 transition-colors">
                          {d.nome}
                        </p>

                        {/* Empresa badges */}
                        <div className="flex gap-1 shrink-0">
                          {d.empresas.map(e => (
                            <span key={e} className={`text-[9px] font-bold px-1 py-0.5 rounded ${e === 'CANTINA' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                              {e}
                            </span>
                          ))}
                        </div>

                        {/* Count */}
                        <span className="text-[10px] text-slate-400 shrink-0">{d.count} nota{d.count !== 1 ? 's' : ''}</span>

                        {/* Value */}
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0 min-w-[80px] text-right">
                          {fmtCurrency(d.total)}
                        </span>
                      </div>

                      {/* Bar */}
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden ml-7">
                        <div
                          className={`h-full rounded-full transition-all ${i === 0 ? 'bg-amber-500' : i <= 2 ? 'bg-orange-400' : 'bg-slate-400 dark:bg-slate-500'}`}
                          style={{ width: `${(d.total / maxDebt) * 100}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Tab: Aging ── */}
              {analysisTab === 'aging' && (
                <div className="p-4">
                  <p className="text-[10px] text-slate-400 mb-3">Distribuição do valor em aberto por idade da nota (dias desde a emissão).</p>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {agingData.map(b => {
                      const pct = totalAberto > 0 ? (b.total / totalAberto) * 100 : 0
                      return (
                        <div key={b.label} className={`rounded-xl border p-3 ${b.bg} ${b.border}`}>
                          <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${b.text}`}>{b.label}</p>
                          <p className={`text-base font-bold ${b.text}`}>{fmtCurrency(b.total)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{b.count} nota{b.count !== 1 ? 's' : ''}</p>

                          {/* % bar */}
                          <div className="mt-2 h-1 rounded-full bg-white/60 dark:bg-black/20 overflow-hidden">
                            <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[9px] text-slate-400 mt-0.5 text-right">{pct.toFixed(0)}% do total</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary line */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                    {(() => {
                      const critical = agingData.filter(b => b.min >= 60)
                      const critTotal = critical.reduce((s, b) => s + b.total, 0)
                      const critCount = critical.reduce((s, b) => s + b.count, 0)
                      return critCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          ⚠ {critCount} nota{critCount !== 1 ? 's' : ''} com 60+ dias em aberto totalizando {fmtCurrency(critTotal)}
                        </span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">Nenhuma nota com mais de 60 dias em aberto.</span>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* ── Tab: Oldest ── */}
              {analysisTab === 'oldest' && (
                <div className="p-4">
                  <p className="text-[10px] text-slate-400 mb-3">Notas EM ABERTO ordenadas pelo maior tempo sem pagamento.</p>
                  {oldestItems.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">Nenhuma nota em aberto.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[560px]">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-700">
                            <th className="pb-2 font-semibold">Dias</th>
                            <th className="pb-2 font-semibold pl-3">Cliente</th>
                            <th className="pb-2 font-semibold pl-3">Empresa</th>
                            <th className="pb-2 font-semibold pl-3">Emissão</th>
                            <th className="pb-2 font-semibold pl-3 text-right">Valor</th>
                            <th className="pb-2 font-semibold pl-3">Obs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {oldestItems.map(r => {
                            const style = agingStyle(r.dias)
                            return (
                              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="py-2 shrink-0">
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${style.badge}`}>
                                    {r.dias}d
                                  </span>
                                </td>
                                <td className="py-2 pl-3">
                                  <button
                                    onClick={() => filterByClient(r.cliente_nome)}
                                    className="font-semibold text-slate-800 dark:text-slate-100 hover:text-orange-500 transition-colors truncate max-w-[180px] text-left"
                                  >
                                    {r.cliente_nome}
                                  </button>
                                </td>
                                <td className="py-2 pl-3">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.empresa === 'CANTINA' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                                    {r.empresa}
                                  </span>
                                </td>
                                <td className="py-2 pl-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(r.data_emissao)}</td>
                                <td className="py-2 pl-3 text-right font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">{fmtCurrency(r.valor)}</td>
                                <td className="py-2 pl-3 text-slate-400 max-w-[120px] truncate text-[10px]" title={r.observacao ?? ''}>{r.observacao ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {(['TODOS', 'EM ABERTO', 'PAGO', 'PROTESTO'] as const).map(s => (
            <button key={s} onClick={() => setSituacaoFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                situacaoFilter === s
                  ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}>
              {s === 'TODOS' ? 'Todas' : s}
            </button>
          ))}
          <select
            value={empresaFilter}
            onChange={e => setEmpresaFilter(e.target.value)}
            className="input w-auto text-xs"
          >
            <option value="TODOS">Todas empresas</option>
            <option value="CANTINA">CANTINA</option>
            <option value="LUMAR">LUMAR</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-20" />
          <p>Nenhum lançamento encontrado</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 font-semibold">Número</th>
                  <th className="px-3 py-2.5 font-semibold">Empresa</th>
                  <th className="px-3 py-2.5 font-semibold">Emissão</th>
                  <th className="px-3 py-2.5 font-semibold">Dias</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                  <th className="px-3 py-2.5 font-semibold">Situação</th>
                  <th className="px-3 py-2.5 font-semibold">Pgto</th>
                  <th className="px-3 py-2.5 font-semibold">Obs</th>
                  <th className="px-3 py-2.5 w-14"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map(r => {
                  const dias = r.situacao === 'EM ABERTO' ? diasAberto(r.data_emissao) : null
                  const style = dias !== null ? agingStyle(dias) : null
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        r.situacao === 'EM ABERTO' && dias !== null && dias >= 90
                          ? 'bg-red-50/30 dark:bg-red-900/5'
                          : r.situacao === 'EM ABERTO'
                          ? 'bg-amber-50/20 dark:bg-amber-900/5'
                          : r.situacao === 'PROTESTO'
                          ? 'bg-red-50/40 dark:bg-red-900/8'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 max-w-[200px] truncate" title={r.cliente_nome}>{r.cliente_nome}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.tipo}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.numero ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.empresa === 'CANTINA' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                          {r.empresa}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(r.data_emissao)}</td>
                      <td className="px-3 py-2">
                        {style && dias !== null ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${style.badge}`}>{dias}d</span>
                        ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{fmtCurrency(r.valor)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${SITUACAO_COLORS[r.situacao] ?? ''}`}>
                          {r.situacao}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(r.data_pagamento)}</td>
                      <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate" title={r.observacao ?? ''}>{r.observacao ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(r)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-orange-500 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => deleteRecord(r.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
            {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}
            {filteredAberto > 0 && ` · ${fmtCurrency(filteredAberto)} em aberto`}
          </div>
        </div>
      )}

      {showModal && (
        <CobrancaModal
          record={editingRecord}
          clients={clients}
          onClose={() => { setShowModal(false); setEditingRecord(null) }}
          onSaved={loadData}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface CobrancaModalProps {
  record: CobrancaRecord | null
  clients: Pick<Client, 'id' | 'nome'>[]
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  crm_client_id: string
  cliente_nome: string
  tipo: 'NOTA' | 'BOLETO'
  numero: string
  empresa: 'CANTINA' | 'LUMAR'
  data_emissao: string
  valor: string
  situacao: 'EM ABERTO' | 'PAGO' | 'PROTESTO'
  data_pagamento: string
  observacao: string
}

const EMPTY_FORM: FormState = {
  crm_client_id: '',
  cliente_nome: '',
  tipo: 'NOTA',
  numero: '',
  empresa: 'CANTINA',
  data_emissao: new Date().toISOString().slice(0, 10),
  valor: '',
  situacao: 'EM ABERTO',
  data_pagamento: '',
  observacao: '',
}

function CobrancaModal({ record, clients, onClose, onSaved }: CobrancaModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    record
      ? {
          crm_client_id:  record.crm_client_id ?? '',
          cliente_nome:   record.cliente_nome,
          tipo:           record.tipo,
          numero:         record.numero ?? '',
          empresa:        record.empresa,
          data_emissao:   record.data_emissao ?? new Date().toISOString().slice(0, 10),
          valor:          String(record.valor),
          situacao:       record.situacao,
          data_pagamento: record.data_pagamento ?? '',
          observacao:     record.observacao ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)

  function f<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleClientSelect(clientId: string) {
    const client = clients.find(c => c.id === clientId)
    setForm(prev => ({
      ...prev,
      crm_client_id: clientId,
      cliente_nome:  client?.nome ?? prev.cliente_nome,
    }))
  }

  async function handleSave() {
    if (!form.cliente_nome.trim()) return
    setSaving(true)
    const payload = {
      crm_client_id:  form.crm_client_id || null,
      cliente_nome:   form.cliente_nome.trim(),
      tipo:           form.tipo,
      numero:         form.numero.trim() || null,
      empresa:        form.empresa,
      data_emissao:   form.data_emissao || null,
      valor:          parseFloat(form.valor) || 0,
      situacao:       form.situacao,
      data_pagamento: form.data_pagamento || null,
      observacao:     form.observacao.trim() || null,
      updated_at:     new Date().toISOString(),
    }
    if (record) {
      await supabase.from('cobranca').update(payload).eq('id', record.id)
    } else {
      await supabase.from('cobranca').insert(payload)
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">
            {record ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Cliente */}
          <div>
            <label className="label">Cliente (Clientes Atacado)</label>
            <select
              value={form.crm_client_id}
              onChange={e => handleClientSelect(e.target.value)}
              className="input"
            >
              <option value="">— selecionar cliente —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {!form.crm_client_id && (
              <input
                className="input mt-2"
                placeholder="Ou digitar nome manualmente..."
                value={form.cliente_nome}
                onChange={e => f('cliente_nome', e.target.value)}
              />
            )}
          </div>

          {/* Tipo + Número + Empresa */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select value={form.tipo} onChange={e => f('tipo', e.target.value as 'NOTA' | 'BOLETO')} className="input">
                <option value="NOTA">NOTA</option>
                <option value="BOLETO">BOLETO</option>
              </select>
            </div>
            <div>
              <label className="label">Número</label>
              <input
                className="input font-mono"
                placeholder="Ex.: 1234"
                value={form.numero}
                onChange={e => f('numero', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Empresa</label>
              <select value={form.empresa} onChange={e => f('empresa', e.target.value as 'CANTINA' | 'LUMAR')} className="input">
                <option value="CANTINA">CANTINA</option>
                <option value="LUMAR">LUMAR</option>
              </select>
            </div>
          </div>

          {/* Situação */}
          <div>
            <label className="label">Situação</label>
            <select value={form.situacao} onChange={e => f('situacao', e.target.value as 'EM ABERTO' | 'PAGO' | 'PROTESTO')} className="input">
              <option value="EM ABERTO">EM ABERTO</option>
              <option value="PAGO">PAGO</option>
              <option value="PROTESTO">PROTESTO</option>
            </select>
          </div>

          {/* Data emissão + Data pagamento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data de emissão</label>
              <input type="date" value={form.data_emissao} onChange={e => f('data_emissao', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">
                Data de pagamento
                {form.situacao === 'EM ABERTO' && <span className="ml-1 text-slate-400 font-normal">(opcional)</span>}
              </label>
              <input type="date" value={form.data_pagamento} onChange={e => f('data_pagamento', e.target.value)} className="input" />
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="label">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valor} onChange={e => f('valor', e.target.value)} className="input" placeholder="0,00" />
          </div>

          {/* Observação */}
          <div>
            <label className="label">Observação</label>
            <input
              value={form.observacao}
              onChange={e => f('observacao', e.target.value)}
              className="input"
              placeholder="Ex.: UMA NOTA PELA OUTRA, CARTÓRIO..."
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-2 justify-end sticky bottom-0 bg-white dark:bg-slate-800">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.cliente_nome.trim()} className="btn-primary">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
