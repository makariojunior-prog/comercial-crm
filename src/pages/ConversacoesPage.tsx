import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { MessageSquare, RefreshCw, Eye, EyeOff, Search, X, ChevronDown, ChevronUp, AlertTriangle, RotateCcw, History } from 'lucide-react'
import ConversaHistoricoModal from '../components/ConversaHistoricoModal'
import AutomacaoTab from './AutomacaoTab'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { CrmConversation } from '../types'

type ConexaoTab = 'TODOS' | 'CANTINA' | 'LUMAR' | 'LUMAR_NOVOS'

const CATS = ['QUALIDADE', 'LOGÍSTICA', 'RECLAMAÇÃO', 'ELOGIO', 'PEDIDO', 'DÚVIDA', 'OUTROS', 'EQUIPE'] as const

const CAT_STYLES: Record<string, { border: string; badge: string }> = {
  'QUALIDADE':  { border: 'border-l-orange-500', badge: 'bg-orange-100 text-orange-700' },
  'LOGÍSTICA':  { border: 'border-l-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  'RECLAMAÇÃO': { border: 'border-l-red-500',    badge: 'bg-red-100 text-red-700' },
  'ELOGIO':     { border: 'border-l-green-500',  badge: 'bg-green-100 text-green-700' },
  'PEDIDO':     { border: 'border-l-purple-400', badge: 'bg-purple-100 text-purple-700' },
  'DÚVIDA':     { border: 'border-l-sky-400',    badge: 'bg-sky-100 text-sky-700' },
  'OUTROS':     { border: 'border-l-slate-300',  badge: 'bg-slate-100 text-slate-600' },
  'EQUIPE':     { border: 'border-l-slate-200',  badge: 'bg-slate-50 text-slate-400' },
}

const CRITICAS = new Set(['QUALIDADE', 'LOGÍSTICA', 'RECLAMAÇÃO'])

const CONEXAO_LABEL: Record<ConexaoTab, string> = {
  TODOS: 'Todas', CANTINA: 'Cantina', LUMAR: 'Lumar', LUMAR_NOVOS: 'Lumar Novos',
}

export default function ConversacoesPage() {
  const [conversas, setConversas] = useState<CrmConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conexaoTab, setConexaoTab] = useState<ConexaoTab>('TODOS')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [hideVisto, setHideVisto] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalConversa, setModalConversa] = useState<CrmConversation | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessMsg, setReprocessMsg] = useState<string | null>(null)
  const [vista, setVista] = useState<'CONVERSAS' | 'AUTOMACAO'>('CONVERSAS')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('crm_conversations')
      .select('*')
      .eq('archived', false)
      .order('received_at', { ascending: false })
      .limit(200)
    if (error) { setLoadError(error.message); setLoading(false); return }
    setConversas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime: new messages arrive and categoria updates (set by Edge Function)
  useEffect(() => {
    const channel = supabase
      .channel('crm-conversas-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_conversations' }, (payload) => {
        const msg = payload.new as CrmConversation
        if (msg.archived) return
        setConversas(prev => [msg, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_conversations' }, (payload) => {
        const updated = payload.new as CrmConversation
        setConversas(prev => prev.map(c => c.id === updated.id ? updated : c))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const errosCount = useMemo(() => conversas.filter(c => c.status_ia === 'error').length, [conversas])

  async function reprocessarErros() {
    setReprocessing(true)
    setReprocessMsg(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reprocess-conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json() as { total?: number; ok?: number; failed?: number; error?: string }
      if (json.error) throw new Error(json.error)
      setReprocessMsg(`✓ ${json.ok}/${json.total} reprocessadas`)
      setTimeout(() => { setReprocessMsg(null); load() }, 3000)
    } catch (e) {
      setReprocessMsg(e instanceof Error ? e.message : 'Erro')
      setTimeout(() => setReprocessMsg(null), 5000)
    } finally {
      setReprocessing(false)
    }
  }

  async function marcarVisto(id: string) {
    setConversas(prev => prev.map(c => c.id === id ? { ...c, visto: true } : c))
    await supabase.from('crm_conversations').update({ visto: true }).eq('id', id)
  }

  const criticasNaoVistas = useMemo(
    () => conversas.filter(c => CRITICAS.has(c.categoria ?? '') && !c.visto).length,
    [conversas]
  )

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const src = conexaoTab === 'TODOS' ? conversas : conversas.filter(c => c.conexao === conexaoTab)
    for (const c of src) {
      if (c.categoria) counts[c.categoria] = (counts[c.categoria] ?? 0) + 1
    }
    return counts
  }, [conversas, conexaoTab])

  const filtered = useMemo(() => {
    let list = conversas
    if (conexaoTab !== 'TODOS') list = list.filter(c => c.conexao === conexaoTab)
    if (catFilter) list = list.filter(c => c.categoria === catFilter)
    if (hideVisto) list = list.filter(c => !c.visto)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.nome?.toLowerCase().includes(q) ||
        c.telefone?.includes(q) ||
        c.texto.toLowerCase().includes(q) ||
        c.resumo?.toLowerCase().includes(q)
      )
    }
    return list
  }, [conversas, conexaoTab, catFilter, hideVisto, search])

  const grouped = useMemo(() => {
    const map = new Map<string, CrmConversation[]>()
    for (const c of filtered) {
      const key = format(parseISO(c.received_at), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return Array.from(map.entries()).map(([, items]) => {
      const d = parseISO(items[0].received_at)
      let label: string
      if (isToday(d))          label = 'Hoje'
      else if (isYesterday(d)) label = 'Ontem'
      else                     label = format(d, "EEEE, dd 'de' MMMM", { locale: ptBR })
      return { label, items }
    })
  }, [filtered])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <MessageSquare size={20} className="text-orange-500" />
            Conversas WhatsApp
          </h1>
          {criticasNaoVistas > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
              <AlertTriangle size={11} />
              {criticasNaoVistas} mensagem{criticasNaoVistas > 1 ? 'ns' : ''} crítica{criticasNaoVistas > 1 ? 's' : ''} não vista{criticasNaoVistas > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {errosCount > 0 && (
            <button
              onClick={reprocessarErros}
              disabled={reprocessing}
              title="Reprocessar mensagens com erro de IA"
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                reprocessMsg?.startsWith('✓')
                  ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                  : reprocessMsg
                  ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
                  : 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              }`}
            >
              <RotateCcw size={13} className={reprocessing ? 'animate-spin' : ''} />
              {reprocessing ? 'Reprocessando…' : (reprocessMsg ?? `Reprocessar ${errosCount} erro${errosCount > 1 ? 's' : ''}`)}
            </button>
          )}
          <button
            onClick={() => setHideVisto(v => !v)}
            title={hideVisto ? 'Mostrar todas' : 'Ocultar vistas'}
            className={`btn-ghost p-2 ${hideVisto ? 'text-orange-500' : ''}`}
          >
            {hideVisto ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Vista tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setVista('CONVERSAS')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
            vista === 'CONVERSAS'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
          }`}
        >
          Conversas
        </button>
        <button
          onClick={() => setVista('AUTOMACAO')}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
            vista === 'AUTOMACAO'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
          }`}
        >
          Automação 🤖
        </button>
      </div>

      {vista === 'AUTOMACAO' ? (
        <AutomacaoTab />
      ) : (
      <>
      {/* Conexão tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-xl w-fit">
        {(['TODOS', 'CANTINA', 'LUMAR', 'LUMAR_NOVOS'] as ConexaoTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setConexaoTab(tab); setCatFilter(null) }}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
              conexaoTab === tab
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            {CONEXAO_LABEL[tab]}
          </button>
        ))}
      </div>

      {/* Category chips + search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1">
          <button
            onClick={() => setCatFilter(null)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-all border ${
              catFilter === null
                ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800 border-transparent'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50'
            }`}
          >
            Todas
          </button>
          {CATS.map(cat => {
            const style = CAT_STYLES[cat]
            const count = catCounts[cat]
            if (!count && catFilter !== cat) return null
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(catFilter === cat ? null : cat)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 transition-all ${
                  catFilter === cat
                    ? (style?.badge ?? 'bg-slate-100 text-slate-600') + ' ring-2 ring-offset-1 ring-slate-300'
                    : (style?.badge ?? 'bg-slate-100 text-slate-600') + ' opacity-80 hover:opacity-100'
                }`}
              >
                {cat} {count ? `(${count})` : ''}
              </button>
            )
          })}
        </div>
        <div className="relative shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input py-1.5 pl-7 pr-7 text-sm sm:w-44"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle size={13} /> {loadError}
          <button onClick={load} className="ml-auto underline">Tentar novamente</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="py-14 text-center text-slate-400">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm">Nenhuma conversa encontrada</p>
          {hideVisto && (
            <button onClick={() => setHideVisto(false)} className="text-xs text-orange-500 mt-1 underline">
              Mostrar todas
            </button>
          )}
        </div>
      )}

      {/* Grouped list */}
      {!loading && grouped.map(({ label, items }) => (
        <div key={label} className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
            {label}
          </p>
          <div className="space-y-1.5">
            {items.map(c => (
              <ConversaCard
                key={c.id}
                conversa={c}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                onMarcarVisto={() => marcarVisto(c.id)}
                onVerHistorico={() => setModalConversa(c)}
              />
            ))}
          </div>
        </div>
      ))}

      {modalConversa && (
        <ConversaHistoricoModal
          conversa={modalConversa}
          onClose={() => setModalConversa(null)}
          onMarcarVisto={(id) => {
            marcarVisto(id)
            setModalConversa(prev => prev?.id === id ? { ...prev, visto: true } : prev)
          }}
        />
      )}
      </>
      )}
    </div>
  )
}

// ─── ConversaCard ───────────────────────────────────────────────
function ConversaCard({ conversa: c, expanded, onToggle, onMarcarVisto, onVerHistorico }: {
  conversa: CrmConversation
  expanded: boolean
  onToggle: () => void
  onMarcarVisto: () => void
  onVerHistorico: () => void
}) {
  const style = CAT_STYLES[c.categoria ?? '']
  const isCritical = CRITICAS.has(c.categoria ?? '')

  return (
    <div className={`card border-l-4 ${style?.border ?? 'border-l-slate-200'} overflow-hidden transition-opacity ${c.visto ? 'opacity-50' : ''}`}>
      <div className="p-3">
        {/* Top row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate max-w-[150px]">
              {c.nome ?? c.telefone ?? 'Desconhecido'}
            </span>
            {c.telefone && c.nome && (
              <span className="text-[11px] text-slate-400 shrink-0">{c.telefone}</span>
            )}
            {c.categoria ? (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${style?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                {c.categoria}
              </span>
            ) : (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 shrink-0">
                {c.status_ia === 'error' ? '⚠ Erro IA' : '⏳ Processando'}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
              c.conexao === 'CANTINA'     ? 'bg-orange-50 text-orange-500' :
              c.conexao === 'LUMAR_NOVOS' ? 'bg-purple-50 text-purple-500' :
                                            'bg-blue-50 text-blue-500'
            }`}>
              {c.conexao === 'LUMAR_NOVOS' ? 'Lumar Novos' : c.conexao.charAt(0) + c.conexao.slice(1).toLowerCase()}
            </span>
            {!c.visto && isCritical && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-slate-400">
              {format(parseISO(c.received_at), 'HH:mm')}
            </span>
            <button onClick={onToggle} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="mt-1.5">
          {expanded ? (
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{c.texto}</p>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{c.resumo ?? c.texto}</p>
          )}
        </div>

        {/* Footer */}
        {(expanded || !c.visto) && (
          <div className="mt-2 flex items-center gap-2">
            {c.confianca && expanded && (
              <span className="text-[11px] text-slate-400">confiança: {c.confianca}</span>
            )}
            <button
              onClick={onVerHistorico}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              <History size={12} /> Ver histórico
            </button>
            {!c.visto && (
              <button
                onClick={onMarcarVisto}
                className="ml-auto text-xs text-slate-500 dark:text-slate-400 hover:text-orange-500 dark:hover:text-orange-400 flex items-center gap-1 transition-colors"
              >
                <Eye size={12} /> Marcar como visto
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
