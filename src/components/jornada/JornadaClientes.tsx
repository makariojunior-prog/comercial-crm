import { useMemo, useState } from 'react'
import { Search, RefreshCw, AlertCircle, MapPin, Handshake, Gavel, Building2, ChevronRight, Truck } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { StatusBadge } from '../StatusBadge'
import { negocioPrincipal, responsavelDaConta, type Conta } from '../../lib/jornada'

type FiltroSit = 'todos' | 'aberto' | 'sucesso' | 'perdido' | 'so_visitas' | 'clientes'

const FILTROS: [FiltroSit, string][] = [
  ['todos', 'Todos'],
  ['aberto', 'Negócio em aberto'],
  ['sucesso', 'Negócio ganho'],
  ['perdido', 'Perdidos'],
  ['so_visitas', 'Só visitas'],
  ['clientes', 'Clientes do atacado'],
]
const PAGINA = 60

interface Props {
  contas: Conta[]
  loading: boolean
  error: string | null
  onReload: () => void
  onOpen: (c: Conta) => void
}

export default function JornadaClientes({ contas, loading, error, onReload, onOpen }: Props) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroSit>('todos')
  const [resp, setResp] = useState('')
  const [limite, setLimite] = useState(PAGINA)

  const responsaveis = useMemo(() => [...new Set(contas.map(responsavelDaConta).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, 'pt')), [contas])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return contas.filter(c => {
      if (q && !c.nome.toLowerCase().includes(q) && !(responsavelDaConta(c) ?? '').toLowerCase().includes(q)) return false
      if (resp && responsavelDaConta(c) !== resp) return false
      const st = negocioPrincipal(c)?.status ?? null
      switch (filtro) {
        case 'aberto': return !!st && !['SUCESSO', 'DESISTIU', 'CANCELADO'].includes(st)
        case 'sucesso': return c.deals.some(d => d.status === 'SUCESSO')
        case 'perdido': return st === 'DESISTIU' || st === 'CANCELADO'
        case 'so_visitas': return c.deals.length === 0 && c.visitas.length > 0
        case 'clientes': return !!c.cliente
        default: return true
      }
    })
  }, [contas, busca, filtro, resp])

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} /> Erro ao carregar: {error}
        <button onClick={onReload} className="ml-auto text-xs underline">Tentar novamente</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar cliente ou responsável..." value={busca}
              onChange={e => { setBusca(e.target.value); setLimite(PAGINA) }} />
          </div>
          <select className="input w-auto text-xs" value={resp} onChange={e => { setResp(e.target.value); setLimite(PAGINA) }}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
          <button onClick={onReload} className="btn-ghost p-2" title="Atualizar"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {FILTROS.map(([f, label]) => (
            <button key={f} onClick={() => { setFiltro(f); setLimite(PAGINA) }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filtro === f ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{lista.length} cliente{lista.length !== 1 ? 's' : ''} · visitas, negócios e registros do comitê agrupados por cliente</p>
      </div>

      {loading && contas.length === 0 ? (
        <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">Nenhum cliente encontrado.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
            {lista.slice(0, limite).map(c => <CardConta key={c.chave} conta={c} onOpen={() => onOpen(c)} />)}
          </div>
          {lista.length > limite && (
            <button onClick={() => setLimite(l => l + PAGINA)} className="btn-secondary mx-auto text-xs">
              Mostrar mais ({lista.length - limite} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}

function CardConta({ conta: c, onOpen }: { conta: Conta; onOpen: () => void }) {
  const principal = negocioPrincipal(c)
  const ultimaVisita = c.visitas[0]
  const ultimoTexto = [...c.movimentos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).find(m => m.follow_up?.trim())?.follow_up
    ?? ultimaVisita?.report ?? principal?.follow_up ?? null
  const dias = c.ultima ? differenceInCalendarDays(new Date(), parseISO(c.ultima)) : null
  const nComite = c.notas.length + (c.cliente?.comite_observacoes ? 1 : 0)

  return (
    <button onClick={onOpen}
      className="card p-3 text-left w-full hover:shadow-md hover:ring-2 hover:ring-orange-200/70 dark:hover:ring-orange-800/50 transition-all group">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {principal && <StatusBadge status={principal.status} />}
            {c.cliente && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Building2 size={10} /> Atacado</span>}
            {principal?.deal_type && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{principal.deal_type}</span>}
          </div>
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate" title={c.nome}>{c.nome}</p>
          {responsavelDaConta(c) && <p className="text-[11px] text-slate-500 truncate">{responsavelDaConta(c)}</p>}
        </div>
        <ChevronRight size={16} className="text-slate-300 group-hover:text-orange-400 shrink-0 mt-1" />
      </div>

      {ultimoTexto?.trim() && <p className="text-xs text-slate-500 dark:text-slate-400 italic line-clamp-2 mt-1.5">"{ultimoTexto}"</p>}

      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1" title="Visitas"><MapPin size={11} /> {c.visitas.length}</span>
        <span className="inline-flex items-center gap-1" title="Negócios"><Handshake size={11} /> {c.deals.length}</span>
        {nComite > 0 && <span className="inline-flex items-center gap-1 text-orange-600" title="Registros do comitê"><Gavel size={11} /> {nComite}</span>}
        {c.ocorrencias.length > 0 && <span className="inline-flex items-center gap-1 text-red-600" title="Ocorrências na entrega"><Truck size={11} /> {c.ocorrencias.length}</span>}
        <span className={`ml-auto ${dias != null && dias > 30 ? 'text-amber-600 font-semibold' : ''}`}>
          {c.ultima ? `${format(parseISO(c.ultima), 'dd/MM/yy', { locale: ptBR })}${dias != null && dias > 0 ? ` · há ${dias}d` : ' · hoje'}` : '—'}
        </span>
      </div>
    </button>
  )
}
