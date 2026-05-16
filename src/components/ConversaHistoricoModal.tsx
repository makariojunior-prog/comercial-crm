import { useEffect, useState } from 'react'
import { X, Eye } from 'lucide-react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { CrmConversation } from '../types'

const CAT_BADGE: Record<string, string> = {
  'QUALIDADE':  'bg-orange-100 text-orange-700',
  'LOGÍSTICA':  'bg-blue-100 text-blue-700',
  'RECLAMAÇÃO': 'bg-red-100 text-red-700',
  'ELOGIO':     'bg-green-100 text-green-700',
  'PEDIDO':     'bg-purple-100 text-purple-700',
  'DÚVIDA':     'bg-sky-100 text-sky-700',
  'OUTROS':     'bg-slate-100 text-slate-600',
  'EQUIPE':     'bg-slate-50 text-slate-400',
}

const CONEXAO_LABEL: Record<string, string> = {
  CANTINA: 'Cantina', LUMAR: 'Lumar', LUMAR_NOVOS: 'Lumar Novos',
}

function fmtData(dt: string) {
  const d = parseISO(dt)
  if (isToday(d))     return format(d, 'HH:mm')
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm')}`
  return format(d, 'dd/MM HH:mm')
}

interface Props {
  conversa: CrmConversation
  onClose: () => void
  onMarcarVisto: (id: string) => void
}

export default function ConversaHistoricoModal({ conversa, onClose, onMarcarVisto }: Props) {
  const [historico, setHistorico] = useState<CrmConversation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!conversa.telefone) return
    setLoading(true)
    supabase
      .from('crm_conversations')
      .select('*')
      .eq('telefone', conversa.telefone)
      .neq('id', conversa.id)
      .order('received_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        setHistorico((data ?? []).reverse())
        setLoading(false)
      })
  }, [conversa.id, conversa.telefone])

  const alertBorder =
    conversa.categoria === 'RECLAMAÇÃO' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' :
    conversa.categoria === 'QUALIDADE'  ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' :
    conversa.categoria === 'LOGÍSTICA'  ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' :
    'border-slate-200 bg-slate-50 dark:bg-slate-700/50'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {conversa.nome ?? conversa.telefone ?? 'Desconhecido'}
              </span>
              {conversa.nome && conversa.telefone && (
                <span className="text-xs text-slate-400">{conversa.telefone}</span>
              )}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                conversa.conexao === 'CANTINA'     ? 'bg-orange-50 text-orange-500' :
                conversa.conexao === 'LUMAR_NOVOS' ? 'bg-purple-50 text-purple-500' :
                                                      'bg-blue-50 text-blue-500'
              }`}>
                {CONEXAO_LABEL[conversa.conexao] ?? conversa.conexao}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {historico.length > 0 ? `${historico.length} mensagen${historico.length > 1 ? 's' : ''} anteriores` : 'Histórico do cliente'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {/* Skeleton */}
          {loading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {/* Sem telefone */}
          {!loading && !conversa.telefone && (
            <p className="text-xs text-slate-400 text-center py-3">Telefone não disponível para buscar histórico</p>
          )}

          {/* Sem histórico */}
          {!loading && conversa.telefone && historico.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-3">Sem mensagens anteriores deste cliente</p>
          )}

          {/* Mensagens anteriores */}
          {!loading && historico.map(h => (
            <div key={h.id} className="flex gap-2 items-start">
              <span className="text-[10px] text-slate-400 shrink-0 mt-1.5 w-14 text-right leading-tight">
                {fmtData(h.received_at)}
              </span>
              <div className="flex-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 min-w-0">
                {h.categoria && (
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mb-1 ${CAT_BADGE[h.categoria] ?? 'bg-slate-100 text-slate-500'}`}>
                    {h.categoria}
                  </span>
                )}
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                  {h.resumo ?? h.texto}
                </p>
              </div>
            </div>
          ))}

          {/* Divisor */}
          {!loading && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
              <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">mensagem que gerou o alerta</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
            </div>
          )}

          {/* Mensagem atual */}
          <div className={`rounded-xl border-2 ${alertBorder} px-3 py-2.5`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              {conversa.categoria && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CAT_BADGE[conversa.categoria] ?? 'bg-slate-100 text-slate-500'}`}>
                  {conversa.categoria}
                </span>
              )}
              <span className="text-[10px] text-slate-400 ml-auto">{fmtData(conversa.received_at)}</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
              {conversa.texto}
            </p>
            {conversa.resumo && conversa.resumo !== conversa.texto && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 italic border-t border-slate-200 dark:border-slate-600 pt-1.5">
                Resumo IA: {conversa.resumo}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2 shrink-0">
          {conversa.confianca && (
            <span className="text-xs text-slate-400">confiança IA: {conversa.confianca}</span>
          )}
          <div className="flex gap-2 ml-auto">
            {!conversa.visto && (
              <button
                onClick={() => { onMarcarVisto(conversa.id); onClose() }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
              >
                <Eye size={13} /> Marcar como visto
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
