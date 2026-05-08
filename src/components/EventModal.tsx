import { useState, useEffect } from 'react'
import { X, Calendar, MapPin, Package, Users, Save, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Event, EventStatus, Client, Staff, EventMaterial } from '../types'

interface EventModalProps {
  event?: Event | null
  onClose: () => void
  onSaved: () => void
}

export default function EventModal({ event, onClose, onSaved }: EventModalProps) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [clientId, setClientId] = useState(event?.client_id ?? '')
  const [eventType, setEventType] = useState(event?.event_type ?? 'Degustação')
  const [eventDate, setEventDate] = useState(event?.event_date ? event.event_date.substring(0, 16) : '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'AGENDADO')
  const [notes, setNotes] = useState(event?.notes ?? '')
  
  const [materials, setMaterials] = useState<Partial<EventMaterial>[]>(event?.materials ?? [])
  const [selectedStaff, setSelectedStaff] = useState<string[]>(event?.staff?.map(s => s.staff_id) ?? [])
  
  const [clients, setClients] = useState<Client[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'materials' | 'staff'>('info')

  useEffect(() => {
    async function loadData() {
      const { data: cData } = await supabase.from('crm_clients').select('id, nome').eq('status', 'ATIVO').order('nome')
      const { data: sData } = await supabase.from('crm_staff').select('*').eq('active', true).order('name')
      if (cData) setClients(cData as Client[])
      if (sData) setAllStaff(sData as Staff[])
    }
    loadData()
  }, [])

  async function save() {
    if (!title.trim()) return setError('Título é obrigatório')
    if (!eventDate) return setError('Data é obrigatória')
    
    setSaving(true)
    setError(null)
    
    try {
      const eventData = {
        title: title.trim(),
        client_id: clientId || null,
        event_type: eventType,
        event_date: eventDate,
        status,
        notes: notes.trim() || null,
      }

      let eId = event?.id

      if (eId) {
        const { error: err } = await supabase.from('crm_events').update(eventData).eq('id', eId)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.from('crm_events').insert(eventData).select()
        if (err) throw err
        eId = data[0].id
      }

      // Sync Materials
      await supabase.from('crm_event_materials').delete().eq('event_id', eId)
      if (materials.length > 0) {
        const { error: mErr } = await supabase.from('crm_event_materials').insert(
          materials.map(m => ({ event_id: eId, item_name: m.item_name, quantity: m.quantity, is_provided: m.is_provided }))
        )
        if (mErr) throw mErr
      }

      // Sync Staff
      await supabase.from('crm_event_staff').delete().eq('event_id', eId)
      if (selectedStaff.length > 0) {
        const { error: sErr } = await supabase.from('crm_event_staff').insert(
          selectedStaff.map(sid => ({ event_id: eId, staff_id: sid }))
        )
        if (sErr) throw sErr
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar evento')
    } finally {
      setSaving(false)
    }
  }

  const addMaterial = () => setMaterials([...materials, { item_name: '', quantity: 1, is_provided: false }])
  const removeMaterial = (index: number) => setMaterials(materials.filter((_, i) => i !== index))
  const updateMaterial = (index: number, field: string, value: any) => {
    const newM = [...materials]
    newM[index] = { ...newM[index], [field]: value }
    setMaterials(newM)
  }

  const toggleStaff = (sid: string) => {
    setSelectedStaff(prev => prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid])
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Calendar size={18} className="text-orange-500" />
            {event ? 'Editar Evento' : 'Novo Evento Promotoria'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          <button onClick={() => setActiveTab('info')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'info' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>Info</button>
          <button onClick={() => setActiveTab('materials')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'materials' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>Materiais</button>
          <button onClick={() => setActiveTab('staff')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'staff' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400 hover:text-slate-600'}`}>Equipe</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {activeTab === 'info' && (
            <>
              <div>
                <label className="label">Título do Evento</label>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Degustação na Padaria X" autoFocus />
              </div>
              <div>
                <label className="label">Cliente</label>
                <select className="input" value={clientId} onChange={e => setClientId(e.target.value)}>
                  <option value="">(Sem cliente vinculado)</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={eventType} onChange={e => setEventType(e.target.value)}>
                    <option>Degustação</option>
                    <option>Promoção</option>
                    <option>Evento Comemorativo</option>
                    <option>Inauguração</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div>
                  <label className="label">Data e Hora</label>
                  <input type="datetime-local" className="input" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <div className="flex gap-2">
                  {(['AGENDADO', 'REALIZADO', 'CANCELADO'] as EventStatus[]).map(s => (
                    <button key={s} onClick={() => setStatus(s)} className={`flex-1 py-2 rounded-lg border text-[10px] font-bold ${status === s ? 'bg-orange-50 border-orange-500 text-orange-600 border-2' : 'bg-white border-slate-200 text-slate-400'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label text-xs">Observações Gerais</label>
                <textarea className="input min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes estratégicos..." />
              </div>
            </>
          )}

          {activeTab === 'materials' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase">Produtos & Materiais</p>
                <button onClick={addMaterial} className="text-orange-500 text-xs font-bold flex items-center gap-1"><Plus size={14} /> Adicionar</button>
              </div>
              {materials.map((m, i) => (
                <div key={i} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <input className="input flex-1 py-1 text-sm" value={m.item_name} onChange={e => updateMaterial(i, 'item_name', e.target.value)} placeholder="Item..." />
                  <input type="number" className="input w-16 py-1 text-sm" value={m.quantity} onChange={e => updateMaterial(i, 'quantity', parseInt(e.target.value))} />
                  <button onClick={() => removeMaterial(i)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              ))}
              {materials.length === 0 && <p className="text-center py-8 text-slate-400 text-xs italic">Nenhum material previsto</p>}
            </div>
          )}

          {activeTab === 'staff' && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase">Colaboradores Envolvidos</p>
              <div className="grid grid-cols-2 gap-2">
                {allStaff.map(s => (
                  <button key={s.id} onClick={() => toggleStaff(s.id)} className={`p-2 rounded-lg border text-left transition-all ${selectedStaff.includes(s.id) ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-500' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                    <p className="text-xs font-bold text-slate-800">{s.name}</p>
                    <p className="text-[10px] text-slate-400">{s.role_name}</p>
                  </button>
                ))}
              </div>
              {allStaff.length === 0 && <p className="text-center py-8 text-slate-400 text-xs italic">Nenhum colaborador ativo cadastrado</p>}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center gap-2">
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Evento'}
          </button>
        </div>
      </div>
    </div>
  )
}
