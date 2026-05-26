import { useState, useEffect } from 'react'
import { MapPin, Clock, AlertTriangle, ChevronRight, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import type { Visit } from '../types'
import { getResponsaveis } from '../types'

const TYPE_COLORS: Record<string, string> = {
  'Prospecção':    'bg-blue-100 text-blue-700',
  'Acompanhamento':'bg-green-100 text-green-700',
  'Entrega':       'bg-orange-100 text-orange-700',
  'Reunião':       'bg-purple-100 text-purple-700',
  'Degustação':    'bg-pink-100 text-pink-700',
  'Outro':         'bg-slate-100 text-slate-600',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (isToday(d)) return 'Hoje'
    if (isYesterday(d)) return 'Ontem'
    return format(d, "dd/MM", { locale: ptBR })
  } catch { return dateStr }
}

export default function RecentVisitsWidget() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase
      .from('visits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8)
    setVisits((data || []) as Visit[])
    setLoading(false)
  }

  useEffect(() => {
    load()

    // Realtime: prepend new visits as they arrive
    const channel = supabase
      .channel(`recent_visits_widget_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visits' },
        (payload) => {
          setVisits(prev => [payload.new as Visit, ...prev].slice(0, 8))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          <MapPin size={16} className="text-orange-500" />
          Visitas Recentes
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Tempo real" />
        </h2>
        <Link to="/visitas" className="text-xs font-semibold text-orange-500 hover:underline flex items-center gap-0.5">
          Ver todas <ChevronRight size={12} />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visits.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          <Eye size={28} className="mx-auto mb-2 opacity-30" />
          Nenhuma visita registrada
        </div>
      ) : (
        <div className="space-y-2">
          {visits.map(v => {
            const isHighPriority = v.priority === 'ALTA'
            const hasReport = v.report && v.report.trim().length > 0

            return (
              <div
                key={v.id}
                className={`rounded-xl border p-3 transition-all ${
                  isHighPriority
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600 hover:border-slate-200 dark:hover:border-slate-500 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      {isHighPriority && (
                        <AlertTriangle size={12} className="text-red-500 shrink-0" />
                      )}
                      <p className={`font-semibold text-sm truncate ${isHighPriority ? 'text-red-800 dark:text-red-300' : 'text-slate-800 dark:text-slate-100'}`}>
                        {v.client_name}
                      </p>
                      {v.visit_type && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 ${TYPE_COLORS[v.visit_type] || TYPE_COLORS['Outro']}`}>
                          {v.visit_type}
                        </span>
                      )}
                      {(() => {
                        try {
                          const d = parseISO(v.visit_date ?? '')
                          if (isToday(d)) return (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                              Hoje
                            </span>
                          )
                          if (isYesterday(d)) return (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                              Ontem
                            </span>
                          )
                        } catch { /* noop */ }
                        return null
                      })()}
                    </div>
                    {hasReport && (
                      <p className={`text-[11px] line-clamp-1 leading-relaxed ${isHighPriority ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {v.report}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {getResponsaveis(v).split(', ').filter(Boolean).map(name => (
                        <span key={name} className="text-[10px] font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full border border-orange-100 dark:border-orange-800">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-[10px] text-slate-400">
                    <Clock size={10} />
                    {formatDate(v.visit_date)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
