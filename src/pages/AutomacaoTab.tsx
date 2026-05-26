import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Bot, Power, AlertTriangle, ChevronDown, ChevronUp, Save, Calendar, Plus, Trash2,
  Play, RefreshCw, ShieldCheck, X, CheckCircle2, Clock, Send, MinusCircle,
  FlaskConical, StopCircle, Cog,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { AutomacaoConfig, AutomacaoFeriado, AutomacaoFilaItem, AutomacaoLog } from '../types'

const DIAS = [
  { key: 'segunda', label: 'Segunda' },
  { key: 'terca', label: 'Terça' },
  { key: 'quarta', label: 'Quarta' },
  { key: 'quinta', label: 'Quinta' },
  { key: 'sexta', label: 'Sexta' },
] as const

function nk(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function mascararTelefone(tel: string | null): string {
  if (!tel) return '—'
  const d = tel.replace(/\D/g, '')
  if (d.length < 6) return tel
  return d.slice(0, 6) + '•'.repeat(Math.max(0, d.length - 8)) + d.slice(-2)
}

function primeiroNome(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || nome
}

const STATUS_STYLE: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  enviado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  erro: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  pulado: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  simulado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  sistema: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  ignorado: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

interface ClienteDia {
  nome: string
  telefone: string | null
  dia_entrega: string | null
  mensagem: string | null
  rota: string | null
  turno: string | null
}

interface StatusResp {
  ok: boolean
  config?: AutomacaoConfig
  hoje?: string
  fim_de_semana?: boolean
  fila?: Record<string, number>
  enviados_hoje?: number
  error?: string
}

interface SimularResp {
  ok: boolean
  total?: number
  validos?: number
  fim_de_semana?: boolean
  mensagem_exemplo?: string
  clientes?: Array<{ cliente_nome: string; telefone: string | null; valido: boolean; rota: string | null; turno: string | null }>
  error?: string
}

export default function AutomacaoTab() {
  const { isAdmin, profile } = useAuth()
  const [config, setConfig] = useState<AutomacaoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState<ClienteDia[]>([])
  const [feriados, setFeriados] = useState<AutomacaoFeriado[]>([])
  const [fila, setFila] = useState<AutomacaoFilaItem[]>([])
  const [logs, setLogs] = useState<AutomacaoLog[]>([])
  const [enviadosHoje, setEnviadosHoje] = useState(0)

  const [diaTab, setDiaTab] = useState<typeof DIAS[number]['key']>('segunda')
  const [showConfig, setShowConfig] = useState(false)
  const [confirmAtivar, setConfirmAtivar] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const [novoFeriadoData, setNovoFeriadoData] = useState('')
  const [novoFeriadoDesc, setNovoFeriadoDesc] = useState('')

  const [logFiltroData, setLogFiltroData] = useState('')
  const [logFiltroStatus, setLogFiltroStatus] = useState('')

  const [simulando, setSimulando] = useState(false)
  const [simResult, setSimResult] = useState<SimularResp | null>(null)

  const [showTeste, setShowTeste] = useState(false)
  const [testeNumero, setTesteNumero] = useState('')
  const [testeMensagem, setTesteMensagem] = useState('')
  const [enviandoTeste, setEnviandoTeste] = useState(false)
  const [testeResult, setTesteResult] = useState<{ ok: boolean; erro?: string; numero_normalizado?: string; mensagem_enviada?: string } | null>(null)

  const [pausando, setPausando] = useState(false)

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/automacao-lumar`

  const load = useCallback(async () => {
    setLoading(true)
    const [cfgRes, cliRes, ferRes] = await Promise.all([
      supabase.from('automacao_config').select('*').eq('nome', 'LUMAR').maybeSingle(),
      supabase.from('crm_clients').select('nome, telefone, dia_entrega, mensagem, rota, turno, ativo').eq('ativo', true),
      supabase.from('automacao_feriados').select('*').order('data', { ascending: true }),
    ])
    if (cfgRes.data) setConfig(cfgRes.data as AutomacaoConfig)
    setClientes((cliRes.data ?? []) as ClienteDia[])
    setFeriados((ferRes.data ?? []) as AutomacaoFeriado[])

    const hoje = new Date().toISOString().slice(0, 10)
    const [filaRes, logRes] = await Promise.all([
      supabase.from('automacao_fila').select('*').eq('data_exec', hoje).order('created_at', { ascending: true }),
      supabase.from('automacao_logs').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    setFila((filaRes.data ?? []) as AutomacaoFilaItem[])
    setLogs((logRes.data ?? []) as AutomacaoLog[])
    setEnviadosHoje(((logRes.data ?? []) as AutomacaoLog[]).filter(
      l => l.status === 'enviado' && l.data_exec === hoje).length)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const clientesPorDia = useMemo(() => {
    return clientes.filter(c => {
      if (nk(c.mensagem ?? '') !== 'sim') return false
      if (!c.dia_entrega) return false
      const dias = c.dia_entrega.split(',').map(d => nk(d))
      return dias.some(d => d.startsWith(diaTab) || diaTab.startsWith(d))
    })
  }, [clientes, diaTab])

  const contagemDias = useMemo(() => {
    const map: Record<string, number> = {}
    for (const dia of DIAS) {
      map[dia.key] = clientes.filter(c => {
        if (nk(c.mensagem ?? '') !== 'sim') return false
        if (!c.dia_entrega) return false
        const dias = c.dia_entrega.split(',').map(d => nk(d))
        return dias.some(d => d.startsWith(dia.key) || dia.key.startsWith(d))
      }).length
    }
    return map
  }, [clientes])

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      if (logFiltroData && l.data_exec !== logFiltroData) return false
      if (logFiltroStatus && l.status !== logFiltroStatus) return false
      return true
    })
  }, [logs, logFiltroData, logFiltroStatus])

  async function toggleAtivo(novoValor: boolean) {
    if (!config) return
    const { error } = await supabase.from('automacao_config')
      .update({ ativo: novoValor, updated_at: new Date().toISOString(), updated_by: profile?.nome ?? profile?.email ?? null })
      .eq('id', config.id)
    if (!error) setConfig({ ...config, ativo: novoValor })
    setConfirmAtivar(false)
  }

  async function salvarConfig() {
    if (!config) return
    setSavingCfg(true)
    setSavedMsg(null)
    const { error } = await supabase.from('automacao_config').update({
      hora_envio: config.hora_envio,
      mensagem_template: config.mensagem_template,
      limite_diario: config.limite_diario,
      msgs_por_lote: config.msgs_por_lote,
      pausa_entre_msgs_ms: config.pausa_entre_msgs_ms,
      pausa_min_ms: config.pausa_min_ms,
      pausa_max_ms: config.pausa_max_ms,
      updated_at: new Date().toISOString(),
      updated_by: profile?.nome ?? profile?.email ?? null,
    }).eq('id', config.id)
    setSavingCfg(false)
    setSavedMsg(error ? `Erro: ${error.message}` : '✓ Configurações salvas')
    setTimeout(() => setSavedMsg(null), 4000)
  }

  async function adicionarFeriado() {
    if (!novoFeriadoData) return
    const { error } = await supabase.from('automacao_feriados')
      .insert({ data: novoFeriadoData, descricao: novoFeriadoDesc || null })
    if (!error) {
      setNovoFeriadoData('')
      setNovoFeriadoDesc('')
      const { data } = await supabase.from('automacao_feriados').select('*').order('data', { ascending: true })
      setFeriados((data ?? []) as AutomacaoFeriado[])
    }
  }

  async function removerFeriado(id: string) {
    await supabase.from('automacao_feriados').delete().eq('id', id)
    setFeriados(prev => prev.filter(f => f.id !== id))
  }

  async function simular() {
    setSimulando(true)
    setSimResult(null)
    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'simular' }),
      })
      setSimResult(await res.json() as SimularResp)
    } catch (e) {
      setSimResult({ ok: false, error: e instanceof Error ? e.message : 'Erro' })
    } finally {
      setSimulando(false)
    }
  }

  async function cancelarFila() {
    try {
      await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cancelar' }),
      })
      await load()
    } catch { /* ignore */ }
  }

  async function pausarEmergencia() {
    if (!confirm('⏹ Parar todos os envios pendentes agora?\n\nOs envios em fila serão cancelados. A automação permanece ativa para o próximo dia.')) return
    setPausando(true)
    try {
      await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cancelar' }),
      })
      await load()
    } catch { /* ignore */ }
    setPausando(false)
  }

  async function enviarTeste() {
    if (!testeNumero.trim()) return
    setEnviandoTeste(true)
    setTesteResult(null)
    try {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'teste',
          numero: testeNumero.trim(),
          mensagem: testeMensagem.trim() || undefined,
        }),
      })
      setTesteResult(await res.json())
    } catch (e) {
      setTesteResult({ ok: false, erro: e instanceof Error ? e.message : 'Erro de rede' })
    } finally {
      setEnviandoTeste(false)
    }
  }

  const previewMensagem = useMemo(() => {
    if (!config) return ''
    const exemplo = clientesPorDia[0]?.nome ?? 'Maria Silva'
    return config.mensagem_template.replace(/\{CLIENTE\}/g, primeiroNome(exemplo))
  }, [config, clientesPorDia])

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!config) {
    return (
      <div className="card p-6 text-center space-y-2">
        <Bot size={32} className="text-slate-300 mx-auto" />
        <p className="text-sm font-medium text-slate-500">Configuração de automação não encontrada.</p>
        <p className="text-xs text-slate-400">Execute a migration para criar a tabela <code>automacao_config</code> com uma linha <code>nome = 'LUMAR'</code>.</p>
        <button onClick={load} className="btn-ghost text-xs flex items-center gap-1.5 mx-auto">
          <RefreshCw size={13} /> Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Status Geral ── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-lg ${
              config.ativo
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            }`}>
              <Power size={15} />
              {config.ativo ? 'ATIVO' : 'INATIVO'}
            </span>
            <div>
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Automação Lumar</p>
              <p className="text-[11px] text-slate-400">
                Envio diário às {config.hora_envio.slice(0, 5)} · seg a sex
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {enviadosHoje}<span className="text-sm text-slate-400">/{config.limite_diario}</span>
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">enviadas hoje</p>
            </div>
            {isAdmin ? (
              <button
                onClick={() => config.ativo ? toggleAtivo(false) : setConfirmAtivar(true)}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  config.ativo ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
                title={config.ativo ? 'Desativar' : 'Ativar'}
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  config.ativo ? 'translate-x-7' : 'translate-x-0.5'
                }`} />
              </button>
            ) : (
              <span title="Somente administradores podem alterar" className="text-[10px] text-slate-400 italic">somente ADM</span>
            )}
          </div>
        </div>

        {!config.ativo && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ Automação pausada — envios sendo controlados pela planilha Google. Ative o toggle acima para migrar o controle dos envios para o CRM.
            </p>
          </div>
        )}
        {config.ativo && fila.some(f => f.status === 'pendente') && (
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
              <AlertTriangle size={13} className="shrink-0" />
              {fila.filter(f => f.status === 'pendente').length} envio{fila.filter(f => f.status === 'pendente').length !== 1 ? 's' : ''} pendente{fila.filter(f => f.status === 'pendente').length !== 1 ? 's' : ''} na fila
            </p>
            {isAdmin && (
              <button
                onClick={pausarEmergencia}
                disabled={pausando}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                <StopCircle size={13} /> {pausando ? 'Parando…' : 'Parar envios agora'}
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <Cog size={11} />
          Agendamento automático: seg–sex às 05:00 BRT via pg_cron (a cada 5 min até 06:55)
        </div>
      </div>

      {/* ── Confirmação de ativação ── */}
      {confirmAtivar && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmAtivar(false)}>
          <div className="card p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Ativar automação?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tem certeza? Os envios começarão na data/hora configurada
              (<strong>{config.hora_envio.slice(0, 5)}</strong>, de segunda a sexta).
              A planilha Google deixará de ser a fonte de controle.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAtivar(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={() => toggleAtivo(true)} className="btn-primary text-sm">Sim, ativar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Botões de Ação ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={simular} disabled={simulando} className="btn-secondary text-sm flex items-center gap-1.5">
          <Play size={14} className={simulando ? 'animate-pulse' : ''} />
          {simulando ? 'Simulando…' : 'Simular envios de hoje'}
        </button>
        {isAdmin && (
          <button
            onClick={() => { setShowTeste(v => !v); setTesteResult(null) }}
            className={`text-sm flex items-center gap-1.5 px-3 py-2 rounded-lg border font-medium transition-all ${
              showTeste
                ? 'bg-violet-100 text-violet-700 border-violet-200'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50'
            }`}
          >
            <FlaskConical size={14} /> Testar envio
          </button>
        )}
        <button onClick={load} className="btn-ghost p-2">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {simResult && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Send size={14} className="text-orange-500" /> Simulação
            </h3>
            <button onClick={() => setSimResult(null)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
          {simResult.ok ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {simResult.fim_de_semana && <span className="text-amber-600 font-medium">⚠️ Hoje é fim de semana — sem envios reais. </span>}
                <strong>{simResult.total ?? 0}</strong> clientes seriam contatados
                ({simResult.validos ?? 0} com telefone válido).
              </p>
              {simResult.mensagem_exemplo && (
                <pre className="text-[11px] bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 whitespace-pre-wrap text-slate-600 dark:text-slate-300 max-h-32 overflow-auto">
                  {simResult.mensagem_exemplo}
                </pre>
              )}
              <div className="max-h-48 overflow-auto">
                {(simResult.clientes ?? []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{c.cliente_nome}</span>
                    <span className="text-slate-400">{mascararTelefone(c.telefone)}</span>
                    {!c.valido && <span className="text-red-500 text-[10px]">tel inválido</span>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-red-600">{simResult.error}</p>
          )}
        </div>
      )}

      {/* ── Teste de Envio ── */}
      {showTeste && isAdmin && (
        <div className="card p-4 space-y-3 border-l-4 border-l-violet-500">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FlaskConical size={15} className="text-violet-500" /> Teste de Envio
            </h3>
            <button onClick={() => { setShowTeste(false); setTesteResult(null) }} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Envia uma mensagem real de teste para o número informado. Usa o template configurado (com nome "Teste") se nenhuma mensagem for digitada.
          </p>
          <div className="space-y-2">
            <div>
              <label className="label">Número de telefone (com DDD)</label>
              <input
                type="tel"
                className="input"
                placeholder="Ex: 11999999999"
                value={testeNumero}
                onChange={e => setTesteNumero(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Mensagem personalizada (opcional)</label>
              <textarea
                rows={3}
                className="input resize-none text-xs"
                placeholder="Deixe em branco para usar o template configurado"
                value={testeMensagem}
                onChange={e => setTesteMensagem(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={enviarTeste}
            disabled={enviandoTeste || !testeNumero.trim()}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send size={14} className={enviandoTeste ? 'animate-pulse' : ''} />
            {enviandoTeste ? 'Enviando…' : 'Enviar mensagem de teste'}
          </button>
          {testeResult && (
            <div className={`rounded-lg px-3 py-2.5 text-xs space-y-1 ${
              testeResult.ok
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            }`}>
              <p className="font-semibold">{testeResult.ok ? '✅ Enviado com sucesso!' : '❌ Falha no envio'}</p>
              {testeResult.numero_normalizado && <p>Número: {testeResult.numero_normalizado}</p>}
              {testeResult.erro && <p>Erro: {testeResult.erro}</p>}
              {testeResult.mensagem_enviada && (
                <pre className="mt-1 text-[10px] bg-white/50 dark:bg-black/20 rounded p-1.5 whitespace-pre-wrap">{testeResult.mensagem_enviada}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Configurações ── */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowConfig(v => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30"
        >
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Bot size={16} className="text-orange-500" /> Configurações
          </span>
          {showConfig ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>
        {showConfig && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-700 pt-3">
            {!isAdmin && (
              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                🔒 Somente administradores podem alterar as configurações.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Hora de envio</label>
                <input
                  type="time"
                  value={config.hora_envio.slice(0, 5)}
                  onChange={e => isAdmin && setConfig({ ...config, hora_envio: e.target.value + ':00' })}
                  className="input"
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="label">Limite diário</label>
                <input
                  type="number" min={1}
                  value={config.limite_diario}
                  onChange={e => isAdmin && setConfig({ ...config, limite_diario: parseInt(e.target.value) || 0 })}
                  className="input"
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="label">Msgs por lote</label>
                <input
                  type="number" min={1}
                  value={config.msgs_por_lote}
                  onChange={e => isAdmin && setConfig({ ...config, msgs_por_lote: parseInt(e.target.value) || 1 })}
                  className="input"
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Pausa entre msgs no lote (s)</label>
                <input
                  type="number" min={1}
                  value={Math.round(config.pausa_entre_msgs_ms / 1000)}
                  onChange={e => isAdmin && setConfig({ ...config, pausa_entre_msgs_ms: (parseInt(e.target.value) || 1) * 1000 })}
                  className="input"
                  disabled={!isAdmin}
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Pausa fixa dentro de cada lote</p>
              </div>
              <div>
                <label className="label">Pausa mín. entre lotes (s)</label>
                <input
                  type="number" min={1}
                  value={Math.round(config.pausa_min_ms / 1000)}
                  onChange={e => isAdmin && setConfig({ ...config, pausa_min_ms: (parseInt(e.target.value) || 1) * 1000 })}
                  className="input"
                  disabled={!isAdmin}
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Mínimo do intervalo aleatório</p>
              </div>
              <div>
                <label className="label">Pausa máx. entre lotes (s)</label>
                <input
                  type="number" min={1}
                  value={Math.round(config.pausa_max_ms / 1000)}
                  onChange={e => isAdmin && setConfig({ ...config, pausa_max_ms: (parseInt(e.target.value) || 1) * 1000 })}
                  className="input"
                  disabled={!isAdmin}
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Máximo do intervalo aleatório</p>
              </div>
            </div>
            <div>
              <label className="label">Template de mensagem (use {'{CLIENTE}'} para o nome)</label>
              <textarea
                rows={8}
                value={config.mensagem_template}
                onChange={e => isAdmin && setConfig({ ...config, mensagem_template: e.target.value })}
                className="input font-mono text-xs"
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="label">Preview</label>
              <pre className="text-xs bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                {previewMensagem}
              </pre>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <button onClick={salvarConfig} disabled={savingCfg} className="btn-primary text-sm flex items-center gap-1.5">
                  <Save size={14} /> {savingCfg ? 'Salvando…' : 'Salvar configurações'}
                </button>
                {savedMsg && (
                  <span className={`text-xs ${savedMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                    {savedMsg}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Clientes por dia ── */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Calendar size={16} className="text-orange-500" /> Clientes por dia da semana
        </h3>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl w-fit">
          {DIAS.map(d => (
            <button
              key={d.key}
              onClick={() => setDiaTab(d.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                diaTab === d.key
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
            >
              {d.label} ({contagemDias[d.key] ?? 0})
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {clientesPorDia.length} cliente{clientesPorDia.length !== 1 ? 's' : ''} receberão mensagem
        </p>
        <div className="max-h-64 overflow-auto divide-y divide-slate-100 dark:divide-slate-700">
          {clientesPorDia.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Nenhum cliente para este dia.</p>
          ) : clientesPorDia.map((c, i) => (
            <div key={i} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{c.nome}</span>
              <span className="text-xs text-slate-400 font-mono">{mascararTelefone(c.telefone)}</span>
              {c.rota && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500">{c.rota}</span>
              )}
              {c.turno && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-500">{c.turno}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Feriados ── */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Calendar size={16} className="text-orange-500" /> Feriados (sem envio)
        </h3>
        {isAdmin ? (
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="label">Data</label>
              <input type="date" value={novoFeriadoData} onChange={e => setNovoFeriadoData(e.target.value)} className="input" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label">Descrição</label>
              <input type="text" placeholder="Ex.: Natal" value={novoFeriadoDesc} onChange={e => setNovoFeriadoDesc(e.target.value)} className="input" />
            </div>
            <button onClick={adicionarFeriado} disabled={!novoFeriadoData} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus size={14} /> Adicionar
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">🔒 Somente administradores podem adicionar feriados.</p>
        )}
        {feriados.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum feriado cadastrado.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {feriados.map(f => (
              <div key={f.id} className="flex items-center gap-2 py-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {format(parseISO(f.data), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                <span className="flex-1 text-xs text-slate-500 dark:text-slate-400 truncate">{f.descricao ?? ''}</span>
                {isAdmin && (
                  <button onClick={() => removerFeriado(f.id)} className="text-slate-400 hover:text-red-500 p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Fila atual ── */}
      {fila.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock size={16} className="text-orange-500" /> Fila de hoje ({fila.length})
            </h3>
            {isAdmin && fila.some(f => f.status === 'pendente') && (
              <button onClick={cancelarFila} className="btn-danger text-xs flex items-center gap-1.5">
                <MinusCircle size={13} /> Cancelar pendentes
              </button>
            )}
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase text-[10px]">
                  <th className="py-1">Cliente</th>
                  <th className="py-1">Telefone</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Processado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {fila.map(f => (
                  <tr key={f.id}>
                    <td className="py-1.5 truncate max-w-[140px] text-slate-700 dark:text-slate-200">{f.cliente_nome}</td>
                    <td className="py-1.5 font-mono text-slate-400">{mascararTelefone(f.telefone)}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[f.status] ?? STATUS_STYLE.pendente}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-400">
                      {f.processed_at ? format(parseISO(f.processed_at), 'HH:mm') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Logs ── */}
      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Send size={16} className="text-orange-500" /> Log de envios
        </h3>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={logFiltroData} onChange={e => setLogFiltroData(e.target.value)} className="input sm:w-40" />
          <select value={logFiltroStatus} onChange={e => setLogFiltroStatus(e.target.value)} className="input sm:w-40">
            <option value="">Todos status</option>
            <option value="enviado">Enviado</option>
            <option value="erro">Erro</option>
            <option value="simulado">Simulado</option>
            <option value="sistema">Sistema</option>
            <option value="ignorado">Ignorado</option>
          </select>
          {(logFiltroData || logFiltroStatus) && (
            <button onClick={() => { setLogFiltroData(''); setLogFiltroStatus('') }} className="btn-ghost text-xs">
              Limpar
            </button>
          )}
        </div>
        {logsFiltrados.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">Nenhum log encontrado.</p>
        ) : (
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase text-[10px]">
                  <th className="py-1">Data/Hora</th>
                  <th className="py-1">Cliente</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {logsFiltrados.map(l => (
                  <tr key={l.id}>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">
                      {format(parseISO(l.created_at), 'dd/MM HH:mm')}
                    </td>
                    <td className="py-1.5 truncate max-w-[120px] text-slate-700 dark:text-slate-200">
                      {l.cliente_nome ?? '—'}
                    </td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLE[l.status] ?? STATUS_STYLE.sistema}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-red-500 truncate max-w-[160px]">{l.erro ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recomendações Anti-Bloqueio ── */}
      <div className="card p-4 space-y-3 border-l-4 border-l-emerald-500">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-500" /> Recomendações Anti-Bloqueio
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Práticas recomendadas para reduzir o risco de bloqueio do número pela Meta/WhatsApp.
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1">📉 Volume e ritmo</p>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Mantenha no máximo 2 mensagens por minuto; aqueça números novos com volume baixo na primeira semana.</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Não envie em intervalos exatos — use pausas aleatórias entre lotes para parecer humano.</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Concentre envios em poucas horas do dia; evite disparos contínuos por longos períodos.</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1">✅ Consentimento</p>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Envie apenas para clientes que já compraram e esperam o contato (opt-in).</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Ofereça forma fácil de sair — instrua o cliente a responder "PARAR" para não receber mais.</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Respeite a flag "mensagem = NÃO" do cadastro do cliente.</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1">💬 Conteúdo e engajamento</p>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Envie texto útil e personalizado; evite mídia (imagem/vídeo) não solicitada e várias promoções seguidas.</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Busque alta taxa de resposta (meta: 30+ respostas a cada 100 mensagens) — baixo engajamento aumenta risco de ban.</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Monitore bloqueios e denúncias dos clientes; eles derrubam a nota de qualidade do número.</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1">🛡️ Conta e ferramenta</p>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Prefira a WhatsApp Business API oficial (ou um BSP verificado) — ela foi feita para automação e volume.</li>
              <li className="flex gap-2"><CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" /> Acompanhe a nota de qualidade (Verde/Amarelo/Vermelho); queda na nota reduz limites de envio.</li>
              <li className="flex gap-2"><AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" /> Em caso de restrição, recorra pelo Business Support do Facebook; o selo Meta Verified ajuda a recuperar e dar credibilidade.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
