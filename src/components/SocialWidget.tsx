import { useState, useEffect, useCallback } from 'react'
import { Instagram } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { CrmSocialComment } from '../types'

const CAT_BADGE: Record<string, string> = {
  'PERGUNTA_PRECO':  'bg-purple-100 text-purple-700',
  'DUVIDA_ENTREGA':  'bg-blue-100 text-blue-700',
  'ELOGIO':          'bg-green-100 text-green-700',
  'RECLAMACAO':      'bg-red-100 text-red-700',
  'OUTRO':           'bg-slate-100 text-slate-500',
}

const CAT_LABEL: Record<string, string> = {
  'PERGUNTA_PRECO': 'Preço',
  'DUVIDA_ENTREGA': 'Entrega',
  'ELOGIO':         'Elogio',
  'RECLAMACAO':     'Reclamação',
  'OUTRO':          'Outro',
}

export default function SocialWidget() {
  const [items, setItems]   = useState<CrmSocialComment[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_social_comments')
      .select('*')
      .eq('status', 'NOVO')
      .order('received_at', { ascending: false })
      .limit(8)
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel('social-widget-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_social_comments' }, (p) => {
        const c = p.new as CrmSocialComment
        if (c.status === 'NOVO') setItems(prev => [c, ...prev.slice(0, 7)])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_social_comments' }, (p) => {
        const c = p.new as CrmSocialComment
        if (c.status !== 'NOVO') setItems(prev => prev.filter(x => x.id !== c.id))
        else setItems(prev => prev.map(x => x.id === c.id ? c : x))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Instagram size={15} className="text-pink-500" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Comentários Instagram</h3>
        </div>
        {!loading && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            items.length > 0
              ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
          }`}>
            {items.length} {items.length === 1 ? 'novo' : 'novos'}
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
          <Instagram size={22} className="mx-auto mb-1.5 opacity-30" />
          <p className="text-xs">Nenhum comentário pendente</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-1.5">
          {items.slice(0, 5).map(c => (
            <button
              key={c.id}
              onClick={() => navigate('/social')}
              className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 hover:bg-pink-50 dark:hover:bg-pink-900/10 hover:border-pink-200 dark:hover:border-pink-800 active:scale-[.99] transition-all text-left"
            >
              {c.categoria ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 whitespace-nowrap ${CAT_BADGE[c.categoria] ?? 'bg-slate-100 text-slate-500'}`}>
                  {CAT_LABEL[c.categoria] ?? c.categoria}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 bg-pink-50 text-pink-400 font-medium">
                  IG
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">@{c.username ?? '—'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.mensagem}</p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{format(parseISO(c.received_at), 'HH:mm')}</span>
            </button>
          ))}
          {items.length > 5 && (
            <p className="text-[11px] text-center text-slate-400 pt-1">+{items.length - 5} comentários pendentes</p>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
        <button onClick={() => navigate('/social')} className="w-full text-xs text-pink-500 hover:text-pink-600 font-medium text-center">
          Ver todos os comentários →
        </button>
      </div>
    </div>
  )
}
