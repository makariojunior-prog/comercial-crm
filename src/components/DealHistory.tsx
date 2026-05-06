import { useEffect, useState } from 'react'
import { Clock, TrendingUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { DealHistory } from '../types'

interface Props {
  dealId: string
}

const statusColor: Record<string, string> = {
  'NOVO': 'text-blue-600',
  'EM ANDAMENTO': 'text-amber-600',
  'SUCESSO': 'text-green-600',
  'DESISTIU': 'text-red-500',
  'CANCELADO': 'text-slate-400',
}

export default function DealHistoryTimeline({ dealId }: Props) {
  const [history, setHistory] = useState<DealHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('crm_deal_history')
      .select('*')
      .eq('deal_id', dealId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setHistory(data as DealHistory[] ?? [])
        setLoading(false)
      })
  }, [dealId])

  if (loading) return <p className="text-xs text-slate-400 py-2">Carregando histórico...</p>
  if (history.length === 0) return <p className="text-xs text-slate-400 py-2">Nenhuma atualização registrada ainda.</p>

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
        <Clock size={12} /> Histórico de atualizações
      </p>
      <div className="relative space-y-3 pl-4 border-l-2 border-slate-200">
        {history.map((h, i) => (
          <div key={h.id} className="relative">
            <span className="absolute -left-[1.15rem] top-1 w-3 h-3 rounded-full bg-white border-2 border-slate-300" />
            <p className="text-xs text-slate-400">
              {format(parseISO(h.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              {h.updated_by && ` · ${h.updated_by}`}
            </p>
            {h.status_before !== h.status_after && h.status_after && (
              <p className="text-xs font-medium flex items-center gap-1 mt-0.5">
                <TrendingUp size={11} />
                <span className={statusColor[h.status_before ?? ''] ?? 'text-slate-500'}>{h.status_before ?? '-'}</span>
                <span className="text-slate-400">→</span>
                <span className={statusColor[h.status_after] ?? 'text-slate-700'}>{h.status_after}</span>
              </p>
            )}
            {h.follow_up && (
              <p className="text-xs text-slate-600 mt-0.5 italic">"{h.follow_up}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
