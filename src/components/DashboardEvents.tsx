import { useState, useEffect } from 'react'
import { ChevronRight, MapPin, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'

interface AgendaItem {
  key: string
  title: string
  date: string
  sub: string
  link: string
  isVisit: boolean
}

export default function DashboardEvents() {
  const [items, setItems]   = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)

  async function loadItems(silent = false) {
    if (!silent) setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()

    const [eventsRes, visitsRes] = await Promise.all([
      supabase
        .from('crm_events')
        .select('id, title, event_date, client:crm_clients(nome)')
        .eq('status', 'AGENDADO')
        .gte('event_date', nowIso)
        .order('event_date', { ascending: true })
        .limit(5),
      supabase
        .from('visits')
        .select('id, client_name, visit_type, visit_date, responsible')
        .eq('status', 'Agendada')
        .gte('visit_date', today)
        .order('visit_date', { ascending: true })
        .limit(5),
    ])

    const eventItems: AgendaItem[] = (eventsRes.data ?? []).map((e: any) => ({
      key: `evt-${e.id}`,
      title: e.title,
      date: e.event_date,
      sub: e.client?.nome ?? 'Sem cliente',
      link: '/promotoria',
      isVisit: false,
    }))

    const visitItems: AgendaItem[] = (visitsRes.data ?? []).map((v: any) => ({
      key: `vis-${v.id}`,
      title: v.client_name,
      date: v.visit_date + 'T00:00:00',
      sub: [v.visit_type, v.responsible].filter(Boolean).join(' · '),
      link: '/visitas',
      isVisit: true,
    }))

    const merged = [...eventItems, ...visitItems]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)

    setItems(merged)
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
    const interval = setInterval(() => loadItems(true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (items.length === 0 && !loading) return null

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
        {loading
          ? [...Array(2)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)
          : items.map(item => {
              const date = parseISO(item.date)
              const hasTime = item.date.includes('T') && !item.date.endsWith('T00:00:00')
              return (
                <Link
                  key={item.key}
                  to={item.link}
                  className={`card p-3 flex items-center gap-4 hover:shadow-md transition-all border-l-4 ${
                    item.isVisit ? 'border-l-blue-400' : 'border-l-orange-500'
                  }`}
                >
                  <div className="text-center min-w-[40px]">
                    <p className="text-sm font-black text-slate-800 leading-none">{format(date, 'dd')}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{format(date, 'MMM', { locale: ptBR })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.isVisit && (
                        <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase shrink-0">Visita</span>
                      )}
                      <p className="text-xs font-bold text-slate-800 truncate">{item.title}</p>
                    </div>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                      <MapPin size={10} />
                      {item.sub}
                      {hasTime && <><Clock size={10} className="ml-1" /> {format(date, 'HH:mm')}</>}
                    </p>
                  </div>
                </Link>
              )
            })
        }
      </div>
    </div>
  )
}
