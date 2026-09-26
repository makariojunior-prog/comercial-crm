import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, CheckCircle2, AlertTriangle, Clock, RefreshCw, ArrowRight, ExternalLink } from 'lucide-react'
import { useDeliveryStatus } from '../hooks/useDeliveryStatus'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

  return (
    <div className={`rounded-xl border transition-all ${
      hasAlert
        ? 'border-amber-300 dark:border-amber-600/60 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
    } overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${hasAlert ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-orange-500/10 text-orange-500'}`}>
            <Store size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Operação de Delivery
              </h3>
              {hasAlert && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                  Atenção
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cantina em Casa • Status das Plataformas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar status"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link
            to="/loja"
            className="flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors ml-1"
          >
            Ver Módulo Loja <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Grid de Plataformas */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 99Food Card */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  99Food
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 font-semibold">
                  Multi-binding Ativo
                </span>
              </div>

              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                is99Open
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : is99Paused
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  is99Open ? 'bg-emerald-500 animate-pulse' : is99Paused ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
                }`} />
                {loading ? 'Verificando...' : is99Open ? 'Aberta' : is99Paused ? 'Pausada' : 'Fechada'}
              </span>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
              <p className="flex justify-between">
                <span>Loja ID:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">5764608576400918038</span>
              </p>
              <p className="flex justify-between">
                <span>Sincronização:</span>
                <span>
                  {status99?.ultima_verificacao
                    ? format(new Date(status99.ultima_verificacao), 'HH:mm (dd/MM)', { locale: ptBR })
                    : 'Conectado'}
                </span>
              </p>
              {status99?.motivo_pausa && (
                <p className="text-amber-600 dark:text-amber-400 font-medium">
                  Motivo: {status99.motivo_pausa}
                </p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 size={12} /> Webhook Realtime Ativo
            </span>
            <a
              href="https://merchant.99app.com/pt-BR/manager/overview"
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-orange-500 dark:hover:text-orange-400 flex items-center gap-1 font-medium"
            >
              Painel 99 <ExternalLink size={10} />
            </a>
          </div>
        </div>

        {/* iFood Card */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  iFood
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-semibold">
                  Módulo Merchant
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {statusIfood?.status === 'OPEN' ? 'Aberta' : 'Homologação'}
              </span>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
              <p className="flex justify-between">
                <span>Chamado Suporte:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">#33063337</span>
              </p>
              <p className="flex justify-between">
                <span>Escopo Homologado:</span>
                <span className="text-slate-700 dark:text-slate-300">Informações & Pausas</span>
              </p>
              <p className="text-[10px] text-slate-400 italic">
                Aguardando liberação de testes pelo iFood
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 text-slate-400 font-medium">
              <Clock size={12} /> Em validação
            </span>
            <a
              href="https://portal.ifood.com.br"
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 font-medium"
            >
              Portal iFood <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
