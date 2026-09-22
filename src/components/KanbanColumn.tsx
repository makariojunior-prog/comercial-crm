import { useDroppable } from '@dnd-kit/core'
import type { Deal, DealStatus } from '../types'
import KanbanCard from './KanbanCard'
import { statusConfig } from './StatusBadge'

interface Props {
  status: DealStatus
  deals: Deal[]
  onOpenEdit: (deal: Deal) => void
  onMove: (deal: Deal, status: DealStatus) => void
  onDelete: (deal: Deal) => void
  onShowHistory: (deal: Deal) => void
}

export default function KanbanColumn({ status, deals, onOpenEdit, onMove, onDelete, onShowHistory }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const cfg = statusConfig[status]

  return (
    <div className="flex flex-col shrink-0 w-72">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${cfg.classes}`}>
        <span className="text-sm font-bold">{cfg.label}</span>
        <span className="text-xs font-bold bg-white/60 dark:bg-black/20 rounded-full px-2 py-0.5">{deals.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 p-2 rounded-b-xl border border-t-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 min-h-[120px] max-h-[calc(100vh-320px)] overflow-y-auto transition-colors ${
          isOver ? 'bg-orange-50 dark:bg-orange-900/10' : ''
        }`}
      >
        {deals.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Nenhum negócio aqui</p>
        ) : (
          deals.map(deal => (
            <KanbanCard
              key={deal.id}
              deal={deal}
              onOpenEdit={() => onOpenEdit(deal)}
              onMove={s => onMove(deal, s)}
              onDelete={() => onDelete(deal)}
              onShowHistory={() => onShowHistory(deal)}
            />
          ))
        )}
      </div>
    </div>
  )
}
