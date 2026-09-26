import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, RefreshCw, ArrowRight } from 'lucide-react'
import { useDeliveryStatus } from '../hooks/useDeliveryStatus'

export default function DeliveryDashboardCard() {
  const { status99, statusIfood, hasAlert, loading, refetch } = useDeliveryStatus()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setTimeout(() => setRefreshing(false), 500)
  }

  const is99Open = status99?.status === 'OPEN'
  const is99Paused = status99?.status === 'PAUSED'
  const isIfoodOpen = statusIfood?.status === 'OPEN'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Store size={16} className={hasAlert ? 'text-amber-500' : 'text-orange-500'} />
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
            Status dos Deliveries
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar status"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link
            to="/loja"
            className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            Módulo Loja <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* 99Food Pill */}
        <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border transition-all ${
          is99Open
            ? 'bg-emerald-500/5 border-emerald-500/25'
            : is99Paused
            ? 'bg-amber-500/5 border-amber-500/25'
            : 'bg-rose-500/5 border-rose-500/25'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-yellow-400/20 text-yellow-600 font-bold text-xs flex items-center justify-center">
              99
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              99Food
            </span>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
            is99Open
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : is99Paused
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              is99Open ? 'bg-emerald-500 animate-pulse' : is99Paused ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
            }`} />
            {loading ? '...' : is99Open ? 'Aberta' : is99Paused ? 'Pausada' : 'Fechada'}
          </span>
        </div>

        {/* iFood Pill */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-md bg-red-500/15 text-red-600 font-bold text-xs flex items-center justify-center">
              iF
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              iFood
            </span>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isIfoodOpen
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isIfoodOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {isIfoodOpen ? 'Aberta' : 'Homologação'}
          </span>
        </div>
      </div>
    </div>
  )
}
