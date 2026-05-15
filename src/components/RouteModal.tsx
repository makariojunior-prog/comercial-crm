import { useState, useEffect, useCallback } from 'react'
import { X, AlertCircle, Search, Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Route, RouteClient, CrmUser } from '../types'
import { ROUTE_DAYS, ROUTE_FREQUENCIES } from '../types'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  route?: Route | null
  onClose: () => void
  onSaved: () => void
}

interface ClientDraft {
  client_id: string
  client_nome: string
  client_setor: string | null
  visit_order: number
  observations: string
  existingId?: string
}

export default function RouteModal({ route, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [name, setName]           = useState(route?.name ?? '')
  const [description, setDesc]    = useState(route?.description ?? '')
  const [responsibleId, setResp]  = useState(route?.responsible_id ?? '')
  const [frequency, setFreq]      = useState(route?.frequency ?? 'semanal')
  const [days, setDays]           = useState<string[]>(route?.days_of_week ?? [])
  const [isActive, setIsActive]   = useState(route?.is_active ?? true)
  const [clients, setClients]     = useState<ClientDraft[]>([])
  const [users, setUsers]         = useState<CrmUser[]>([])
  const [clientSearch, setSearch] = useState('')
  const [searchResults, setResults] = useState<any[]>([])
  const [searching, setSearching]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [tab, setTab]               = useState<'info' | 'clients'>('info')

  useEffect(() => {
    supabase.from('crm_users').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setUsers(data as CrmUser[]) })

    if (route?.id) {
      supabase
        .from('crm_route_clients')
        .select('*, client:crm_clients(id, nome, setor)')
        .eq('route_id', route.id)
        .order('visit_order')
        .then(({ data }) => {
          if (data) {
            setClients(data.map((rc: any) => ({
              client_id:    rc.client_id,
              client_nome:  rc.client?.nome ?? '',
              client_setor: rc.client?.setor ?? null,
              visit_order:  rc.visit_order,
              observations: rc.observations ?? '',
              existingId:   rc.id,
            })))
          }
        })
    }
  }, [route?.id])

  useEffect(() => {
    if (clientSearch.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('crm_clients')
        .select('id, nome, setor')
        .ilike('nome', `%${clientSearch}%`)
        .eq('status', 'ATIVO')
        .limit(8)
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [clientSearch])

  function addClient(c: any) {
    if (clients.some(x => x.client_id === c.id)) return
    setClients(prev => [...prev, {
      client_id:    c.id,
      client_nome:  c.nome,
      client_setor: c.setor,
      visit_order:  prev.length,
      observations: '',
    }])
    setSearch('')
    setResults([])
  }

  function removeClient(idx: number) {
    setClients(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, visit_order: i })))
  }

  function moveClient(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= clients.length) return
    const arr = [...clients]
    ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    setClients(arr.map((c, i) => ({ ...c, visit_order: i })))
  }

  function updateObs(idx: number, val: string) {
    setClients(prev => prev.map((c, i) => i === idx ? { ...c, observations: val } : c))
  }

  function toggleDay(d: string) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function save() {
    if (!name.trim()) return setError('Nome da rota é obrigatório.')
    setSaving(true)
    setError(null)

    try {
      const routeData = {
        name: name.trim(),
        description: description.trim() || null,
        responsible_id: responsibleId || null,
        days_of_week: days,
        frequency,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      }

      let routeId = route?.id

      if (routeId) {
        const { error: e } = await supabase.from('crm_routes').update(routeData).eq('id', routeId)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.from('crm_routes').insert(routeData).select()
        if (e) throw e
        if (!data?.length) throw new Error('Nenhum dado retornado após criação da rota.')
        routeId = data[0].id
      }

      // Sync clients: delete all then re-insert
      await supabase.from('crm_route_clients').delete().eq('route_id', routeId)
      if (clients.length > 0) {
        const { error: e } = await supabase.from('crm_route_clients').insert(
          clients.map((c, i) => ({
            route_id:     routeId,
            client_id:    c.client_id,
            visit_order:  i,
            observations: c.observations.trim() || null,
          }))
        )
        if (e) throw e
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar rota.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800">{route?.id ? 'Editar Rota' : 'Nova Rota Comercial'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {(['info', 'clients'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'info' ? 'Informações' : `Clientes (${clients.length})`}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'info' ? (
            <div className="space-y-4">
              <div>
                <label className="label">Nome da Rota *</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Rota Centro, Rota Norte..." autoFocus />
              </div>

              <div>
                <label className="label">Descrição</label>
                <textarea className="input min-h-[60px] resize-none" value={description} onChange={e => setDesc(e.target.value)} placeholder="Objetivo, área geográfica..." />
              </div>

              <div>
                <label className="label">Responsável</label>
                <select className="input" value={responsibleId} onChange={e => setResp(e.target.value)}>
                  <option value="">Sem responsável fixo</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Frequência</label>
                <div className="flex gap-2">
                  {ROUTE_FREQUENCIES.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFreq(f.id)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                        frequency === f.id
                          ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Dias da Semana</label>
                <div className="flex gap-2 flex-wrap">
                  {ROUTE_DAYS.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDay(d.id)}
                      className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
                        days.includes(d.id)
                          ? 'bg-orange-500 border-orange-600 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Para frequência quinzenal/mensal, selecione o(s) dia(s) preferencial(is)</p>
              </div>

              {route?.id && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                  Rota ativa
                </label>
              )}
            </div>
          ) : (
            /* ── CLIENTS TAB ── */
            <div className="space-y-4">
              {/* Search */}
              <div>
                <label className="label">Adicionar Cliente</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    className="input pl-9"
                    placeholder="Buscar cliente pelo nome..."
                    value={clientSearch}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                {(searchResults.length > 0 || searching) && (
                  <div className="mt-1 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                    {searching ? (
                      <p className="px-3 py-2 text-xs text-slate-400">Buscando...</p>
                    ) : searchResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => addClient(c)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-orange-50 transition-colors flex items-center gap-2 ${
                          clients.some(x => x.client_id === c.id) ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                        disabled={clients.some(x => x.client_id === c.id)}
                      >
                        <Plus size={12} className="text-orange-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{c.nome}</p>
                          {c.setor && <p className="text-[10px] text-slate-400">{c.setor}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Client list */}
              {clients.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                  Nenhum cliente adicionado. Busque e adicione clientes acima.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-medium">{clients.length} cliente{clients.length !== 1 ? 's' : ''} na rota (em ordem de visita)</p>
                  {clients.map((c, i) => (
                    <div key={c.client_id} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-slate-300 shrink-0" />
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-black flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800 truncate">{c.client_nome}</p>
                          {c.client_setor && <p className="text-[10px] text-slate-400">{c.client_setor}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => moveClient(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-white disabled:opacity-30">
                            <ChevronUp size={14} className="text-slate-500" />
                          </button>
                          <button onClick={() => moveClient(i, 1)} disabled={i === clients.length - 1} className="p-1 rounded hover:bg-white disabled:opacity-30">
                            <ChevronDown size={14} className="text-slate-500" />
                          </button>
                          <button onClick={() => removeClient(i)} className="p-1 rounded hover:bg-red-50">
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="input text-xs resize-none min-h-[44px] bg-white"
                        placeholder="Observação para o promotor (o que fazer neste cliente)..."
                        value={c.observations}
                        onChange={e => updateObs(i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-3">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center py-3 shadow-md">
            {saving ? 'Salvando...' : route?.id ? 'Salvar Alterações' : 'Criar Rota'}
          </button>
        </div>
      </div>
    </div>
  )
}
