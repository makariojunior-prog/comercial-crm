import { useState, useEffect, useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, isToday } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { CrmConversation } from '../types'
import ConversaHistoricoModal from './ConversaHistoricoModal'

const CRITICAS = ['QUALIDADE', 'LOGÍSTICA', 'RECLAMAÇÃO']

const CAT_BADGE: Record<string, string> = {
  'QUALIDADE':  'bg-orange-100 text-orange-700',
  'LOGÍSTICA':  'bg-blue-100 text-blue-700',
  'RECLAMAÇÃO': 'bg-red-100 text-red-700',
}

// Cores por origem
const CONEXAO_CARD: Record<string, { base: string; hover: string; label: string; tag: string }> = {
  CANTINA:    {
    base:  'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50',
    hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700',
    label: 'Cantina',
    tag:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  LUMAR:      {
    base:  'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50',
    hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700',
    label: 'Lumar',
    tag:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  LUMAR_NOVOS: {
    base:  'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50',
    hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700',
    label: 'Lumar N.',
    tag:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
}

export default function ConversacoesAlertasWidget() {
  const [items, setItems] = useState<CrmConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [modalConversa, setModalConversa] = useState<CrmConversation | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_conversations')
      .select('*')
      .in('categoria', CRITICAS)
      .eq('visto', false)
      .eq('archived', false)
      .order('received_at', { ascending: false })
      .limit(10)
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('conv-alertas-widget')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_conversations' }, (payload) => {
        const nova = payload.new as CrmConversation
        if (CRITICAS.includes(nova.categoria ?? '')) {
          setItems(prev => [nova, ...prev.slice(0, 9)])
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_conversations' }, (payload) => {
        const updated = payload.new as CrmConversation
        if (updated.visto || updated.archived) {
          setItems(prev => prev.filter(c => c.id !== updated.id))
        } else if (CRITICAS.includes(updated.categoria ?? '')) {
          setItems(prev => {
            const exists = prev.find(c => c.id === updated.id)
            if (exists) return prev.map(c => c.id === updated.id ? updated : c)
            return [updated, ...prev.slice(0, 9)]
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-red-500" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Alertas Conversas</h3>
        </div>
        {!loading && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            items.length > 0
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
          }`}>
            {items.length} não {items.length === 1 ? 'vista' : 'vistas'}
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-5 text-center text-slate-400">
          <MessageSquare size={22} className="mx-auto mb-1.5 opacity-30" />
          <p className="text-xs">Sem alertas críticos</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(c => {
            const cx = CONEXAO_CARD[c.conexao] ?? CONEXAO_CARD['CANTINA']
            return (
              <button
                key={c.id}
                onClick={() => setModalConversa(c)}
                className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg border active:scale-[.99] transition-all text-left ${cx.base} ${cx.hover}`}
              >
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 whitespace-nowrap ${CAT_BADGE[c.categoria ?? ''] ?? 'bg-slate-100 text-slate-500'}`}>
                  {c.categoria}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{c.nome ?? c.telefone ?? '—'}</p>
                    <span className={`text-[9px] font-semibold px-1 py-0.5 rounded shrink-0 ${cx.tag}`}>{cx.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.resumo ?? c.texto}</p>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0 text-right leading-tight">
                  {!isToday(parseISO(c.received_at)) && (
                    <span className="block font-semibold text-slate-500 dark:text-slate-400">
                      {format(parseISO(c.received_at), 'dd/MM')}
                    </span>
                  )}
                  {format(parseISO(c.received_at), 'HH:mm')}
                </span>
              </button>
            )
          })}
          {items.length > 5 && (
            <p className="text-[11px] text-center text-slate-400 pt-1">+{items.length - 5} alertas não vistos</p>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
        <button onClick={() => navigate('/conversas')} className="w-full text-xs text-orange-500 hover:text-orange-600 font-medium text-center">
          Ver todas as conversas →
        </button>
      </div>

      {modalConversa && (
        <ConversaHistoricoModal
          conversa={modalConversa}
          onClose={() => setModalConversa(null)}
          onMarcarVisto={async (id) => {
            setItems(prev => prev.filter(c => c.id !== id))
            setModalConversa(null)
            await supabase.from('crm_conversations').update({ visto: true }).eq('id', id)
          }}
        />
      )}
    </div>
  )
}
