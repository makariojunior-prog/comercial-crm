import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, RefreshCw, ArrowRight } from 'lucide-react'
import { useDeliveryStatus } from '../hooks/useDeliveryStatus'

export default function DeliveryDashboardCard() {
  const { status99, statusIfood, loading } = useDeliveryStatus()

  const is99Open = status99?.status === 'OPEN'
  const isIfoodOpen = statusIfood?.status === 'OPEN'

  return (
    <div className="lg:hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Store size={16} className="text-slate-400" />
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
          Status Lojas
        </h3>
      </div>

      <div className="flex items-center gap-4">
        {/* 99Food */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500">99Food</span>
          <span className={`w-2 h-2 rounded-full ${is99Open ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        </div>

        {/* iFood */}
        <div className="flex items-center gap-1.5 border-l pl-4 border-slate-200 dark:border-slate-700">
          <span className="text-[11px] font-bold text-slate-500">iFood</span>
          <span className={`w-2 h-2 rounded-full ${isIfoodOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
        </div>
      </div>
    </div>
  )
}
