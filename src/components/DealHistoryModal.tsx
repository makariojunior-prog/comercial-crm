import { useCallback } from 'react'
import { X } from 'lucide-react'
import type { Deal } from '../types'
import DealHistoryTimeline from './DealHistory'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  deal: Deal
  onClose: () => void
}

export default function DealHistoryModal({ deal, onClose }: Props) {
  useEscKey(useCallback(onClose, [onClose]))

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Histórico</p>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">{deal.client_name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <DealHistoryTimeline dealId={deal.id} />
        </div>
      </div>
    </div>
  )
}
