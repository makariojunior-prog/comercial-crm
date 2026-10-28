import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, RefreshCw, AlertCircle, X, Pencil, Trash2, CheckCircle2, User, Truck, Building2, Settings, ClipboardList } from 'lucide-react'
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { fmtCurrency, fmtDia } from '../lib/format'
import { useAuth } from '../contexts/AuthContext'
import { useEscKey } from '../hooks/useEscKey'
import ClientSearchInput from './ClientSearchInput'
import TiposOcorrenciaConfig from './TiposOcorrenciaConfig'
import type { Driver, LogOcorrencia, Prioridade3, TipoOcorrencia, Vehicle } from '../types'

const GRAVIDADE: Record<Prioridade3, { rotulo: string; cor: string }> = {
  alta:  { rotulo: 'Alta',  cor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  media: { rotulo: 'Média', cor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  baixa: { rotulo: 'Baixa', cor: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}
const SELECT = '*, tipo:tipos_ocorrencia(id,nome,emoji,cor), driver:crm_drivers(id,nome), vehicle:crm_vehicles(id,apelido,placa)'
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

type Periodo = 'semana' | 'mes' | 'todos'

interface Props {
  drivers: Driver[]
  vehicles: Vehicle[]
}

export default function OcorrenciasLogisticaTab({ drivers, vehicles }: Props) {
  const { isAdmin } = useAuth()
  const [sub, setSub] = useState<'registro' | 'tipos'>('registro')
  const [lista, setLista] = useState<LogOcorrencia[]>([])
  const [tipos, setTipos] = useState<TipoOcorrencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [status, setStatus] = useState<'' | 'aberta' | 'resolvida'>('')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<LogOcorrencia | null | undefined>(undefined)

  const faixa = useMemo(() => {
    const hoje = new Date()
    if (periodo === 'semana') return { de: iso(startOfWeek(hoje, { weekStartsOn: 1 })), ate: iso(endOfWeek(hoje, { weekStartsOn: 1 })) }
    if (periodo === 'mes') return { de: iso(startOfMonth(hoje)), ate: iso(endOfMonth(hoje)) }
    return null
  }, [periodo])

  const carregar = useCallback(async () => {
    setLoading(true); setError(null)
    let q = supabase.from('log_ocorrencias').select(SELECT).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (faixa) q = q.gte('data', faixa.de).lte('data', faixa.ate)
    const [o, t] = await Promise.all([q, supabase.from('tipos_ocorrencia').select('*').eq('ativo', true).order('ordem')])
    if (o.error) setError(o.error.message)
    setLista((o.data ?? []) as LogOcorrencia[])
    // "Sem Ocorrência" é da conciliação; não faz sentido num registro de ocorrência
    setTipos(((t.data ?? []) as TipoOcorrencia[]).filter(x => !/^sem ocorr/i.test(x.nome)))
    setLoading(false)
  }, [faixa])
  useEffect(() => { if (sub === 'registro') carregar() }, [carregar, sub])

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter(o => {
      if (status && o.status !== status) return false
      if (!q) return true
      return [o.descricao, o.cliente_nome, o.driver?.nome, o.vehicle?.apelido, o.vehicle?.placa, o.tipo?.nome]
        .some(x => (x ?? '').toLowerCase().includes(q))
    })
  }, [lista, busca, status])

  const resumo = useMemo(() => ({
    total: lista.length,
    abertas: lista.filter(o => o.status === 'aberta').length,
    graves: lista.filter(o => o.gravidade === 'alta').length,
    prejuizo: lista.reduce((s, o) => s + Number(o.prejuizo ?? 0), 0),
  }), [lista])

  async function excluir(o: LogOcorrencia) {
    if (!confirm('Excluir esta ocorrência?')) return
    const { error: e } = await supabase.from('log_ocorrencias').delete().eq('id', o.id)
    if (e) { toast.error(e.message); return }
    setLista(l => l.filter(x => x.id !== o.id))
  }

  async function resolver(o: LogOcorrencia) {
    const resolucao = prompt('Como foi resolvida? (opcional)', o.resolucao ?? '')
    if (resolucao === null) return
    const { error: e } = await supabase.from('log_ocorrencias').update({ status: 'resolvida', resolucao: resolucao.trim() || null }).eq('id', o.id)
    if (e) { toast.error(e.message); return }
    setLista(l => l.map(x => (x.id === o.id ? { ...x, status: 'resolvida', resolucao: resolucao.trim() || null } : x)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
          <button onClick={() => setSub('registro')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold ${sub === 'registro' ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
            <ClipboardList size={13} /> Registro do dia a dia
          </button>
          {isAdmin && (
            <button onClick={() => setSub('tipos')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold ${sub === 'tipos' ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              <Settings size={13} /> Tipos de ocorrência
            </button>
          )}
        </div>
        {sub === 'registro' && (
          <button onClick={() => setEditando(null)} className="btn-primary ml-auto"><Plus size={16} /> Registrar ocorrência</button>
        )}
      </div>

      {sub === 'tipos' ? <TiposOcorrenciaConfig /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Ocorrências', String(resumo.total), 'text-slate-800 dark:text-slate-100'],
              ['Em aberto', String(resumo.abertas), resumo.abertas ? 'text-amber-600' : 'text-slate-800 dark:text-slate-100'],
              ['Gravidade alta', String(resumo.graves), resumo.graves ? 'text-red-600' : 'text-slate-800 dark:text-slate-100'],
              ['Prejuízo estimado', fmtCurrency(resumo.prejuizo), 'text-slate-800 dark:text-slate-100'],
            ].map(([l, v, cor]) => (
              <div key={l} className="card p-3">
                <p className="text-[11px] text-slate-500">{l}</p>
                <p className={`text-lg font-bold tabular-nums ${cor}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="card p-3 flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Buscar cliente, motorista, veículo ou descrição..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <select className="input w-auto text-xs" value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}>
              <option value="semana">Esta semana</option>
              <option value="mes">Este mês</option>
              <option value="todos">Todas</option>
            </select>
            <select className="input w-auto text-xs" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
              <option value="">Todos os status</option>
              <option value="aberta">Em aberto</option>
              <option value="resolvida">Resolvidas</option>
            </select>
            <button onClick={carregar} className="btn-ghost p-2" title="Atualizar"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          </div>
          <p className="text-[11px] text-slate-400 px-1">As ocorrências da semana entram automaticamente no Comitê (aba Logística).</p>

          {error ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle size={16} /> {error}</div>
          ) : loading && lista.length === 0 ? (
            <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
          ) : filtrada.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm">Nenhuma ocorrência registrada neste período.</div>
          ) : (
            <div className="space-y-2">
              {filtrada.map(o => <CardOcorrencia key={o.id} o={o} isAdmin={isAdmin} onEdit={() => setEditando(o)} onResolver={() => resolver(o)} onDelete={() => excluir(o)} />)}
            </div>
          )}
        </>
      )}

      {editando !== undefined && (
        <OcorrenciaModal ocorrencia={editando} tipos={tipos}
          drivers={drivers.filter(d => d.ativo || d.id === editando?.driver_id)}
          vehicles={vehicles.filter(v => v.ativo || v.id === editando?.vehicle_id)}
          onClose={() => setEditando(undefined)} onSaved={() => { setEditando(undefined); carregar() }} />
      )}
    </div>
  )
}

export function CardOcorrencia({ o, isAdmin, onEdit, onResolver, onDelete }: {
  o: LogOcorrencia; isAdmin?: boolean; onEdit?: () => void; onResolver?: () => void; onDelete?: () => void
}) {
  const g = GRAVIDADE[o.gravidade]
  return (
    <div className="card p-3 border-l-4" style={{ borderLeftColor: o.tipo?.cor ?? '#94a3b8' }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtDia(o.data)}</span>
            {o.tipo && <span className="font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">{o.tipo.emoji} {o.tipo.nome}</span>}
            <span className={`font-bold px-1.5 py-0.5 rounded ${g.cor}`}>{g.rotulo}</span>
            {o.status === 'resolvida'
              ? <span className="font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Resolvida</span>
              : <span className="font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">Em aberto</span>}
            {o.prejuizo != null && Number(o.prejuizo) > 0 && <span className="font-semibold text-red-600">{fmtCurrency(Number(o.prejuizo))}</span>}
          </div>
          <p className="text-sm text-slate-800 dark:text-slate-100 mt-1 whitespace-pre-wrap">{o.descricao}</p>
          <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1 text-[11px] text-slate-500">
            {o.cliente_nome && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {o.cliente_nome}</span>}
            {o.driver && <span className="inline-flex items-center gap-1"><User size={11} /> {o.driver.nome}</span>}
            {o.vehicle && <span className="inline-flex items-center gap-1"><Truck size={11} /> {o.vehicle.apelido}{o.vehicle.placa ? ` (${o.vehicle.placa})` : ''}</span>}
            {o.created_by_nome && <span>· registrada por {o.created_by_nome}</span>}
          </div>
          {o.resolucao && <p className="text-xs text-green-700 dark:text-green-400 mt-1"><strong>Resolução:</strong> {o.resolucao}</p>}
        </div>
        {(onEdit || onResolver || onDelete) && (
          <div className="flex gap-0.5 shrink-0">
            {o.status === 'aberta' && onResolver && <button onClick={onResolver} className="btn-ghost p-1.5 text-green-600" title="Marcar como resolvida"><CheckCircle2 size={15} /></button>}
            {onEdit && <button onClick={onEdit} className="btn-ghost p-1.5 text-slate-500" title="Editar"><Pencil size={14} /></button>}
            {isAdmin && onDelete && <button onClick={onDelete} className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>}
          </div>
        )}
      </div>
    </div>
  )
}

function OcorrenciaModal({ ocorrencia, tipos, drivers, vehicles, onClose, onSaved }: {
  ocorrencia: LogOcorrencia | null; tipos: TipoOcorrencia[]; drivers: Driver[]; vehicles: Vehicle[]
  onClose: () => void; onSaved: () => void
}) {
  useEscKey(useCallback(onClose, [onClose]))
  const { profile } = useAuth()
  const [form, setForm] = useState({
    data: ocorrencia?.data ?? iso(new Date()),
    tipo_id: ocorrencia?.tipo_id ?? '',
    gravidade: ocorrencia?.gravidade ?? 'media' as Prioridade3,
    descricao: ocorrencia?.descricao ?? '',
    driver_id: ocorrencia?.driver_id ?? '',
    vehicle_id: ocorrencia?.vehicle_id ?? '',
    prejuizo: ocorrencia?.prejuizo != null ? String(ocorrencia.prejuizo) : '',
    status: ocorrencia?.status ?? 'aberta' as 'aberta' | 'resolvida',
    resolucao: ocorrencia?.resolucao ?? '',
  })
  const [clientId, setClientId] = useState<string | null>(ocorrencia?.client_id ?? null)
  const [clienteNome, setClienteNome] = useState(ocorrencia?.cliente_nome ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  function escolherVeiculo(id: string) {
    set('vehicle_id', id)
    // Sugere o motorista titular do veículo quando ainda não há motorista escolhido
    const v = vehicles.find(x => x.id === id)
    if (v?.driver_id && !form.driver_id) set('driver_id', v.driver_id)
  }

  async function salvar() {
    if (!form.descricao.trim()) { setError('Descreva o que aconteceu.'); return }
    const prejuizo = form.prejuizo.trim() ? Number(form.prejuizo.replace(/\./g, '').replace(',', '.')) : null
    if (prejuizo != null && (isNaN(prejuizo) || prejuizo < 0)) { setError('Prejuízo inválido.'); return }
    setSaving(true); setError(null)
    const payload = {
      data: form.data,
      tipo_id: form.tipo_id || null,
      gravidade: form.gravidade,
      descricao: form.descricao.trim(),
      driver_id: form.driver_id || null,
      vehicle_id: form.vehicle_id || null,
      prejuizo,
      status: form.status,
      resolucao: form.resolucao.trim() || null,
      client_id: clientId,
      cliente_nome: clienteNome.trim() || null,
      ...(ocorrencia ? {} : { created_by_nome: profile?.nome ?? null }),
    }
    const { error: e } = ocorrencia
      ? await supabase.from('log_ocorrencias').update(payload).eq('id', ocorrencia.id)
      : await supabase.from('log_ocorrencias').insert(payload)
    setSaving(false)
    if (e) { setError(e.message); return }
    toast.success(ocorrencia ? 'Ocorrência atualizada' : 'Ocorrência registrada')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{ocorrencia ? 'Editar ocorrência' : 'Registrar ocorrência'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Data</label><input type="date" className="input" value={form.data} onChange={e => set('data', e.target.value)} /></div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                <option value="">— Sem tipo —</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Gravidade</label>
            <div className="flex gap-2">
              {(['baixa', 'media', 'alta'] as Prioridade3[]).map(g => (
                <button key={g} type="button" onClick={() => set('gravidade', g)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${form.gravidade === g ? `${GRAVIDADE[g].cor} border-transparent ring-2 ring-orange-300` : 'border-slate-200 dark:border-slate-600 text-slate-500'}`}>
                  {GRAVIDADE[g].rotulo}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">O que aconteceu *</label>
            <textarea className="input" rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)}
              placeholder="Ex.: Cliente recusou parte da carga por embalagem amassada; voltaram 2 caixas." />
          </div>
          <div>
            <label className="label">Cliente (opcional)</label>
            <ClientSearchInput clientId={clientId} search={clienteNome} onChange={(id, nome) => { setClientId(id); setClienteNome(nome) }}
              placeholder="Vincular a um cliente do cadastro..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Veículo (opcional)</label>
              <select className="input" value={form.vehicle_id} onChange={e => escolherVeiculo(e.target.value)}>
                <option value="">—</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.apelido}{v.placa ? ` · ${v.placa}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Motorista (opcional)</label>
              <select className="input" value={form.driver_id} onChange={e => set('driver_id', e.target.value)}>
                <option value="">—</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Prejuízo estimado (R$)</label><input className="input" inputMode="decimal" placeholder="0,00" value={form.prejuizo} onChange={e => set('prejuizo', e.target.value)} /></div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value as 'aberta' | 'resolvida')}>
                <option value="aberta">Em aberto</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </div>
          </div>
          {form.status === 'resolvida' && (
            <div><label className="label">Resolução</label><textarea className="input" rows={2} value={form.resolucao} onChange={e => set('resolucao', e.target.value)} /></div>
          )}
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"><AlertCircle size={15} /> {error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="btn-primary">{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
