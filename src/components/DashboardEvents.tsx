import { useState, useEffect } from 'react'
import { Calendar, ChevronRight, MapPin, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Event } from '../types'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'

export default function DashboardEvents() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase
      .from('crm_events')
      .select('*, client:crm_clients(nome)')
      .eq('status', 'AGENDADO')
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(3)

    if (data) {
      setEvents(data.map((e: any) => ({ ...e, client_nome: e.client?.nome })))
    }
    setLoading(false)
  }

  useEffect(() => { loadEvents() }, [])

  if (events.length === 0 && !loading) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          📅 Próximos Eventos
        </h2>
        <Link to="/promotoria" className="text-xs font-semibold text-orange-500 hover:underline flex items-center gap-0.5">
          Agenda completa <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid gap-3">
        {events.map(event => {
          const date = parseISO(event.event_date)
          return (
            <Link key={event.id} to="/promotoria" className="card p-3 flex items-center gap-4 hover:shadow-md transition-all border-l-4 border-l-orange-500">
              <div className="text-center min-w-[40px]">
                <p className="text-sm font-black text-slate-800 leading-none">{format(date, 'dd')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">{format(date, 'MMM', { locale: ptBR })}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{event.title}</p>
                <p className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                  <MapPin size={10} /> {event.client_nome || 'Sem cliente'} · <Clock size={10} /> {format(date, 'HH:mm')}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
