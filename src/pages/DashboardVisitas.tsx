import { useEffect, useState } from 'react'
import { Plus, MapPin, Phone, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Visit } from '../types'
import VisitModal from '../components/VisitModal'

const statusColor: Record<string, string> = {
  'Realizada': 'bg-green-100 text-green-700',
  'Agendada': 'bg-blue-100 text-blue-700',
  'Cancelada': 'bg-red-100 text-red-600',
}

export default function DashboardVisitas() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [editVisit, setEditVisit] = useState<Visit | null | undefined>(undefined)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('visits')
      .select('*')
      .order('visit_date', { ascending: false })
    setVisits(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteVisit(id: string) {
    if (!confirm('Excluir esta visita?')) return
    await supabase.from('visits').delete().eq('id', id)
    setVisits(v => v.filter(x => x.id !== id))
  }

  const now = new Date()
  const monthStart = startOfMonth(now).toISOString().split('T')[0]
  const monthEnd = endOfMonth(now).toISOString().split('T')[0]
  const thisMonth = visits.filter(v => v.visit_date && v.visit_date >= monthStart && v.visit_date <= monthEnd)
  const realized = thisMonth.filter(v => v.status === 'Realizada')

  const monthLabel = format(now, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard Visitas</h1>
          <p className="text-xs text-slate-400 capitalize">{monthLabel}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditVisit(null)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Registrar</span>
          </button>
        </div>
      </div>

      {/* Métricas do mês */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-700">{thisMonth.length}</p>
          <p className="text-xs text-blue-600 font-medium mt-0.5">No mês</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-700">{realized.length}</p>
          <p className="text-xs text-green-600 font-medium mt-0.5">Realizadas</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-slate-700">{visits.length}</p>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Total geral</p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
      ) : visits.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          <MapPin size={32} className="mx-auto mb-2 opacity-40" />
          <p>Nenhuma visita registrada</p>
          <button onClick={() => setEditVisit(null)} className="btn-primary mt-3 mx-auto">
            <Plus size={16} /> Registrar primeira visita
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-600">Todas as visitas</h2>
          {visits.map(v => <VisitCard key={v.id} visit={v} onEdit={() => setEditVisit(v)} onDelete={() => deleteVisit(v.id)} />)}
        </div>
      )}

      {editVisit !== undefined && (
        <VisitModal visit={editVisit} onClose={() => setEditVisit(undefined)} onSaved={load} />
      )}
    </div>
  )
}

function VisitCard({ visit, onEdit, onDelete }: { visit: Visit; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const dateStr = visit.visit_date ? format(parseISO(visit.visit_date), 'dd/MM/yyyy', { locale: ptBR }) : '-'
  const badge = statusColor[visit.status ?? ''] ?? 'bg-slate-100 text-slate-500'

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>{visit.status}</span>
            {visit.visit_type && (
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">{visit.visit_type}</span>
            )}
          </div>
          <p className="font-semibold text-slate-800">{visit.client_name}</p>
          <div className="flex gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
            <span>{dateStr}</span>
            <span>{visit.responsible}</span>
          </div>
        </div>
        <span className="text-slate-400 select-none">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-3">
          {visit.demand && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Demanda</p>
              <p className="text-sm text-slate-700">{visit.demand}</p>
            </div>
          )}
          {visit.report && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Relatório</p>
              <p className="text-sm text-slate-700">{visit.report}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={e => { e.stopPropagation(); onEdit() }} className="btn-secondary text-xs py-1.5">
              <Pencil size={12} /> Editar
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }} className="btn-danger text-xs py-1.5">
              <Trash2 size={12} /> Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
