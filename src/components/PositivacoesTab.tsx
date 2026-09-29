import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RefreshCw, Star, Clock, CheckCircle2, Banknote, Download, Undo2, AlertTriangle, Archive, Send,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtDateSimple, MESES, getYears } from '../lib/comissao'

const META_PEDIDOS  = 3
const META_VALOR    = 500
const META_COMISSAO = 50

interface UserOpt { id: string; nome: string; colaborador_id: string | null }

interface ClienteRow {
  id: string
  nome: string
  tipo: string | null
  indicador_user_id: string
  positivado: boolean
  positivado_em: string | null
  comissao_status: string | null
  comissao_valor: number | null
  comissao_pago_em: string | null
  comissao_periodo_fim: string | null
  positivacao_pedidos: number | null
  positivacao_total: number | null
  n_pedidos: number
  total_compras: number
}

type Sub = 'ativas' | 'arquivo'
type Mode = 'todos' | 'mensal' | 'periodo'

function ProgressBar({ value, max, label, isMoney }: { value: number; max: number; label: string; isMoney?: boolean }) {
  const pct = Math.min(100, (value / max) * 100)
  const done = value >= max
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-400">{label}</span>
        <span className={done ? 'text-green-600 font-bold' : 'text-slate-500'}>
          {isMoney ? fmtBRL(value) : value} / {isMoney ? fmtBRL(max) : max}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const segBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
    active
      ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
  }`

export default function PositivacoesTab() {
  const { profile, isAdmin } = useAuth()
  const selfId = profile?.id ?? ''
  const now = new Date()

  const [sub, setSub]           = useState<Sub>('ativas')
  const [mode, setMode]         = useState<Mode>('todos')
  const [mes, setMes]           = useState(now.getMonth())
  const [ano, setAno]           = useState(now.getFullYear())
  const [dataIni, setDataIni]   = useState('')
  const [dataFim, setDataFim]   = useState('')
  const [filtro, setFiltro]     = useState('TODOS')
  const [users, setUsers]       = useState<UserOpt[]>([])
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const nomeIndicador = (id: string) => userMap.get(id)?.nome ?? '—'

  useEffect(() => {
    supabase.from('crm_users').select('id, nome, colaborador_id').eq('ativo', true).order('nome')
      .then(({ data }) => setUsers((data ?? []) as UserOpt[]))
  }, [])

  const alvo = isAdmin ? filtro : selfId

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let q = supabase
      .from('crm_clients')
      .select('id, nome, tipo, indicador_user_id, positivado, positivado_em, comissao_status, comissao_valor, comissao_pago_em, comissao_periodo_fim, positivacao_pedidos, positivacao_total')
      .not('indicador_user_id', 'is', null)
      .order('nome')
    if (alvo !== 'TODOS') q = q.eq('indicador_user_id', alvo)

    const { data, error: err } = await q
    if (err) { setError(err.message); setClientes([]); setLoading(false); return }
    const rows = (data ?? []) as Omit<ClienteRow, 'n_pedidos' | 'total_compras'>[]

    // Progresso só interessa a quem ainda não foi positivado
    const abertos = rows.filter(c => !c.positivado).map(c => c.id)
    const agg = new Map<string, { n: number; total: number }>()
    if (abertos.length > 0) {
      const { data: pData } = await supabase
        .from('atacado_pedidos')
        .select('crm_client_id, valor')
        .in('crm_client_id', abertos)
        .neq('tipo', 'BONIFICACAO')
        .neq('tipo', 'CANCELADO')
        .eq('ignorado', false)
      for (const p of (pData ?? [])) {
        if (!p.crm_client_id) continue
        const cur = agg.get(p.crm_client_id) ?? { n: 0, total: 0 }
        agg.set(p.crm_client_id, { n: cur.n + 1, total: cur.total + (p.valor ?? 0) })
      }
    }

    setClientes(rows.map(c => ({
      ...c,
      n_pedidos: agg.get(c.id)?.n ?? 0,
      total_compras: agg.get(c.id)?.total ?? 0,
    })))
    setLoading(false)
  }, [alvo])

  useEffect(() => { load() }, [load])

  const range = useMemo(() => {
    if (mode === 'mensal') {
      const d = new Date(ano, mes, 1)
      return { ini: format(startOfMonth(d), 'yyyy-MM-dd'), fim: format(endOfMonth(d), 'yyyy-MM-dd'), label: `${MESES[mes]} / ${ano}` }
    }
    if (mode === 'periodo' && dataIni && dataFim) {
      return { ini: dataIni, fim: dataFim, label: `${fmtDateSimple(dataIni)} a ${fmtDateSimple(dataFim)}` }
    }
    return { ini: '', fim: '', label: 'Todos os períodos' }
  }, [mode, mes, ano, dataIni, dataFim])

  const inRange = (d: string | null) => !range.ini || (!!d && d.substring(0, 10) >= range.ini && d.substring(0, 10) <= range.fim)

  const abertos     = clientes.filter(c => !c.positivado)
  const elegiveis   = abertos.filter(c => c.n_pedidos >= META_PEDIDOS && c.total_compras >= META_VALOR)
  const emProgresso = abertos.filter(c => !(c.n_pedidos >= META_PEDIDOS && c.total_compras >= META_VALOR))
  const enviadas    = clientes.filter(c => c.positivado && c.comissao_status === 'pendente' && inRange(c.positivado_em))
  const pagas       = clientes.filter(c => c.positivado && c.comissao_status === 'pago' && inRange(c.comissao_pago_em))

  const totalEnviadas = enviadas.reduce((s, c) => s + (c.comissao_valor ?? 0), 0)
  const totalPagas    = pagas.reduce((s, c) => s + (c.comissao_valor ?? 0), 0)
  const semVinculoRH  = (c: ClienteRow) => !userMap.get(c.indicador_user_id)?.colaborador_id

  async function confirmar(c: ClienteRow) {
    const quem = nomeIndicador(c.indicador_user_id)
    if (!window.confirm(`Confirmar positivação de ${c.nome}?\n\nA comissão de ${fmtBRL(META_COMISSAO)} para ${quem} será enviada ao RH.`)) return
    setSavingId(c.id); setError(null); setNotice(null)
    const { data, error: err } = await supabase.rpc('crm_confirmar_positivacao', { p_client_id: c.id })
    setSavingId(null)
    if (err) { setError(err.message); return }
    const r = data as { periodo_fim: string; vinculado_rh: boolean; beneficiario: string } | null
    setNotice(
      `Positivação enviada ao RH (fechamento ${fmtDateSimple(r?.periodo_fim ?? null)}).` +
      (r && !r.vinculado_rh ? ` Atenção: ${r.beneficiario} não está vinculado(a) a um colaborador no RH — o RH precisará conferir.` : '')
    )
    load()
  }

  async function desfazer(c: ClienteRow) {
    if (!window.confirm(`Desfazer a positivação de ${c.nome}?\n\nA comissão sai do RH e o cliente volta a aguardar confirmação.`)) return
    setSavingId(c.id); setError(null); setNotice(null)
    const { error: err } = await supabase.rpc('crm_desfazer_positivacao', { p_client_id: c.id })
    setSavingId(null)
    if (err) { setError(err.message); return }
    load()
  }

  function exportar() {
    const linhas = [...enviadas, ...pagas].map(c => ({
      'Cliente': c.nome,
      'Indicador': nomeIndicador(c.indicador_user_id),
      'Positivado em': fmtDateSimple(c.positivado_em),
      'Pedidos (na confirmação)': c.positivacao_pedidos ?? '',
      'Total (na confirmação)': c.positivacao_total ?? '',
      'Fechamento RH': fmtDateSimple(c.comissao_periodo_fim),
      'Status': c.comissao_status === 'pago' ? 'Pago' : 'Aguardando RH',
      'Pago em': fmtDateSimple(c.comissao_pago_em),
      'Comissão (R$)': c.comissao_valor ?? META_COMISSAO,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Positivações')
    XLSX.writeFile(wb, `Positivacoes_${range.label.replace(/[^\w]+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  return (
    <div className="space-y-5">
      {/* Filtros (mesmos do Varejo) */}
      <div className="card p-4 space-y-4">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
          {([['todos', 'Todos os períodos'], ['mensal', 'Por Mês / Ano'], ['periodo', 'Período Personalizado']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={segBtn(mode === m)}>{label}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Indicador</label>
            {isAdmin ? (
              <select className="input w-52" value={filtro} onChange={e => setFiltro(e.target.value)}>
                <option value="TODOS">Todos</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            ) : (
              <div className="input w-52 bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 cursor-default select-none">
                {profile?.nome ?? '—'}
              </div>
            )}
          </div>

          {mode === 'mensal' && (
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
          )}
          {mode === 'periodo' && (
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

          <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 py-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
          <button
            onClick={exportar}
            disabled={loading || enviadas.length + pagas.length === 0}
            className="btn-secondary flex items-center gap-2 py-2"
          >
            <Download size={14} /> Exportar Excel
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Regra: cliente com <strong>{META_PEDIDOS} pedidos</strong> + total ≥ <strong>{fmtBRL(META_VALOR)}</strong> (todo o histórico de pedidos)
          gera comissão de <strong className="text-purple-600">{fmtBRL(META_COMISSAO)}</strong> para o indicador. O período filtra as
          confirmadas (pela data da confirmação) e o arquivo (pela data do pagamento); elegíveis e em progresso mostram a situação atual.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <Send size={16} className="shrink-0" /> {notice}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><Clock size={12} className="text-orange-400" /> Em progresso</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{loading ? '—' : emProgresso.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">clientes ainda não positivados</p>
        </div>
        <div className="card p-4 border-green-200 dark:border-green-700/40 bg-green-50/50 dark:bg-green-900/10">
          <p className="text-xs text-green-600 font-medium flex items-center gap-1"><Star size={12} /> Elegíveis</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{loading ? '—' : elegiveis.length}</p>
          <p className="text-[10px] text-green-500 mt-0.5">aguardando confirmação ADM</p>
        </div>
        <div className="card p-4 border-purple-200 dark:border-purple-700/40 bg-purple-50/50 dark:bg-purple-900/10">
          <p className="text-xs text-purple-600 font-medium flex items-center gap-1"><Banknote size={12} /> Aguardando RH</p>
          <p className="text-xl font-bold text-purple-700 dark:text-purple-400 mt-1 tabular-nums">{loading ? '—' : fmtBRL(totalEnviadas)}</p>
          <p className="text-[10px] text-purple-400 mt-0.5">{enviadas.length} enviadas ao RH</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> Pago</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{loading ? '—' : fmtBRL(totalPagas)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{pagas.length} positivações pagas · {range.label}</p>
        </div>
      </div>

      {/* Subabas */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
        <button onClick={() => setSub('ativas')} className={segBtn(sub === 'ativas')}>Ativas</button>
        <button onClick={() => setSub('arquivo')} className={`${segBtn(sub === 'arquivo')} flex items-center gap-1.5`}>
          <Archive size={12} /> Arquivo (pagas)
        </button>
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

      {!loading && sub === 'ativas' && (
        <>
          {elegiveis.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                <Star size={14} className="text-green-500" /> Elegíveis — aguardando confirmação ({elegiveis.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {elegiveis.map(c => (
                  <div key={c.id} className="card p-4 border-green-200 dark:border-green-700/40 bg-green-50/40 dark:bg-green-900/10 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{c.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {c.tipo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">{c.tipo}</span>}
                          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">★ {nomeIndicador(c.indicador_user_id)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 text-right shrink-0">{c.n_pedidos} ped. · {fmtBRL(c.total_compras)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ProgressBar value={c.n_pedidos} max={META_PEDIDOS} label="Pedidos" />
                      <ProgressBar value={c.total_compras} max={META_VALOR} label="Total compras" isMoney />
                    </div>
                    {isAdmin ? (
                      <button
                        onClick={() => confirmar(c)}
                        disabled={savingId === c.id}
                        className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {savingId === c.id ? 'Enviando…' : `✓ Confirmar e enviar ao RH — ${fmtBRL(META_COMISSAO)}`}
                      </button>
                    ) : (
                      <p className="text-[10px] text-center text-green-600 font-medium">✓ Critério atingido — aguardando confirmação do ADM</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {emProgresso.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Clock size={14} className="text-orange-400" /> Em progresso ({emProgresso.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {emProgresso.map(c => (
                  <div key={c.id} className="card p-3.5 space-y-2.5">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{c.nome}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {c.tipo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">{c.tipo}</span>}
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">★ {nomeIndicador(c.indicador_user_id)}</span>
                      </div>
                    </div>
                    <ProgressBar value={c.n_pedidos} max={META_PEDIDOS} label="Pedidos" />
                    <ProgressBar value={c.total_compras} max={META_VALOR} label="Total compras" isMoney />
                  </div>
                ))}
              </div>
            </div>
          )}

          {enviadas.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Send size={14} className="text-purple-500" /> Enviadas ao RH — aguardando pagamento ({enviadas.length})
              </h2>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                        <th className="px-4 py-2.5 font-medium">Cliente</th>
                        <th className="px-4 py-2.5 font-medium">Indicador</th>
                        <th className="px-4 py-2.5 font-medium">Confirmada em</th>
                        <th className="px-4 py-2.5 font-medium hidden md:table-cell">Fechamento RH</th>
                        <th className="px-4 py-2.5 font-medium text-right">Comissão</th>
                        {isAdmin && <th className="px-4 py-2.5 font-medium" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {enviadas.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.nome}</td>
                          <td className="px-4 py-3 text-xs text-purple-600 dark:text-purple-400 font-medium">
                            {nomeIndicador(c.indicador_user_id)}
                            {semVinculoRH(c) && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" title="Este usuário não está vinculado a um colaborador no RH">
                                <AlertTriangle size={9} /> sem vínculo RH
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateSimple(c.positivado_em)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap hidden md:table-cell">{fmtDateSimple(c.comissao_periodo_fim)}</td>
                          <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums whitespace-nowrap">{fmtBRL(c.comissao_valor ?? META_COMISSAO)}</td>
                          {isAdmin && (
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => desfazer(c)}
                                disabled={savingId === c.id}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                <Undo2 size={11} /> {savingId === c.id ? '…' : 'Desfazer'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">Total ({enviadas.length})</td>
                        <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums">{fmtBRL(totalEnviadas)}</td>
                        {isAdmin && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && sub === 'arquivo' && (
        pagas.length === 0 ? (
          <div className="card p-8 text-center">
            <Archive size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nenhuma comissão paga no período selecionado.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Indicador</th>
                    <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Confirmada em</th>
                    <th className="px-4 py-2.5 font-medium hidden md:table-cell">Fechamento RH</th>
                    <th className="px-4 py-2.5 font-medium">Pago em</th>
                    <th className="px-4 py-2.5 font-medium text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {pagas.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.nome}</td>
                      <td className="px-4 py-3 text-xs text-purple-600 dark:text-purple-400 font-medium">{nomeIndicador(c.indicador_user_id)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap hidden sm:table-cell">{fmtDateSimple(c.positivado_em)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap hidden md:table-cell">{fmtDateSimple(c.comissao_periodo_fim)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          <CheckCircle2 size={10} /> {fmtDateSimple(c.comissao_pago_em)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums whitespace-nowrap">{fmtBRL(c.comissao_valor ?? META_COMISSAO)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">Total pago ({pagas.length})</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums">{fmtBRL(totalPagas)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
