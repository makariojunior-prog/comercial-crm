import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Handshake, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, Undo2, Save,
  ChevronDown, ChevronUp, Lock, History, AlertCircle, UserCheck,
} from 'lucide-react'
import {
  addMonths, addWeeks, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtCurrency, fmtDate } from '../lib/format'

// Mesma data de corte da função crm_comite_clientes (clientes com 1ª compra a partir daqui).
const CORTE = '2026-10-01'

type Modo = 'pendentes' | 'semana' | 'quinzena' | 'mes'

interface ClienteComite {
  client_id: string
  nome: string
  tipo: string | null
  rota: string | null
  carteira: string | null
  primeira_compra: string
  n_pedidos: number
  total: number
  indicador_nome: string | null
  comite_realizado_em: string | null
  comite_observacoes: string | null
}

interface Pedido {
  crm_client_id: string
  numero_pedido: number | null
  valor: number
  data_entrega: string | null
  data_emissao: string | null
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function quinzenaDe(d: Date) {
  const y = d.getFullYear(), m = d.getMonth()
  return d.getDate() <= 15
    ? { ini: new Date(y, m, 1), fim: new Date(y, m, 15) }
    : { ini: new Date(y, m, 16), fim: endOfMonth(d) }
}

function moverQuinzena(d: Date, dir: 1 | -1) {
  const y = d.getFullYear(), m = d.getMonth(), primeira = d.getDate() <= 15
  if (dir < 0) return primeira ? new Date(y, m - 1, 16) : new Date(y, m, 1)
  return primeira ? new Date(y, m, 16) : new Date(y, m + 1, 1)
}

const segBtn = (ativo: boolean) =>
  `px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
    ativo
      ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
  }`

export default function ComiteClientes() {
  const { isAdmin } = useAuth()
  const [modo, setModo]       = useState<Modo>('pendentes')
  const [ancora, setAncora]   = useState(() => new Date())
  const [mostrarRealizados, setMostrarRealizados] = useState(false)
  const [clientes, setClientes] = useState<ClienteComite[]>([])
  const [pedidos, setPedidos]   = useState<Record<string, Pedido[]>>({})
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({})
  const [abertos, setAbertos]   = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const periodo = useMemo(() => {
    if (modo === 'semana') {
      const ini = startOfWeek(ancora, { weekStartsOn: 1 }), fim = endOfWeek(ancora, { weekStartsOn: 1 })
      return { ini: iso(ini), fim: iso(fim), label: `Semana de ${format(ini, 'dd/MM')} a ${format(fim, 'dd/MM/yyyy')}` }
    }
    if (modo === 'quinzena') {
      const q = quinzenaDe(ancora)
      return { ini: iso(q.ini), fim: iso(q.fim), label: `Quinzena de ${format(q.ini, 'dd/MM')} a ${format(q.fim, 'dd/MM/yyyy')}` }
    }
    if (modo === 'mes') {
      const ini = startOfMonth(ancora), fim = endOfMonth(ancora)
      return { ini: iso(ini), fim: iso(fim), label: format(ini, "MMMM 'de' yyyy", { locale: ptBR }) }
    }
    return { ini: CORTE, fim: '2100-01-01', label: `Todos os clientes novos pendentes (desde ${fmtDate(CORTE)})` }
  }, [modo, ancora])

  const carregar = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.rpc('crm_comite_clientes', {
      p_ini: periodo.ini, p_fim: periodo.fim, p_incluir_realizados: mostrarRealizados,
    })
    if (err) { setError(err.message); setClientes([]); setLoading(false); return }
    const rows = ((data ?? []) as ClienteComite[]).map(r => ({ ...r, total: Number(r.total) }))
    setClientes(rows)
    setRascunhos(Object.fromEntries(rows.map(r => [r.client_id, r.comite_observacoes ?? ''])))

    const ids = rows.map(r => r.client_id)
    const porCliente: Record<string, Pedido[]> = {}
    if (ids.length > 0) {
      const { data: ped } = await supabase
        .from('atacado_pedidos')
        .select('crm_client_id, numero_pedido, valor, data_entrega, data_emissao')
        .in('crm_client_id', ids)
        .eq('tipo', 'PEDIDO')
        .eq('ignorado', false)
        .order('data_entrega', { ascending: true })
      for (const p of (ped ?? []) as Pedido[]) (porCliente[p.crm_client_id] ??= []).push(p)
    }
    setPedidos(porCliente)
    setLoading(false)
  }, [isAdmin, periodo.ini, periodo.fim, mostrarRealizados])

  useEffect(() => { carregar() }, [carregar])

  function mover(dir: 1 | -1) {
    setAncora(a => modo === 'semana' ? addWeeks(a, dir) : modo === 'mes' ? addMonths(a, dir) : moverQuinzena(a, dir))
  }

  async function atualizar(c: ClienteComite, realizado: boolean) {
    setSalvando(c.client_id); setError(null)
    const obs = rascunhos[c.client_id] ?? ''
    const { error: err } = await supabase.rpc('crm_comite_atualizar', {
      p_client_id: c.client_id, p_obs: obs, p_realizado: realizado,
    })
    setSalvando(null)
    if (err) { setError(err.message); return }
    const agora = new Date().toISOString()
    setClientes(prev => {
      const novo = prev.map(x => x.client_id === c.client_id
        ? { ...x, comite_observacoes: obs.trim() || null, comite_realizado_em: realizado ? (x.comite_realizado_em ?? agora) : x.comite_realizado_em }
        : x)
      return realizado && !mostrarRealizados ? novo.filter(x => x.client_id !== c.client_id) : novo
    })
  }

  async function reabrir(c: ClienteComite) {
    setSalvando(c.client_id); setError(null)
    const { error: err } = await supabase.rpc('crm_comite_reabrir', { p_client_id: c.client_id })
    setSalvando(null)
    if (err) { setError(err.message); return }
    setClientes(prev => prev.map(x => x.client_id === c.client_id ? { ...x, comite_realizado_em: null } : x))
  }

  function alternarCompras(id: string) {
    setAbertos(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  if (!isAdmin) {
    return (
      <div className="card p-10 text-center text-slate-400 max-w-md mx-auto">
        <Lock size={28} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">O Comitê de clientes é exclusivo para Administradores.</p>
      </div>
    )
  }

  const pendentes = clientes.filter(c => !c.comite_realizado_em).length

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Handshake size={20} className="text-orange-500" /> Comitê de clientes
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Clientes novos do atacado (primeira compra a partir de {fmtDate(CORTE)}) que ainda não passaram pelo comitê.
          </p>
        </div>
        <button onClick={carregar} disabled={loading} className="btn-secondary flex items-center gap-2 py-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
            {([['pendentes', 'Todos pendentes'], ['semana', 'Semana'], ['quinzena', 'Quinzena'], ['mes', 'Mês']] as const).map(([m, label]) => (
              <button key={m} onClick={() => { setModo(m); setAncora(new Date()) }} className={segBtn(modo === m)}>{label}</button>
            ))}
          </div>
          {modo !== 'pendentes' && (
            <div className="flex items-center gap-1">
              <button onClick={() => mover(-1)} className="btn-ghost p-1.5" title="Período anterior"><ChevronLeft size={16} /></button>
              <button onClick={() => mover(1)} className="btn-ghost p-1.5" title="Próximo período"><ChevronRight size={16} /></button>
            </div>
          )}
          <button
            onClick={() => setMostrarRealizados(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              mostrarRealizados
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <History size={13} /> {mostrarRealizados ? 'Mostrando realizados' : 'Mostrar realizados'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
          {periodo.label} · <strong>{pendentes}</strong> pendente{pendentes !== 1 ? 's' : ''}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
      ) : clientes.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400 opacity-60" />
          <p className="text-sm">Nenhum cliente novo pendente de comitê neste período.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clientes.map(c => {
            const feito = !!c.comite_realizado_em
            const lista = pedidos[c.client_id] ?? []
            const rascunho = rascunhos[c.client_id] ?? ''
            const alterado = rascunho.trim() !== (c.comite_observacoes ?? '').trim()
            const aberto = abertos.has(c.client_id)
            return (
              <div key={c.client_id} className={`card p-4 space-y-3 ${feito ? 'border-green-200 dark:border-green-800/40 bg-green-50/30 dark:bg-green-900/10' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{c.nome}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {c.tipo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{c.tipo}</span>}
                      {c.rota && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300">{c.rota}</span>}
                      {c.carteira && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300">{c.carteira}</span>}
                      {c.indicador_nome && (
                        <span className="text-[10px] font-medium text-slate-500 inline-flex items-center gap-1"><UserCheck size={11} /> indicado por {c.indicador_nome}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                    <p>1ª compra: <strong className="text-slate-700 dark:text-slate-200">{fmtDate(c.primeira_compra)}</strong></p>
                    <p>{c.n_pedidos} pedido{c.n_pedidos !== 1 ? 's' : ''} · <strong className="text-slate-700 dark:text-slate-200">{fmtCurrency(c.total)}</strong></p>
                  </div>
                </div>

                {lista.length > 0 && (
                  <div>
                    <button onClick={() => alternarCompras(c.client_id)} className="text-[11px] font-semibold text-orange-500 hover:underline inline-flex items-center gap-1">
                      {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {aberto ? 'Ocultar compras' : `Ver compras (${lista.length})`}
                    </button>
                    {aberto && (
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-700">
                            <th className="pb-1 font-medium">Pedido</th>
                            <th className="pb-1 font-medium">Data</th>
                            <th className="pb-1 font-medium text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {lista.map((p, i) => (
                            <tr key={i}>
                              <td className="py-1 font-mono text-slate-500">#{p.numero_pedido ?? '—'}</td>
                              <td className="py-1 text-slate-600 dark:text-slate-300">{fmtDate(p.data_entrega ?? p.data_emissao?.substring(0, 10) ?? null)}</td>
                              <td className="py-1 text-right font-medium text-slate-700 dark:text-slate-200 tabular-nums">{fmtCurrency(Number(p.valor))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                <div>
                  <label className="label text-xs">Observações do comitê (ficam no cadastro do cliente)</label>
                  <textarea
                    className="input resize-none"
                    rows={3}
                    value={rascunho}
                    onChange={e => setRascunhos(prev => ({ ...prev, [c.client_id]: e.target.value }))}
                    placeholder="O que foi alinhado com a equipe sobre este cliente…"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {alterado && (
                    <button onClick={() => atualizar(c, false)} disabled={salvando === c.client_id} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      <Save size={13} /> Salvar observação
                    </button>
                  )}
                  {feito ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <CheckCircle2 size={12} /> Comitê realizado em {format(parseISO(c.comite_realizado_em!), 'dd/MM/yyyy')}
                      </span>
                      <button onClick={() => reabrir(c)} disabled={salvando === c.client_id} className="btn-ghost text-xs py-1.5 px-2 flex items-center gap-1">
                        <Undo2 size={12} /> Reabrir
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => atualizar(c, true)}
                      disabled={salvando === c.client_id}
                      className="ml-auto py-2 px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} /> {salvando === c.client_id ? 'Salvando…' : 'Comitê realizado'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
