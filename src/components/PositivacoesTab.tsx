import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  RefreshCw, Star, Clock, CheckCircle2, Banknote, Download, Undo2, AlertTriangle, Archive, Send,
  Settings, XCircle, RotateCcw, Ban,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtDateSimple, MESES, getYears } from '../lib/comissao'

interface Config {
  meta_pedidos: number
  meta_valor: number
  valor_comissao: number
  janela_dias: number | null
}
const DEFAULT_CONFIG: Config = { meta_pedidos: 3, meta_valor: 500, valor_comissao: 50, janela_dias: null }

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
  comissao_motivo: string | null
  comissao_decisao_em: string | null
  positivacao_pedidos: number | null
  positivacao_total: number | null
  n_pedidos: number
  total_compras: number
  pode_comissao: boolean
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

function notificarMudanca() {
  window.dispatchEvent(new Event('positivacoes-changed'))
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pago:      { label: 'Pago',      cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  recusada:  { label: 'Recusada',  cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  estornada: { label: 'Estornada', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
}

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
  const [config, setConfig]     = useState<Config>(DEFAULT_CONFIG)
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulking, setBulking]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [cfgDraft, setCfgDraft] = useState({ meta_pedidos: '', meta_valor: '', valor_comissao: '', janela_dias: '' })
  const [cfgSaving, setCfgSaving] = useState(false)
  const [naoElegiveis, setNaoElegiveis] = useState<Set<string>>(new Set())
  const [togglingUser, setTogglingUser] = useState<string | null>(null)

  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const nomeIndicador = (id: string) => userMap.get(id)?.nome ?? '—'

  useEffect(() => {
    supabase.from('crm_users').select('id, nome, colaborador_id').eq('ativo', true).order('nome')
      .then(({ data }) => setUsers((data ?? []) as UserOpt[]))
  }, [])

  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('positivacao_config').select('meta_pedidos, meta_valor, valor_comissao, janela_dias').maybeSingle()
    if (data) {
      const c: Config = {
        meta_pedidos: Number(data.meta_pedidos), meta_valor: Number(data.meta_valor),
        valor_comissao: Number(data.valor_comissao), janela_dias: data.janela_dias ?? null,
      }
      setConfig(c)
      setCfgDraft({
        meta_pedidos: String(c.meta_pedidos), meta_valor: String(c.meta_valor),
        valor_comissao: String(c.valor_comissao), janela_dias: c.janela_dias ? String(c.janela_dias) : '',
      })
    }
  }, [])
  useEffect(() => { loadConfig() }, [loadConfig])

  const loadNaoElegiveis = useCallback(async () => {
    const { data } = await supabase.from('positivacao_indicadores_nao_elegiveis').select('user_id')
    setNaoElegiveis(new Set((data ?? []).map(r => r.user_id as string)))
  }, [])
  useEffect(() => { loadNaoElegiveis() }, [loadNaoElegiveis])

  const alvo = isAdmin ? filtro : selfId

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let q = supabase
      .from('crm_clients')
      .select('id, nome, tipo, indicador_user_id, positivado, positivado_em, comissao_status, comissao_valor, comissao_pago_em, comissao_periodo_fim, comissao_motivo, comissao_decisao_em, positivacao_pedidos, positivacao_total')
      .not('indicador_user_id', 'is', null)
      .order('nome')
    if (alvo !== 'TODOS') q = q.eq('indicador_user_id', alvo)

    // Progresso e elegibilidade vêm do banco (mesma regra da confirmação, com janela se configurada)
    const [{ data, error: err }, { data: prog }] = await Promise.all([
      q,
      supabase.rpc('crm_positivacao_progresso', { p_user: alvo === 'TODOS' ? null : alvo }),
    ])
    if (err) { setError(err.message); setClientes([]); setLoading(false); return }

    const progMap = new Map<string, { n: number; total: number; pode: boolean }>()
    for (const p of (prog ?? []) as { client_id: string; n_pedidos: number; total: number; pode_comissao: boolean }[]) {
      progMap.set(p.client_id, { n: p.n_pedidos, total: Number(p.total), pode: p.pode_comissao })
    }

    setClientes(((data ?? []) as Omit<ClienteRow, 'n_pedidos' | 'total_compras'>[]).map(c => ({
      ...c,
      n_pedidos: progMap.get(c.id)?.n ?? 0,
      total_compras: progMap.get(c.id)?.total ?? 0,
      pode_comissao: progMap.get(c.id)?.pode ?? true,
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

  const atingiuMeta = (c: ClienteRow) => c.n_pedidos >= config.meta_pedidos && c.total_compras >= config.meta_valor
  const abertos     = clientes.filter(c => !c.positivado)
  const elegiveis   = abertos.filter(c => atingiuMeta(c) && c.pode_comissao)
  const semDireito  = abertos.filter(c => atingiuMeta(c) && !c.pode_comissao)
  const emProgresso = abertos.filter(c => !atingiuMeta(c))
  const enviadas    = clientes.filter(c => c.positivado && c.comissao_status === 'pendente' && inRange(c.positivado_em))
  const pagas       = clientes.filter(c => c.positivado && c.comissao_status === 'pago' && inRange(c.comissao_pago_em))
  const decididas   = clientes.filter(c => (c.comissao_status === 'recusada' || c.comissao_status === 'estornada') && inRange(c.comissao_decisao_em))
  const arquivo     = [...pagas, ...decididas].sort((a, b) =>
    (b.comissao_pago_em ?? b.comissao_decisao_em ?? '').localeCompare(a.comissao_pago_em ?? a.comissao_decisao_em ?? ''))

  const totalEnviadas = enviadas.reduce((s, c) => s + (c.comissao_valor ?? 0), 0)
  const totalPagas    = pagas.reduce((s, c) => s + (c.comissao_valor ?? 0), 0)
  const semVinculoRH  = (c: ClienteRow) => !userMap.get(c.indicador_user_id)?.colaborador_id

  const regraTexto = `${config.meta_pedidos} pedidos + total ≥ ${fmtBRL(config.meta_valor)}`
  const janelaTexto = config.janela_dias ? `em até ${config.janela_dias} dias do primeiro pedido` : 'todo o histórico de pedidos'

  async function confirmar(c: ClienteRow) {
    const quem = nomeIndicador(c.indicador_user_id)
    if (!window.confirm(`Confirmar positivação de ${c.nome}?\n\nA comissão de ${fmtBRL(config.valor_comissao)} para ${quem} será enviada ao RH, que decide o que pagar ou recusar.`)) return
    setSavingId(c.id); setError(null); setNotice(null)
    const { data, error: err } = await supabase.rpc('crm_confirmar_positivacao', { p_client_id: c.id })
    setSavingId(null)
    if (err) { setError(err.message); return }
    const r = data as { periodo_fim: string; vinculado_rh: boolean; beneficiario: string } | null
    setNotice(
      `Positivação enviada ao RH (fechamento ${fmtDateSimple(r?.periodo_fim ?? null)}).` +
      (r && !r.vinculado_rh ? ` Atenção: ${r.beneficiario} não está vinculado(a) a um colaborador no RH — o RH precisará conferir.` : '')
    )
    notificarMudanca()
    load()
  }

  async function confirmarTodos() {
    if (elegiveis.length === 0) return
    if (!window.confirm(`Enviar ao RH as ${elegiveis.length} positivações elegíveis (${fmtBRL(elegiveis.length * config.valor_comissao)})?\n\nO RH analisa cada uma e decide o que pagar ou recusar.`)) return
    setBulking(true); setError(null); setNotice(null)
    const { data, error: err } = await supabase.rpc('crm_confirmar_positivacoes', { p_client_ids: elegiveis.map(c => c.id) })
    setBulking(false)
    if (err) { setError(err.message); return }
    const r = data as { confirmadas: number; erros: { client_id: string; erro: string }[] }
    setNotice(`${r.confirmadas} positivação(ões) enviada(s) ao RH.` + (r.erros.length ? ` ${r.erros.length} não puderam ser enviadas: ${r.erros[0].erro}` : ''))
    notificarMudanca()
    load()
  }

  async function desfazer(c: ClienteRow) {
    if (!window.confirm(`Desfazer a positivação de ${c.nome}?\n\nA comissão sai do RH e o cliente volta a aguardar confirmação.`)) return
    setSavingId(c.id); setError(null); setNotice(null)
    const { error: err } = await supabase.rpc('crm_desfazer_positivacao', { p_client_id: c.id })
    setSavingId(null)
    if (err) { setError(err.message); return }
    notificarMudanca()
    load()
  }

  async function salvarConfig() {
    const meta_pedidos = parseInt(cfgDraft.meta_pedidos, 10)
    const meta_valor = parseFloat(cfgDraft.meta_valor.replace(',', '.'))
    const valor_comissao = parseFloat(cfgDraft.valor_comissao.replace(',', '.'))
    const janela_dias = cfgDraft.janela_dias.trim() === '' ? null : parseInt(cfgDraft.janela_dias, 10)
    if (!(meta_pedidos > 0) || !(meta_valor >= 0) || !(valor_comissao >= 0) || (janela_dias !== null && !(janela_dias > 0))) {
      setError('Confira os valores da regra: pedidos > 0, valores ≥ 0 e janela vazia (sem prazo) ou > 0.')
      return
    }
    setCfgSaving(true); setError(null); setNotice(null)
    const { error: err } = await supabase.from('positivacao_config')
      .update({ meta_pedidos, meta_valor, valor_comissao, janela_dias }).eq('id', true)
    setCfgSaving(false)
    if (err) { setError(err.message); return }
    setNotice('Regra atualizada. Vale para as próximas confirmações; o que já foi enviado ao RH não muda.')
    setShowConfig(false)
    await loadConfig()
    notificarMudanca()
    load()
  }

  async function alternarElegibilidade(u: UserOpt) {
    const naoElegivel = naoElegiveis.has(u.id)
    setTogglingUser(u.id); setError(null); setNotice(null)
    const { error: err } = naoElegivel
      ? await supabase.from('positivacao_indicadores_nao_elegiveis').delete().eq('user_id', u.id)
      : await supabase.from('positivacao_indicadores_nao_elegiveis').insert({ user_id: u.id, motivo: 'Definido por Administrador' })
    setTogglingUser(null)
    if (err) { setError(err.message); return }
    await loadNaoElegiveis()
    notificarMudanca()
    load()
  }

  function exportar() {
    const linhas = [...enviadas, ...arquivo].map(c => ({
      'Cliente': c.nome,
      'Indicador': nomeIndicador(c.indicador_user_id),
      'Positivado em': fmtDateSimple(c.positivado_em),
      'Pedidos (na confirmação)': c.positivacao_pedidos ?? '',
      'Total (na confirmação)': c.positivacao_total ?? '',
      'Fechamento RH': fmtDateSimple(c.comissao_periodo_fim),
      'Status': c.comissao_status === 'pendente' ? 'Aguardando RH' : (STATUS_LABEL[c.comissao_status ?? '']?.label ?? ''),
      'Pago em': fmtDateSimple(c.comissao_pago_em),
      'Motivo (RH)': c.comissao_motivo ?? '',
      'Comissão (R$)': c.comissao_valor ?? config.valor_comissao,
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
            disabled={loading || enviadas.length + arquivo.length === 0}
            className="btn-secondary flex items-center gap-2 py-2"
          >
            <Download size={14} /> Exportar Excel
          </button>
          {isAdmin && (
            <button onClick={() => setShowConfig(v => !v)} className="btn-ghost flex items-center gap-2 py-2 text-xs">
              <Settings size={14} /> Regra da comissão
            </button>
          )}
        </div>

        {showConfig && isAdmin && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 space-y-3 bg-slate-50 dark:bg-slate-800/40">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="label">Pedidos mínimos</label>
                <input className="input" inputMode="numeric" value={cfgDraft.meta_pedidos} onChange={e => setCfgDraft(d => ({ ...d, meta_pedidos: e.target.value }))} />
              </div>
              <div>
                <label className="label">Total mínimo (R$)</label>
                <input className="input" inputMode="decimal" value={cfgDraft.meta_valor} onChange={e => setCfgDraft(d => ({ ...d, meta_valor: e.target.value }))} />
              </div>
              <div>
                <label className="label">Comissão (R$)</label>
                <input className="input" inputMode="decimal" value={cfgDraft.valor_comissao} onChange={e => setCfgDraft(d => ({ ...d, valor_comissao: e.target.value }))} />
              </div>
              <div>
                <label className="label">Janela (dias)</label>
                <input className="input" inputMode="numeric" placeholder="vazio = sem prazo" value={cfgDraft.janela_dias} onChange={e => setCfgDraft(d => ({ ...d, janela_dias: e.target.value }))} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Janela: a meta precisa ser atingida em até N dias do primeiro pedido do cliente. Vazio conta todo o histórico.
              Vale para as próximas confirmações; o que já foi enviado ao RH não muda.
            </p>
            <button onClick={salvarConfig} disabled={cfgSaving} className="btn-primary py-1.5 px-4 text-xs">
              {cfgSaving ? 'Salvando…' : 'Salvar regra'}
            </button>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-600 space-y-2">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Quem recebe comissão de positivação</p>
              <p className="text-[11px] text-slate-400">
                Quem estiver desligado continua com o progresso calculado normalmente, mas não aparece em Elegíveis
                (confirmação, envio ao RH e aviso do menu).
              </p>
              <div className="flex flex-wrap gap-2">
                {users.map(u => {
                  const recebe = !naoElegiveis.has(u.id)
                  return (
                    <button
                      key={u.id}
                      onClick={() => alternarElegibilidade(u)}
                      disabled={togglingUser === u.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 ${
                        recebe
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                          : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 line-through'
                      }`}
                      title={recebe ? 'Recebe comissão — clique para desligar' : 'Não recebe comissão — clique para ligar'}
                    >
                      {recebe ? <CheckCircle2 size={13} /> : <Ban size={13} />} {u.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          Regra: cliente com <strong>{regraTexto}</strong> ({janelaTexto}) gera comissão de{' '}
          <strong className="text-purple-600">{fmtBRL(config.valor_comissao)}</strong> para o indicador. O RH decide o que paga ou recusa.
          O período filtra as confirmadas (pela data da confirmação) e o arquivo (pela data da decisão do RH);
          elegíveis e em progresso mostram a situação atual.
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
          <p className="text-[10px] text-green-500 mt-0.5">aguardando confirmação ADM{semDireito.length > 0 ? ` · ${semDireito.length} sem comissão` : ''}</p>
        </div>
        <div className="card p-4 border-purple-200 dark:border-purple-700/40 bg-purple-50/50 dark:bg-purple-900/10">
          <p className="text-xs text-purple-600 font-medium flex items-center gap-1"><Banknote size={12} /> Aguardando RH</p>
          <p className="text-xl font-bold text-purple-700 dark:text-purple-400 mt-1 tabular-nums">{loading ? '—' : fmtBRL(totalEnviadas)}</p>
          <p className="text-[10px] text-purple-400 mt-0.5">{enviadas.length} enviadas ao RH</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> Pago</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{loading ? '—' : fmtBRL(totalPagas)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {pagas.length} pagas{decididas.length > 0 ? ` · ${decididas.length} recusadas/estornadas` : ''} · {range.label}
          </p>
        </div>
      </div>

      {/* Subabas */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
        <button onClick={() => setSub('ativas')} className={segBtn(sub === 'ativas')}>Ativas</button>
        <button onClick={() => setSub('arquivo')} className={`${segBtn(sub === 'arquivo')} flex items-center gap-1.5`}>
          <Archive size={12} /> Arquivo
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-green-700 dark:text-green-400 flex items-center gap-2">
                  <Star size={14} className="text-green-500" /> Elegíveis — aguardando confirmação ({elegiveis.length})
                </h2>
                {isAdmin && (
                  <button
                    onClick={confirmarTodos}
                    disabled={bulking}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                  >
                    {bulking ? 'Enviando…' : `✓ Enviar todos ao RH (${elegiveis.length})`}
                  </button>
                )}
              </div>
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
                      <ProgressBar value={c.n_pedidos} max={config.meta_pedidos} label="Pedidos" />
                      <ProgressBar value={c.total_compras} max={config.meta_valor} label="Total compras" isMoney />
                    </div>
                    {isAdmin ? (
                      <button
                        onClick={() => confirmar(c)}
                        disabled={savingId === c.id || bulking}
                        className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {savingId === c.id ? 'Enviando…' : `✓ Confirmar e enviar ao RH — ${fmtBRL(config.valor_comissao)}`}
                      </button>
                    ) : (
                      <p className="text-[10px] text-center text-green-600 font-medium">✓ Critério atingido — aguardando confirmação do ADM</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {semDireito.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Ban size={14} /> Meta atingida · indicador sem comissão de positivação ({semDireito.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {semDireito.map(c => (
                  <div key={c.id} className="card p-3.5 space-y-1.5 opacity-80">
                    <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm truncate">{c.nome}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.tipo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">{c.tipo}</span>}
                      <span className="text-[10px] text-slate-500 font-medium">★ {nomeIndicador(c.indicador_user_id)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{c.n_pedidos} ped. · {fmtBRL(c.total_compras)} — meta atingida, sem comissão</p>
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
                    <ProgressBar value={c.n_pedidos} max={config.meta_pedidos} label="Pedidos" />
                    <ProgressBar value={c.total_compras} max={config.meta_valor} label="Total compras" isMoney />
                  </div>
                ))}
              </div>
            </div>
          )}

          {enviadas.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Send size={14} className="text-purple-500" /> Enviadas ao RH — aguardando decisão ({enviadas.length})
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
                          <td className="px-4 py-3 text-right font-bold text-purple-600 tabular-nums whitespace-nowrap">{fmtBRL(c.comissao_valor ?? config.valor_comissao)}</td>
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
        arquivo.length === 0 ? (
          <div className="card p-8 text-center">
            <Archive size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Nada arquivado no período selecionado.</p>
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
                    <th className="px-4 py-2.5 font-medium">Decisão do RH</th>
                    <th className="px-4 py-2.5 font-medium text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {arquivo.map(c => {
                    const st = STATUS_LABEL[c.comissao_status ?? ''] ?? STATUS_LABEL.pago
                    const quando = c.comissao_status === 'pago' ? c.comissao_pago_em : c.comissao_decisao_em
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.nome}</td>
                        <td className="px-4 py-3 text-xs text-purple-600 dark:text-purple-400 font-medium">{nomeIndicador(c.indicador_user_id)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap hidden sm:table-cell">{fmtDateSimple(c.positivado_em)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap hidden md:table-cell">{fmtDateSimple(c.comissao_periodo_fim)}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>
                            {c.comissao_status === 'pago' ? <CheckCircle2 size={10} /> : c.comissao_status === 'recusada' ? <XCircle size={10} /> : <RotateCcw size={10} />}
                            {st.label} {fmtDateSimple(quando)}
                          </span>
                          {c.comissao_motivo && <p className="text-[10px] text-slate-400 mt-0.5 max-w-[220px]">“{c.comissao_motivo}”</p>}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${c.comissao_status === 'pago' ? 'text-purple-600' : 'text-slate-400 line-through'}`}>
                          {fmtBRL(c.comissao_valor ?? config.valor_comissao)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                      Total pago ({pagas.length}){decididas.length > 0 ? ` · ${decididas.length} recusadas/estornadas` : ''}
                    </td>
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
