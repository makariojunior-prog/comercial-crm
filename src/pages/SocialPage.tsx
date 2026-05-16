import { useState, useEffect, useCallback, useMemo } from 'react'
import { Instagram, RefreshCw, Search, X, ExternalLink, MessageCircle, Check, EyeOff, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { CrmSocialComment } from '../types'

type StatusTab = 'NOVO' | 'RESPONDIDO' | 'TODOS'

const CAT_BADGE: Record<string, string> = {
  'PERGUNTA_PRECO':    'bg-purple-100 text-purple-700',
  'DUVIDA_ENTREGA':    'bg-blue-100 text-blue-700',
  'ELOGIO':            'bg-green-100 text-green-700',
  'RECLAMACAO':        'bg-red-100 text-red-700',
  'OUTRO':             'bg-slate-100 text-slate-500',
}

const CAT_LABEL: Record<string, string> = {
  'PERGUNTA_PRECO':    'Preço',
  'DUVIDA_ENTREGA':    'Entrega',
  'ELOGIO':            'Elogio',
  'RECLAMACAO':        'Reclamação',
  'OUTRO':             'Outro',
}

function fmtDate(dt: string) {
  const d = parseISO(dt)
  if (isToday(d))     return format(d, 'HH:mm')
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm')}`
  return format(d, "dd/MM HH:mm")
}

function groupByDate(items: CrmSocialComment[]) {
  const map = new Map<string, CrmSocialComment[]>()
  for (const c of items) {
    const key = format(parseISO(c.received_at), 'yyyy-MM-dd')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  return Array.from(map.entries()).map(([, list]) => {
    const d = parseISO(list[0].received_at)
    let label: string
    if (isToday(d))          label = 'Hoje'
    else if (isYesterday(d)) label = 'Ontem'
    else                     label = format(d, "EEEE, dd 'de' MMMM", { locale: ptBR })
    return { label, items: list }
  })
}

export default function SocialPage() {
  const { profile } = useAuth()
  const [comments, setComments] = useState<CrmSocialComment[]>([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<StatusTab>('NOVO')
  const [search, setSearch]     = useState('')
  const [replyModal, setReplyModal] = useState<CrmSocialComment | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_social_comments')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(300)
    setComments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('crm-social-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_social_comments' }, (p) => {
        setComments(prev => [p.new as CrmSocialComment, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_social_comments' }, (p) => {
        setComments(prev => prev.map(c => c.id === (p.new as CrmSocialComment).id ? p.new as CrmSocialComment : c))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function marcarIgnorado(id: string) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: 'IGNORADO' } : c))
    await supabase.from('crm_social_comments').update({ status: 'IGNORADO' }).eq('id', id)
  }

  async function salvarResposta(id: string, resposta: string) {
    const now = new Date().toISOString()
    const update: Partial<CrmSocialComment> = { status: 'RESPONDIDO', resposta, respondido_por: profile?.nome ?? profile?.email ?? null, respondido_em: now }
    setComments(prev => prev.map(c => c.id === id ? { ...c, ...update } : c))
    await supabase.from('crm_social_comments').update(update).eq('id', id)
    setReplyModal(null)
  }

  const filtered = useMemo(() => {
    let list = comments
    if (tab !== 'TODOS') list = list.filter(c => c.status === tab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.username?.toLowerCase().includes(q) ||
        c.nome?.toLowerCase().includes(q) ||
        c.mensagem.toLowerCase().includes(q)
      )
    }
    return list
  }, [comments, tab, search])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  const novosCount = useMemo(() => comments.filter(c => c.status === 'NOVO').length, [comments])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Instagram size={20} className="text-pink-500" />
            Redes Sociais
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Comentários Instagram · Cantina em Casa</p>
        </div>
        <button onClick={load} className="btn-ghost p-2 shrink-0">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl w-fit">
          {(['NOVO', 'RESPONDIDO', 'TODOS'] as StatusTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                tab === t
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'NOVO' ? `Novos${novosCount > 0 ? ` (${novosCount})` : ''}` : t === 'RESPONDIDO' ? 'Respondidos' : 'Todos'}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar usuário ou comentário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input py-1.5 pl-7 pr-7 text-sm sm:w-52"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center text-slate-400">
          <Instagram size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhum comentário encontrado</p>
        </div>
      )}

      {/* Grouped list */}
      {!loading && grouped.map(({ label, items }) => (
        <div key={label} className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">{label}</p>
          <div className="space-y-2">
            {items.map(c => (
              <CommentCard
                key={c.id}
                comment={c}
                onResponder={() => setReplyModal(c)}
                onIgnorar={() => marcarIgnorado(c.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Reply modal */}
      {replyModal && (
        <ReplyModal
          comment={replyModal}
          onClose={() => setReplyModal(null)}
          onSalvar={salvarResposta}
        />
      )}
    </div>
  )
}

// ─── CommentCard ────────────────────────────────────────────────
function CommentCard({ comment: c, onResponder, onIgnorar }: {
  comment: CrmSocialComment
  onResponder: () => void
  onIgnorar: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`card border-l-4 ${
      c.status === 'NOVO'        ? 'border-l-pink-400' :
      c.status === 'RESPONDIDO'  ? 'border-l-green-400 opacity-70' :
                                   'border-l-slate-200 opacity-40'
    } overflow-hidden`}>
      <div className="p-3">
        {/* Top row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
              @{c.username ?? 'desconhecido'}
            </span>
            {c.nome && c.nome !== c.username && (
              <span className="text-[11px] text-slate-400 truncate max-w-[120px]">{c.nome}</span>
            )}
            {c.categoria && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${CAT_BADGE[c.categoria] ?? 'bg-slate-100 text-slate-500'}`}>
                {CAT_LABEL[c.categoria] ?? c.categoria}
              </span>
            )}
            {c.status === 'RESPONDIDO' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 shrink-0 flex items-center gap-0.5">
                <Check size={9} /> Respondido
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-slate-400">{fmtDate(c.received_at)}</span>
            {c.mensagem.length > 120 && (
              <button onClick={() => setExpanded(v => !v)} className="text-slate-400 hover:text-slate-600 p-0.5">
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </div>
        </div>

        {/* Comment text */}
        <p className={`mt-1.5 text-sm text-slate-700 dark:text-slate-300 ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>
          {c.mensagem}
        </p>

        {/* Sugestão IA */}
        {c.sugestao_resposta && c.status === 'NOVO' && (
          <div className="mt-2 px-2.5 py-2 rounded-lg bg-pink-50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-800">
            <p className="text-[10px] text-pink-500 font-semibold mb-0.5">Sugestão IA</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{c.sugestao_resposta}</p>
          </div>
        )}

        {/* Resposta registrada */}
        {c.resposta && c.status === 'RESPONDIDO' && (
          <div className="mt-2 px-2.5 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
            <p className="text-[10px] text-green-600 font-semibold mb-0.5">
              Respondido{c.respondido_por ? ` por ${c.respondido_por}` : ''}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{c.resposta}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {c.post_link && (
            <a
              href={c.post_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-pink-500 transition-colors"
            >
              <ExternalLink size={11} /> Ver post
            </a>
          )}
          {c.status === 'NOVO' && (
            <>
              <button
                onClick={onResponder}
                className="ml-auto flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-pink-900/20 text-pink-600 hover:bg-pink-100 transition-colors"
              >
                <MessageCircle size={12} /> Responder
              </button>
              <button
                onClick={onIgnorar}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <EyeOff size={11} /> Ignorar
              </button>
            </>
          )}
          {c.status === 'RESPONDIDO' && (
            <button
              onClick={onResponder}
              className="ml-auto text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Editar resposta
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ReplyModal ─────────────────────────────────────────────────
function ReplyModal({ comment: c, onClose, onSalvar }: {
  comment: CrmSocialComment
  onClose: () => void
  onSalvar: (id: string, resposta: string) => void
}) {
  const [texto, setTexto] = useState(c.sugestao_resposta ?? '')
  const [copied, setCopied] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(texto)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Instagram size={15} className="text-pink-500" />
              Responder @{c.username}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtDate(c.received_at)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[65vh]">
          {/* Comentário original */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Comentário</p>
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{c.mensagem}</p>
            </div>
          </div>

          {/* Post link */}
          {c.post_link && (
            <a
              href={c.post_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-pink-500 hover:text-pink-600 font-medium"
            >
              <ExternalLink size={12} /> Abrir post no Instagram
            </a>
          )}

          {/* Resposta */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sua resposta</p>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={4}
              placeholder="Digite sua resposta..."
              className="input w-full text-sm resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              A resposta fica salva no CRM como referência. Cole no Instagram após copiar.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
          <button
            onClick={copiar}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              copied
                ? 'bg-green-50 text-green-600'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Copy size={12} /> {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button
            onClick={() => onSalvar(c.id, texto)}
            disabled={!texto.trim()}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 transition-colors"
          >
            <Check size={12} /> Marcar como respondido
          </button>
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
