import { useState, useEffect } from 'react'
import { X, CheckCircle2, SkipForward, AlertCircle, ChevronDown, ChevronUp, Loader2, Flag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Route, RouteExecution, RouteClientCheck } from '../types'
import { RESPONSAVEIS } from '../types'

interface Props {
  route: Route
  onClose: () => void
  onSaved: () => void
}

interface ClientCheckDraft {
  route_client_id: string
  client_id: string
  client_name: string
  observations: string | null
  visit_order: number
  status: 'PENDENTE' | 'VISITADO' | 'PULADO'
  report: string
  demand: string
  priority: string
  expanded: boolean
  saving: boolean
  check_id?: string
  visit_id?: string
}

export default function RouteExecutionModal({ route, onClose, onSaved }: Props) {
  const { user, profile } = useAuth()
  const [execution, setExecution]   = useState<RouteExecution | null>(null)
  const [checks, setChecks]         = useState<ClientCheckDraft[]>([])
  const [loading, setLoading]       = useState(true)
  const [finishing, setFinishing]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [responsible, setResponsible] = useState(profile?.nome ?? '')

  useEffect(() => {
    if (profile?.nome) setResponsible(profile.nome)
  }, [profile])

  useEffect(() => {
    startOrResumeExecution()
  }, [route.id])

  async function startOrResumeExecution() {
    setLoading(true)

    // Check for existing in-progress execution (maybeSingle = null when not found, no error)
    const { data: existing } = await supabase
      .from('crm_route_executions')
      .select('*')
      .eq('route_id', route.id)
      .eq('status', 'EM_ANDAMENTO')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let exec: RouteExecution

    if (existing) {
      exec = existing as RouteExecution
    } else {
      // Create new execution
      const { data, error: e } = await supabase
        .from('crm_route_executions')
        .insert({
          route_id:    route.id,
          executor_id: user?.id ?? null,
          status:      'EM_ANDAMENTO',
          started_at:  new Date().toISOString(),
          scheduled_date: new Date().toISOString().split('T')[0],
        })
        .select()
        .single()
      if (e) { setError(e.message); setLoading(false); return }
      exec = data as RouteExecution
    }

    setExecution(exec)

    // Load route clients
    const { data: routeClients } = await supabase
      .from('crm_route_clients')
      .select('*, client:crm_clients(id, nome, setor, telefone)')
      .eq('route_id', route.id)
      .order('visit_order')

    // Load existing checks for this execution
    const { data: existingChecks } = await supabase
      .from('crm_route_client_checks')
      .select('*')
      .eq('execution_id', exec.id)

    const checkMap = Object.fromEntries((existingChecks || []).map((c: any) => [c.route_client_id, c]))

    setChecks((routeClients || []).map((rc: any) => {
      const existing = checkMap[rc.id]
      return {
        route_client_id: rc.id,
        client_id:       rc.client_id,
        client_name:     rc.client?.nome ?? 'Cliente',
        observations:    rc.observations,
        visit_order:     rc.visit_order,
        status:          existing?.status ?? 'PENDENTE',
        report:          existing?.report ?? '',
        demand:          existing?.demand ?? '',
        priority:        existing?.priority ?? 'MÉDIA',
        expanded:        false,
        saving:          false,
        check_id:        existing?.id,
        visit_id:        existing?.visit_id,
      }
    }))

    setLoading(false)
  }

  async function markClient(idx: number, status: 'VISITADO' | 'PULADO') {
    if (!execution) return
    const check = checks[idx]
    const isVisited = status === 'VISITADO'

    // Expand form if marking as visited
    if (isVisited && !check.expanded) {
      setChecks(prev => prev.map((c, i) => i === idx ? { ...c, expanded: true, status } : c))
      return
    }

    setChecks(prev => prev.map((c, i) => i === idx ? { ...c, saving: true } : c))

    try {
      let visitId = check.visit_id

      // Create visit record if marking as visited
      if (isVisited && !visitId) {
        const { data: visitData, error: ve } = await supabase
          .from('visits')
          .insert({
            visit_date:    new Date().toISOString().split('T')[0],
            visit_type:    'Acompanhamento',
            client_name:   check.client_name,
            responsible:   responsible || profile?.nome || 'Equipe',
            responsaveis:  responsible ? [responsible] : (profile?.nome ? [profile.nome] : []),
            demand:        check.demand || null,
            report:        check.report || null,
            priority:      check.priority,
            status:        'Realizada',
          })
          .select()
          .single()
        if (ve) throw ve
        visitId = visitData.id
      }

      const checkData = {
        execution_id:    execution.id,
        route_client_id: check.route_client_id,
        client_id:       check.client_id,
        client_name:     check.client_name,
        status,
        checked_at:      new Date().toISOString(),
        report:          check.report || null,
        demand:          check.demand || null,
        priority:        check.priority,
        visit_id:        visitId ?? null,
      }

      if (check.check_id) {
        await supabase.from('crm_route_client_checks').update(checkData).eq('id', check.check_id)
      } else {
        const { data: newCheck } = await supabase
          .from('crm_route_client_checks')
          .insert(checkData)
          .select()
          .single()
        setChecks(prev => prev.map((c, i) => i === idx ? { ...c, check_id: newCheck?.id } : c))
      }

      setChecks(prev => prev.map((c, i) =>
        i === idx ? { ...c, status, saving: false, expanded: false, visit_id: visitId } : c
      ))
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao registrar.')
      setChecks(prev => prev.map((c, i) => i === idx ? { ...c, saving: false } : c))
    }
  }

  async function finishRoute() {
    if (!execution) return
    setFinishing(true)
    await supabase.from('crm_route_executions').update({
      status:       'CONCLUIDA',
      completed_at: new Date().toISOString(),
    }).eq('id', execution.id)
    setFinishing(false)
    onSaved()
    onClose()
  }

  const visited = checks.filter(c => c.status === 'VISITADO').length
  const skipped = checks.filter(c => c.status === 'PULADO').length
  const pending = checks.filter(c => c.status === 'PENDENTE').length
  const progress = checks.length > 0 ? ((visited + skipped) / checks.length) * 100 : 0

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Executando Rota</p>
              <h2 className="font-bold text-slate-800 text-lg truncate">{route.name}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{visited + skipped} de {checks.length} clientes</span>
              <span className="font-bold text-orange-600">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex gap-3 text-[10px]">
              <span className="text-green-600 font-bold">✓ {visited} visitados</span>
              <span className="text-slate-400 font-bold">↷ {skipped} pulados</span>
              <span className="text-slate-400">⏳ {pending} pendentes</span>
            </div>
          </div>

          {/* Responsible override */}
          <div className="mt-3">
            <select
              className="input text-xs py-1.5"
              value={responsible}
              onChange={e => setResponsible(e.target.value)}
            >
              {RESPONSAVEIS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        {/* Client list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Carregando rota...</p>
            </div>
          ) : checks.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              Nenhum cliente nesta rota. Adicione clientes via "Editar Rota".
            </div>
          ) : checks.map((c, i) => (
            <div
              key={c.route_client_id}
              className={`rounded-xl border transition-all ${
                c.status === 'VISITADO' ? 'border-green-200 bg-green-50' :
                c.status === 'PULADO'   ? 'border-slate-200 bg-slate-50 opacity-60' :
                'border-slate-200 bg-white'
              }`}
            >
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800">{c.client_name}</p>
                    {c.observations && (
                      <p className="text-[11px] text-orange-700 bg-orange-50 rounded-lg px-2 py-1 mt-1 leading-relaxed border border-orange-100">
                        📋 {c.observations}
                      </p>
                    )}
                  </div>

                  {/* Status indicator */}
                  {c.status === 'VISITADO' && <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" />}
                  {c.status === 'PULADO'   && <SkipForward  size={18} className="text-slate-400 shrink-0 mt-0.5" />}
                </div>

                {/* Action buttons */}
                {c.status === 'PENDENTE' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setChecks(prev => prev.map((x, j) => j === i ? { ...x, expanded: !x.expanded, status: 'VISITADO' } : x))}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-colors"
                    >
                      <CheckCircle2 size={14} /> Marcar Visitado
                    </button>
                    <button
                      onClick={() => markClient(i, 'PULADO')}
                      disabled={c.saving}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 text-xs font-bold transition-colors flex items-center gap-1"
                    >
                      {c.saving ? <Loader2 size={13} className="animate-spin" /> : <SkipForward size={13} />}
                      Pular
                    </button>
                  </div>
                )}

                {/* Undo buttons */}
                {(c.status === 'VISITADO' || c.status === 'PULADO') && (
                  <button
                    onClick={async () => {
                      // Remove created visit so we don't leave orphans in the visits table
                      if (c.visit_id) {
                        await supabase.from('visits').delete().eq('id', c.visit_id)
                      }
                      if (c.check_id) {
                        await supabase
                          .from('crm_route_client_checks')
                          .update({ status: 'PENDENTE', checked_at: null, visit_id: null })
                          .eq('id', c.check_id)
                      }
                      setChecks(prev => prev.map((x, j) => j === i ? { ...x, status: 'PENDENTE', expanded: false, visit_id: undefined } : x))
                    }}
                    className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 underline"
                  >
                    Desfazer
                  </button>
                )}
              </div>

              {/* Expandable report form */}
              {c.expanded && c.status === 'VISITADO' && (
                <div className="px-3 pb-3 border-t border-green-100 mt-1 pt-3 space-y-3">
                  <div>
                    <label className="label text-[11px]">Demanda / O que foi fazer</label>
                    <input
                      className="input text-xs"
                      placeholder="Ex: Verificar exposição, ofertar produto X..."
                      value={c.demand}
                      onChange={e => setChecks(prev => prev.map((x, j) => j === i ? { ...x, demand: e.target.value } : x))}
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]">Relatório da Visita</label>
                    <textarea
                      className="input text-xs resize-none min-h-[70px]"
                      placeholder="O que aconteceu? Resultado, próximos passos..."
                      value={c.report}
                      onChange={e => setChecks(prev => prev.map((x, j) => j === i ? { ...x, report: e.target.value } : x))}
                    />
                  </div>
                  <div>
                    <label className="label text-[11px] flex items-center gap-1"><Flag size={11} /> Prioridade</label>
                    <div className="flex gap-2">
                      {['ALTA', 'MÉDIA', 'BAIXA'].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setChecks(prev => prev.map((x, j) => j === i ? { ...x, priority: p } : x))}
                          className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                            c.priority === p
                              ? p === 'ALTA'  ? 'bg-red-500 text-white border-red-600'
                              : p === 'MÉDIA' ? 'bg-amber-400 text-white border-amber-500'
                              : 'bg-slate-400 text-white border-slate-500'
                              : 'bg-white border-slate-200 text-slate-500'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => markClient(i, 'VISITADO')}
                    disabled={c.saving}
                    className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {c.saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                    Confirmar Visita
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 space-y-2">
          {pending > 0 && (
            <p className="text-xs text-center text-slate-400">
              {pending} cliente{pending !== 1 ? 's' : ''} ainda pendente{pending !== 1 ? 's' : ''}. Você pode finalizar mesmo assim.
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center py-3">Pausar</button>
            <button
              onClick={finishRoute}
              disabled={finishing}
              className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              {finishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Finalizar Rota
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
