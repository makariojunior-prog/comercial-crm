import { useState } from 'react'
import { Store, AlertTriangle, CheckCircle2, Clock, X, RefreshCw, ExternalLink } from 'lucide-react'
import { useDeliveryStatus } from '../hooks/useDeliveryStatus'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function DeliveryStatusWidget() {
  const { status99, statusIfood, hasAlert, loading, refetch } = useDeliveryStatus()
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setTimeout(() => setRefreshing(false), 500)
  }

  // Helper para label e cor
  const getStatusDisplay = (status?: string | null) => {
    switch (status) {
      case 'OPEN':
        return {
          label: 'Aberta',
          badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
          dotClass: 'bg-emerald-500 animate-pulse',
          icon: CheckCircle2,
        }
      case 'PAUSED':
        return {
          label: 'Pausada',
          badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-500 animate-pulse',
          icon: AlertTriangle,
        }
      case 'CLOSED':
        return {
          label: 'Fechada',
          badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
          dotClass: 'bg-rose-500',
          icon: Clock,
        }
      default:
        return {
          label: 'Verificando...',
          badgeClass: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 border-slate-500/30',
          dotClass: 'bg-slate-400',
          icon: Clock,
        }
    }
  }

  const s99 = getStatusDisplay(status99?.status)

  return (
    <>
      {/* Botão de Status na Barra Superior */}
      <button
        onClick={() => setModalOpen(true)}
        title="Status das Lojas no Delivery (99Food / iFood)"
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
          hasAlert
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 animate-pulse shadow-sm'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
        }`}
      >
        <Store size={14} className={hasAlert ? 'text-amber-500' : 'text-slate-400'} />
        
        {/* Indicador 99Food */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${s99.dotClass}`} />
          <span className="font-semibold text-[11px]">99Food:</span>
          <span className="capitalize">{loading ? '...' : s99.label}</span>
        </div>

        <span className="text-slate-300 dark:text-slate-600">|</span>

        {/* Indicador iFood */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          <span className="font-semibold text-[11px]">iFood:</span>
          <span className="text-[10px] text-slate-400">Homologação</span>
        </div>

        {hasAlert && (
          <span className="ml-0.5 px-1 py-0.2 bg-amber-500 text-white rounded text-[9px] font-bold">
            ALERTA
          </span>
        )}
      </button>

      {/* Modal de Detalhes dos Deliveries */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                  <Store size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Monitoramento de Lojas (Delivery)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cantina em Casa • Status Operacional em Tempo Real
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Atualizar Status"
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Conteúdo */}
            <div className="p-6 space-y-4">
              {/* Card 99Food */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      99Food (Cantina em Casa)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 font-medium">
                      Multi-binding Ativo
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s99.badgeClass}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s99.dotClass}`} />
                    {s99.label}
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>ID da Loja na 99:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-300">5764608576400918038</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Última Sincronização:</span>
                    <span>
                      {status99?.ultima_verificacao
                        ? format(new Date(status99.ultima_verificacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : 'Hoje, conectado'}
                    </span>
                  </div>
                  {status99?.motivo_pausa && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
                      <span>Motivo da Pausa:</span>
                      <span>{status99.motivo_pausa}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 size={13} /> Webhooks em tempo real ativos
                  </span>
                  <a
                    href="https://merchant.99app.com/pt-BR/manager/overview"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-orange-600 hover:text-orange-700 dark:text-orange-400 font-medium hover:underline"
                  >
                    Portal 99 <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Card iFood */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      iFood (Cantina em Casa)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-medium">
                      Chamado #33063337
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Em Homologação
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Aguardando resposta do suporte do iFood para validação do módulo <strong>Merchant</strong> (Status da loja, pausas emergenciais e horários).
                </p>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Client ID: 5d0df11b...</span>
                  <a
                    href="https://portal.ifood.com.br"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-red-600 hover:text-red-700 dark:text-red-400 font-medium hover:underline"
                  >
                    Portal Parceiro iFood <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>

            {/* Rodapé */}
            <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
