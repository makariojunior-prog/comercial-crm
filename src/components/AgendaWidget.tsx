import { useState, useEffect, useCallback, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, RefreshCw, Plus } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AgendaCompromisso } from '../types'

const STATUS_DOT: Record<string, string> = {
  AGENDADO:  'bg-blue-400',
  REALIZADO: 'bg-green-500',
  CANCELADO: 'bg-slate-300',
}

const TIPO_DOT: Record<string, string> = {
  'Visita':              'bg-orange-400',
  'Reunião':             'bg-blue-400',
  'Ligação':             'bg-purple-400',
  'Entrega':             'bg-green-400',
  'Outros':              'bg-slate-400',
  'Degustação':          'bg-rose-400',
  'Promoção':            'bg-pink-400',
  'Evento Comemorativo': 'bg-fuchsia-400',
  'Inauguração':         'bg-rose-500',
  'Outro':               'bg-slate-400',
}

export default function AgendaWidget() {
  const navigate = useNavigate()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [date, setDate]         = useState(todayStr)
  const [items, setItems]       = useState<AgendaCompromisso[]>([])
  const [loading, setLoading]   = useState(true)
  const [staffOptions, setStaffOptions] = useState<string[]>([])
  const [filterResp, setFilterResp]     = useState('')

  const dateObj = new Date(date + 'T12:00')
  const isToday = date === todayStr

  useEffect(() => {
    supabase.from('crm_staff').select('name').eq('active', true).order('name')
      .then(({ data }) => { if (data) setStaffOptions(data.map((s: any) => s.name)) })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('agenda_compromissos')
      .select('*')
      .eq('data', date)
      .order('hora_inicio', { nullsFirst: false })
    setItems(data ?? [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const base = filterResp
      ? items.filter(i => i.responsaveis?.includes(filterResp) || i.responsavel === filterResp)
      : items
    return base.filter(i => i.status !== 'CANCELADO')
  }, [items, filterResp])

  const prev    = () => setDate(format(subDays(dateObj, 1), 'yyyy-MM-dd'))
  const next    = () => setDate(format(addDays(dateObj, 1), 'yyyy-MM-dd'))
  const goToday = () => setDate(todayStr)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm">
          <CalendarDays size={15} className="text-orange-500" />
          Agenda
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {staffOptions.length > 0 && (
            <select
              value={filterResp}
              onChange={e => setFilterResp(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 focus:outline-none"
            >
              <option value="">Todos</option>
              {staffOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded-xl p-0.5">
            <button onClick={prev} className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500">
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={goToday}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                isToday
                  ? 'bg-white dark:bg-slate-600 text-orange-600 shadow-sm'
                  : 'text-slate-500 hover:bg-white dark:hover:bg-slate-600'
              }`}
            >
              {isToday ? 'Hoje' : format(dateObj, 'dd/MM', { locale: ptBR })}
            </button>
            <button onClick={next} className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500">
              <ChevronRight size={12} />
            </button>
          </div>
          {loading && <RefreshCw size={11} className="animate-spin text-slate-400" />}
          <button
            onClick={() => navigate('/agenda')}
            className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-500 transition-colors"
            title="Abrir agenda"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {!isToday && (
        <p className="text-[11px] text-slate-400 capitalize -mt-1">
          {format(dateObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-5 text-slate-400">
          <CalendarDays size={24} className="mx-auto mb-1.5 opacity-30" />
          <p className="text-xs">Nenhum compromisso {isToday ? 'hoje' : 'neste dia'}</p>
          <button
            onClick={() => navigate('/agenda')}
            className="mt-2 text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
          >
            + Agendar
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map(item => (
            <button
              key={item.id}
              onClick={() => navigate('/agenda')}
              className="w-full text-left rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TIPO_DOT[item.tipo] ?? STATUS_DOT[item.status] ?? 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate leading-tight">
                    {item.titulo}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.hora_inicio && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5 shrink-0">
                        <Clock size={9} />{item.hora_inicio.substring(0, 5)}
                        {item.hora_fim && `–${item.hora_fim.substring(0, 5)}`}
                      </span>
                    )}
                    {item.cliente_nome && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{item.cliente_nome}</span>
                    )}
                    {item.responsaveis?.length > 0 && (
                      <span className="text-[10px] text-orange-500 font-medium shrink-0 truncate">
                        {item.responsaveis.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                  item.status === 'REALIZADO'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                }`}>
                  {item.status === 'REALIZADO' ? 'OK' : 'AGEND.'}
                </span>
              </div>
            </button>
          ))}
          <button
            onClick={() => navigate('/agenda')}
            className="w-full text-center text-[11px] text-orange-500 hover:text-orange-600 font-medium py-1 transition-colors"
          >
            Ver agenda completa →
          </button>
        </div>
      )}
    </div>
  )
}
