import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, AlertCircle, X, Pencil, Trash2, Inbox, AlertTriangle, CheckCircle2, Building2, CalendarClock } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { fmtDia, fmtDate } from '../../lib/format'
import { useAuth } from '../../contexts/AuthContext'
import { useEscKey } from '../../hooks/useEscKey'
import ClientSearchInput from '../ClientSearchInput'
import { SETORES_DEMANDA, type ComiteDemanda, type Prioridade3, type SetorDemanda, type StatusDemanda } from '../../types'

const STATUS: Record<StatusDemanda, { rotulo: string; cor: string }> = {
  aberta:       { rotulo: 'Aberta',       cor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  em_andamento: { rotulo: 'Em andamento', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  resolvida:    { rotulo: 'Resolvida',    cor: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  cancelada:    { rotulo: 'Cancelada',    cor: 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200' },
}
const PRIORIDADE: Record<Prioridade3, { rotulo: string; cor: string }> = {
  alta:  { rotulo: 'Alta',  cor: 'text-red-600' },
  media: { rotulo: 'Média', cor: 'text-amber-600' },
  baixa: { rotulo: 'Baixa', cor: 'text-slate-500' },
}
const ORDEM_PRIO: Record<Prioridade3, number> = { alta: 0, media: 1, baixa: 2 }

type Filtro = 'abertas' | 'resolvidas' | 'todas'

/** Demandas e problemas do Comercial que dependem de outros setores. Não depende da semana. */
export default function ComiteDemandas({ ini }: { ini: string }) {
  const { isAdmin } = useAuth()
  const [lista, setLista] = useState<ComiteDemanda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('abertas')
  const [setor, setSetor] = useState<SetorDemanda | ''>('')
  const [editando, setEditando] = useState<ComiteDemanda | null | undefined>(undefined)

  const carregar = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.from('crm_comite_demandas').select('*').order('created_at', { ascending: false }).limit(500)
    if (err) setError(err.message)
    setLista((data ?? []) as ComiteDemanda[])
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const filtrada = useMemo(() => lista
    .filter(d => (filtro === 'abertas' ? ['aberta', 'em_andamento'].includes(d.status) : filtro === 'resolvidas' ? ['resolvida', 'cancelada'].includes(d.status) : true))
    .filter(d => !setor || d.setor === setor)
    .sort((a, b) => filtro === 'abertas'
      ? ORDEM_PRIO[a.prioridade] - ORDEM_PRIO[b.prioridade] || a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at)),
  [lista, filtro, setor])

  const porSetor = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of lista) if (['aberta', 'em_andamento'].includes(d.status)) m.set(d.setor, (m.get(d.setor) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lista])

  async function mudarStatus(d: ComiteDemanda, status: StatusDemanda) {
    let resolucao = d.resolucao
    if (status === 'resolvida') {
      const r = prompt('Como foi resolvida? (opcional)', d.resolucao ?? '')
      if (r === null) return
      resolucao = r.trim() || null
    }
    const patch = { status, resolucao, resolvida_em: status === 'resolvida' ? new Date().toISOString() : null }
    const { error: err } = await supabase.from('crm_comite_demandas').update(patch).eq('id', d.id)
    if (err) { toast.error(err.message); return }
    setLista(l => l.map(x => (x.id === d.id ? { ...x, ...patch } : x)))
  }

  async function excluir(d: ComiteDemanda) {
    if (!confirm('Excluir esta demanda?')) return
    const { error: err } = await supabase.from('crm_comite_demandas').delete().eq('id', d.id)
    if (err) { toast.error(err.message); return }
    setLista(l => l.filter(x => x.id !== d.id))
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            {([['abertas', 'Em aberto'], ['resolvidas', 'Resolvidas'], ['todas', 'Todas']] as [Filtro, string][]).map(([f, l]) => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`px-3 py-1 rounded-md text-xs font-semibold ${filtro === f ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                {l}
              </button>
            ))}
          </div>
          <select className="input w-auto text-xs" value={setor} onChange={e => setSetor(e.target.value as SetorDemanda | '')}>
            <option value="">Todos os setores</option>
            {SETORES_DEMANDA.map(s => <option key={s}>{s}</option>)}
          </select>
          <button onClick={carregar} className="btn-ghost p-2" title="Atualizar"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setEditando(null)} className="btn-primary text-xs ml-auto"><Plus size={14} /> Nova demanda / problema</button>
        </div>
        {porSetor.length > 0 && (
          <div className="flex gap-1 flex-wrap text-[11px]">
            <span className="text-slate-500 mr-1">Em aberto por setor:</span>
            {porSetor.map(([s, n]) => (
              <button key={s} onClick={() => setSetor(setor === s ? '' : s as SetorDemanda)}
                className={`px-2 py-0.5 rounded-full ${setor === s ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {s}: <strong>{n}</strong>
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle size={16} /> {error}</div>
      ) : loading && lista.length === 0 ? (
        <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
      ) : filtrada.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">
          <Inbox size={26} className="mx-auto mb-2 opacity-40" />
          {filtro === 'abertas' ? 'Nenhuma demanda em aberto.' : 'Nada por aqui.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrada.map(d => {
            const st = STATUS[d.status], pr = PRIORIDADE[d.prioridade]
            const dias = differenceInCalendarDays(new Date(), parseISO(d.created_at))
            const atrasada = d.prazo && d.prazo < new Date().toISOString().slice(0, 10) && ['aberta', 'em_andamento'].includes(d.status)
            const novaNaSemana = d.created_at.slice(0, 10) >= ini
            return (
              <div key={d.id} className="card p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className={`font-bold px-1.5 py-0.5 rounded ${d.tipo === 'problema' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'}`}>
                        {d.tipo === 'problema' ? <AlertTriangle size={10} className="inline mr-0.5" /> : null}{d.tipo === 'problema' ? 'Problema' : 'Demanda'}
                      </span>
                      <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">→ {d.setor}</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${st.cor}`}>{st.rotulo}</span>
                      <span className={`font-semibold ${pr.cor}`}>Prioridade {pr.rotulo.toLowerCase()}</span>
                      {novaNaSemana && <span className="font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">nova na semana</span>}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{d.titulo}</p>
                    {d.descricao && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-0.5">{d.descricao}</p>}
                    <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1 text-[11px] text-slate-500">
                      {d.cliente_nome && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {d.cliente_nome}</span>}
                      {d.responsavel && <span>Responsável: {d.responsavel}</span>}
                      {d.prazo && <span className={`inline-flex items-center gap-1 ${atrasada ? 'text-red-600 font-semibold' : ''}`}><CalendarClock size={11} /> Prazo {fmtDia(d.prazo)}{atrasada ? ' (atrasada)' : ''}</span>}
                      <span>Aberta em {fmtDate(d.created_at)}{['aberta', 'em_andamento'].includes(d.status) && dias > 0 ? ` · há ${dias}d` : ''}{d.created_by_nome ? ` por ${d.created_by_nome}` : ''}</span>
                    </div>
                    {d.resolucao && <p className="text-xs text-green-700 dark:text-green-400 mt-1"><strong>Resolução:</strong> {d.resolucao}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex gap-0.5">
                      {['aberta', 'em_andamento'].includes(d.status) && (
                        <button onClick={() => mudarStatus(d, 'resolvida')} className="btn-ghost p-1.5 text-green-600" title="Marcar como resolvida"><CheckCircle2 size={15} /></button>
                      )}
                      <button onClick={() => setEditando(d)} className="btn-ghost p-1.5 text-slate-500" title="Editar"><Pencil size={14} /></button>
                      {isAdmin && <button onClick={() => excluir(d)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>}
                    </div>
                    {d.status === 'aberta' && <button onClick={() => mudarStatus(d, 'em_andamento')} className="text-[11px] text-blue-600 hover:underline">Em andamento</button>}
                    {['resolvida', 'cancelada'].includes(d.status) && <button onClick={() => mudarStatus(d, 'aberta')} className="text-[11px] text-slate-500 hover:underline">Reabrir</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editando !== undefined && (
        <DemandaModal demanda={editando} onClose={() => setEditando(undefined)} onSaved={() => { setEditando(undefined); carregar() }} />
      )}
    </div>
  )
}

function DemandaModal({ demanda, onClose, onSaved }: { demanda: ComiteDemanda | null; onClose: () => void; onSaved: () => void }) {
  useEscKey(useCallback(onClose, [onClose]))
  const { profile } = useAuth()
  const [form, setForm] = useState({
    tipo: demanda?.tipo ?? 'demanda' as 'demanda' | 'problema',
    titulo: demanda?.titulo ?? '',
    descricao: demanda?.descricao ?? '',
    setor: demanda?.setor ?? 'Financeiro' as SetorDemanda,
    prioridade: demanda?.prioridade ?? 'media' as Prioridade3,
    status: demanda?.status ?? 'aberta' as StatusDemanda,
    responsavel: demanda?.responsavel ?? '',
    prazo: demanda?.prazo ?? '',
    resolucao: demanda?.resolucao ?? '',
  })
  const [clientId, setClientId] = useState<string | null>(demanda?.client_id ?? null)
  const [clienteNome, setClienteNome] = useState(demanda?.cliente_nome ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  async function salvar() {
    if (!form.titulo.trim()) { setError('Dê um título curto à demanda.'); return }
    setSaving(true); setError(null)
    const fechada = form.status === 'resolvida'
    const payload = {
      tipo: form.tipo, titulo: form.titulo.trim(), descricao: form.descricao.trim() || null,
      setor: form.setor, prioridade: form.prioridade, status: form.status,
      responsavel: form.responsavel.trim() || null, prazo: form.prazo || null,
      resolucao: form.resolucao.trim() || null,
      resolvida_em: fechada ? (demanda?.resolvida_em ?? new Date().toISOString()) : null,
      client_id: clientId, cliente_nome: clienteNome.trim() || null,
      ...(demanda ? {} : { created_by_nome: profile?.nome ?? null }),
    }
    const { error: err } = demanda
      ? await supabase.from('crm_comite_demandas').update(payload).eq('id', demanda.id)
      : await supabase.from('crm_comite_demandas').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    toast.success(demanda ? 'Demanda atualizada' : 'Demanda registrada')
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{demanda ? 'Editar demanda' : 'Nova demanda ou problema'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex gap-2">
            {([['demanda', 'Demanda (precisamos de algo)'], ['problema', 'Problema (algo está atrapalhando)']] as ['demanda' | 'problema', string][]).map(([t, l]) => (
              <button key={t} type="button" onClick={() => set('tipo', t)}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${form.tipo === t ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300' : 'border-slate-200 dark:border-slate-600 text-slate-500'}`}>
                {l}
              </button>
            ))}
          </div>
          <div><label className="label">Título *</label><input className="input" value={form.titulo} maxLength={140} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Liberar prazo de 28 dias para redes de mercado" /></div>
          <div><label className="label">Detalhes</label><textarea className="input" rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Contexto, impacto nas vendas, o que se espera do setor..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Setor responsável</label>
              <select className="input" value={form.setor} onChange={e => set('setor', e.target.value as SetorDemanda)}>
                {SETORES_DEMANDA.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={form.prioridade} onChange={e => set('prioridade', e.target.value as Prioridade3)}>
                <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Responsável no setor</label><input className="input" value={form.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Opcional" /></div>
            <div><label className="label">Prazo</label><input type="date" className="input" value={form.prazo} onChange={e => set('prazo', e.target.value)} /></div>
          </div>
          <div>
            <label className="label">Cliente relacionado (opcional)</label>
            <ClientSearchInput clientId={clientId} search={clienteNome} onChange={(id, nome) => { setClientId(id); setClienteNome(nome) }} />
          </div>
          {demanda && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value as StatusDemanda)}>
                {(Object.keys(STATUS) as StatusDemanda[]).map(s => <option key={s} value={s}>{STATUS[s].rotulo}</option>)}
              </select>
            </div>
          )}
          {(form.status === 'resolvida' || form.status === 'cancelada') && (
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
