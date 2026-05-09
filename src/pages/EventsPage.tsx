import { useState, useEffect } from 'react'
import { Plus, Search, Calendar, Clock, MapPin, Package, Users, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Event } from '../types'
import EventModal from '../components/EventModal'
import { format, parseISO, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [search, setSearch] = useState('')

  async function loadEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('crm_events')
      .select(`
        *,
        client:crm_clients(nome),
        materials:crm_event_materials(*),
        staff:crm_event_staff(staff_id, staff:crm_staff(name))
      `)
      .order('event_date', { ascending: true })

    if (error) {
      console.error('Error loading events:', error)
    } else {
      const formatted = data.map((e: any) => ({
        ...e,
        client_nome: e.client?.nome,
        staff: e.staff.map((s: any) => ({ staff_id: s.staff_id, staff_name: s.staff?.name }))
      }))
      setEvents(formatted)
    }
    setLoading(false)
  }

  useEffect(() => { loadEvents() }, [])

  async function deleteEvent(id: string) {
    if (!confirm('Excluir este evento permanentemente?')) return
    const { error } = await supabase.from('crm_events').delete().eq('id', id)
    if (!error) loadEvents()
  }

  const filtered = events.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.client_nome?.toLowerCase().includes(search.toLowerCase())
  )

  const today = startOfDay(new Date())
  const upcoming = filtered.filter(e => startOfDay(parseISO(e.event_date)) >= today)
  const past = filtered.filter(e => startOfDay(parseISO(e.event_date)) < today).reverse()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="text-orange-500" /> Promotoria
          </h1>
          <p className="text-sm text-slate-500">Planejamento de degustações e eventos em clientes</p>
        </div>
        <button onClick={() => { setEditingEvent(null); setShowModal(true) }} className="btn-primary">
          <Plus size={18} /> Novo Evento
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input className="input pl-10" placeholder="Buscar por título ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Carregando eventos...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <Calendar size={48} className="mx-auto mb-4 opacity-20" />
          <p>Nenhum evento agendado</p>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Próximos Eventos ({upcoming.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcoming.map(event => <EventCard key={event.id} event={event} onEdit={() => { setEditingEvent(event); setShowModal(true) }} onDelete={() => deleteEvent(event.id)} />)}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider opacity-60">Histórico de Eventos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                {past.map(event => <EventCard key={event.id} event={event} onEdit={() => { setEditingEvent(event); setShowModal(true) }} onDelete={() => deleteEvent(event.id)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {(showModal || editingEvent) && (
        <EventModal event={editingEvent} onClose={() => { setShowModal(false); setEditingEvent(null) }} onSaved={loadEvents} />
      )}
    </div>
  )
}

function EventCard({ event, onEdit, onDelete }: { event: Event, onEdit: () => void, onDelete: () => void }) {
  const date = parseISO(event.event_date)
  return (
    <div className="card p-5 group hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{event.event_type}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${event.status === 'REALIZADO' ? 'bg-green-100 text-green-700' : event.status === 'CANCELADO' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{event.status}</span>
          </div>
          <h3 className="font-bold text-slate-800 text-lg mb-1">{event.title}</h3>
          <p className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
            <MapPin size={14} className="text-orange-500" /> {event.client_nome || 'Cliente não vinculado'}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <p className="text-lg font-black text-slate-800">{format(date, 'dd')}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">{format(date, 'MMM', { locale: ptBR })}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1 flex items-center gap-1"><Clock size={10} /> {format(date, 'HH:mm')}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-50 pt-4">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 mt-1 shrink-0"><Users size={16} /></div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Equipe Responsável</p>
            <p className="text-xs text-slate-700 font-medium leading-relaxed">
              {event.staff && event.staff.length > 0 
                ? event.staff.map(s => s.staff_name).join(', ') 
                : 'Nenhum colaborador vinculado'}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 mt-1 shrink-0"><Package size={16} /></div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Materiais ({event.materials?.length || 0})</p>
            <p className="text-xs text-slate-700 truncate max-w-xs">
              {event.materials && event.materials.length > 0 
                ? event.materials.map(m => `${m.quantity}x ${m.item_name}`).join(', ') 
                : 'Sem materiais previstos'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity border-t border-slate-50 pt-3">
        <button onClick={onEdit} className="btn-secondary flex-1 py-1.5 text-xs justify-center gap-1.5"><Edit2 size={12} /> Editar</button>
        <button onClick={onDelete} className="btn-ghost flex-1 py-1.5 text-xs justify-center gap-1.5 text-slate-400 hover:text-red-500"><Trash2 size={12} /> Excluir</button>
      </div>
    </div>
  )
}
