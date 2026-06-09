import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Users, ShoppingBag, Package2, ClipboardList, MapPin, CalendarDays, Store, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Result {
  id: string
  title: string
  sub: string
  category: string
  label: string
  icon: any
  to: string
  color: string
}

const CAT = {
  cliente:        { label: 'Cli. Atacado',    icon: Users,        to: '/clientes',        color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  cli_varejo:     { label: 'Cli. Varejo',     icon: Store,        to: '/clientes-varejo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'   },
  pedido_varejo:  { label: 'Pedido Varejo',   icon: ShoppingBag,  to: '/varejo',          color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  pedido_atacado: { label: 'Ped. Atacado',    icon: Package2,     to: '/atacado',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  negocio:        { label: 'Negócio',         icon: ClipboardList,to: '/negocios',        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  visita:         { label: 'Visita',          icon: MapPin,       to: '/visitas',         color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'  },
  agenda:         { label: 'Agenda',          icon: CalendarDays, to: '/agenda',          color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'     },
} as const

type CatKey = keyof typeof CAT

async function runSearch(q: string): Promise<Result[]> {
  const clean = q.trim().replace(/^#/, '')
  const like = `%${clean}%`
  const isNum = /^\d+$/.test(clean)

  const [clientes, varejo_clients, varejo, atacado, negocios, visitas, agenda] = await Promise.all([
    // Clientes atacado
    supabase.from('crm_clients').select('id, nome, tipo, rota').ilike('nome', like).limit(5),
    // Clientes varejo (tabela de cadastros com UUID)
    supabase.from('varejo_clientes').select('id, nome, telefone').ilike('nome', like).limit(5),
    // Pedidos varejo - ordernar por created_at DESC para mostrar mais recentes
    supabase.from('varejo_pedidos').select('id, num_pedido, cliente, data_entrega, status_icon, created_at')
      .or(isNum ? `num_pedido.eq.${clean},cliente.ilike.${like}` : `cliente.ilike.${like},num_pedido.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(5),
    // Pedidos atacado - ordernar por created_at DESC para mostrar mais recentes
    supabase.from('atacado_pedidos').select('id, numero_pedido, id_venda, cliente_nome, data_entrega, created_at')
      .or(isNum ? `numero_pedido.eq.${parseInt(clean)},id_venda.eq.${parseInt(clean)}` : `cliente_nome.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(5),
    // Negócios
    supabase.from('deals').select('id, client_name, status, deal_type').ilike('client_name', like).limit(4),
    // Visitas
    supabase.from('visits').select('id, client_name, visit_date, visit_type').ilike('client_name', like).limit(4),
    // Agenda
    supabase.from('agenda_compromissos').select('id, titulo, data, cliente_nome, tipo')
      .or(`titulo.ilike.${like},cliente_nome.ilike.${like}`).limit(4),
  ])

  const results: Result[] = []

  // Clientes atacado
  for (const c of (clientes.data ?? [])) {
    results.push({
      id: `cliente-${c.id}`, title: c.nome,
      sub: [c.tipo, c.rota].filter(Boolean).join(' · '),
      category: 'cliente', label: CAT.cliente.label, icon: CAT.cliente.icon, color: CAT.cliente.color,
      to: `/clientes?openId=${c.id}`,
    })
  }

  // Clientes varejo
  for (const c of (varejo_clients.data ?? [])) {
    results.push({
      id: `clivar-${c.id}`, title: c.nome,
      sub: c.telefone ?? '',
      category: 'cli_varejo', label: CAT.cli_varejo.label, icon: CAT.cli_varejo.icon, color: CAT.cli_varejo.color,
      to: `/clientes-varejo?openId=${c.id}`,
    })
  }

  // Pedidos varejo
  for (const p of (varejo.data ?? [])) {
    results.push({
      id: `varejo-${p.id}`, title: `#${p.num_pedido} — ${p.cliente ?? ''}`,
      sub: p.data_entrega ? `Entrega ${p.data_entrega.split('-').reverse().join('/')}` : '',
      category: 'pedido_varejo', label: CAT.pedido_varejo.label, icon: CAT.pedido_varejo.icon, color: CAT.pedido_varejo.color,
      to: `/varejo?openId=${p.id}`,
    })
  }

  // Pedidos atacado
  for (const p of (atacado.data ?? [])) {
    const num = p.numero_pedido ?? p.id_venda
    results.push({
      id: `atacado-${p.id}`, title: `#${num} — ${p.cliente_nome ?? ''}`,
      sub: p.data_entrega ? `Entrega ${p.data_entrega.split('-').reverse().join('/')}` : '',
      category: 'pedido_atacado', label: CAT.pedido_atacado.label, icon: CAT.pedido_atacado.icon, color: CAT.pedido_atacado.color,
      to: `/atacado?openId=${p.id}`,
    })
  }

  // Negócios
  for (const n of (negocios.data ?? [])) {
    results.push({
      id: `negocio-${n.id}`, title: n.client_name,
      sub: [n.deal_type, n.status].filter(Boolean).join(' · '),
      category: 'negocio', label: CAT.negocio.label, icon: CAT.negocio.icon, color: CAT.negocio.color,
      to: `/negocios?openId=${n.id}`,
    })
  }

  // Visitas
  for (const v of (visitas.data ?? [])) {
    results.push({
      id: `visita-${v.id}`, title: v.client_name,
      sub: [v.visit_type, v.visit_date ? v.visit_date.split('-').reverse().slice(0,2).join('/') : ''].filter(Boolean).join(' · '),
      category: 'visita', label: CAT.visita.label, icon: CAT.visita.icon, color: CAT.visita.color,
      to: `/visitas?openId=${v.id}`,
    })
  }

  // Agenda
  for (const a of (agenda.data ?? [])) {
    results.push({
      id: `agenda-${a.id}`, title: a.titulo,
      sub: [a.tipo, a.cliente_nome, a.data ? a.data.split('-').reverse().join('/') : ''].filter(Boolean).join(' · '),
      category: 'agenda', label: CAT.agenda.label, icon: CAT.agenda.icon, color: CAT.agenda.color,
      to: `/agenda?openId=${a.id}`,
    })
  }

  return results
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function GlobalSearch({ open, onClose }: Props) {
  const navigate   = useNavigate()
  const inputRef   = useRef<HTMLInputElement>(null)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<Result[]>([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setSelected(0)
    }
  }, [open])

  // Debounced search
  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await runSearch(q.trim())
        setResults(r)
        setSelected(0)
      } catch (err) {
        console.error('Search error:', err)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [])

  useEffect(() => { search(query) }, [query, search])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') setSelected(s => Math.min(s + 1, results.length - 1))
      if (e.key === 'ArrowUp')   setSelected(s => Math.max(s - 1, 0))
      if (e.key === 'Enter' && results[selected]) {
        navigate(results[selected].to)
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selected, navigate, onClose])

  function go(r: Result) {
    navigate(r.to)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          {loading
            ? <RefreshCw size={18} className="text-orange-500 animate-spin shrink-0" />
            : <Search size={18} className="text-slate-400 shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar cliente, pedido, negócio, visita, agenda..."
            className="flex-1 bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={16} />
            </button>
          )}
          <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600">
            Esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700/50">
            {results.map((r, i) => {
              const Icon = r.icon
              return (
                <li key={r.id}>
                  <button
                    onClick={() => go(r)}
                    onMouseEnter={() => setSelected(i)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      i === selected ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${r.color.split(' ').slice(0,2).join(' ')}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{r.title}</p>
                      {r.sub && <p className="text-[11px] text-slate-400 truncate">{r.sub}</p>}
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${r.color}`}>
                      {r.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Empty state */}
        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            Nenhum resultado para <strong className="text-slate-600 dark:text-slate-300">"{query}"</strong>
          </div>
        )}

        {/* Hint */}
        {query.trim().length < 2 && (
          <div className="px-4 py-4 text-xs text-slate-400 space-y-1">
            <p>Digite pelo menos 2 caracteres para buscar em todos os módulos.</p>
            <p className="flex items-center gap-2 flex-wrap">
              <span>↑↓ navegar</span>
              <span>· Enter para abrir</span>
              <span>· Esc para fechar</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
