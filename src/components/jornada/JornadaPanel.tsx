import { useCallback, useMemo, useState } from 'react'
import { X, MapPin, Handshake, ArrowRightLeft, Gavel, Truck, Inbox, ClipboardCheck, Plus, User, Gift, Camera, Building2, Pencil } from 'lucide-react'
import { format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useEscKey } from '../../hooks/useEscKey'
import { useAuth } from '../../contexts/AuthContext'
import { StatusBadge } from '../StatusBadge'
import { eventosDaConta, negocioPrincipal, responsavelDaConta, type Conta, type Evento, type EventoTipo } from '../../lib/jornada'
import type { Deal, Visit } from '../../types'

const ESTILO: Record<EventoTipo, { icon: typeof MapPin; cor: string; rotulo: string }> = {
  visita:         { icon: MapPin,          cor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   rotulo: 'Visita' },
  negocio_novo:   { icon: Handshake,       cor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', rotulo: 'Negócio' },
  negocio_mov:    { icon: ArrowRightLeft,  cor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       rotulo: 'Negócio' },
  nota_comite:    { icon: Gavel,           cor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', rotulo: 'Comitê' },
  comite_cliente: { icon: ClipboardCheck,  cor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', rotulo: 'Comitê' },
  ocorrencia:     { icon: Truck,           cor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',           rotulo: 'Logística' },
  demanda:        { icon: Inbox,           cor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', rotulo: 'Demanda' },
}

type Filtro = 'todos' | 'visitas' | 'negocios' | 'comite' | 'outros'
const FILTROS: [Filtro, string, EventoTipo[]][] = [
  ['todos', 'Tudo', []],
  ['visitas', 'Visitas', ['visita']],
  ['negocios', 'Negócios', ['negocio_novo', 'negocio_mov']],
  ['comite', 'Comitê', ['nota_comite', 'comite_cliente']],
  ['outros', 'Logística e demandas', ['ocorrencia', 'demanda']],
]

function quando(s: string) {
  if (!s) return '—'
  const d = s.length <= 10 ? parseISO(s) : new Date(s)
  return s.length <= 10 ? format(d, "dd/MM/yyyy", { locale: ptBR }) : format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })
}

interface Props {
  conta: Conta
  onClose: () => void
  onEditVisit?: (v: Visit) => void
  onEditDeal?: (d: Deal) => void
  onNovaVisita?: (nome: string) => void
  onNovoNegocio?: (nome: string) => void
  onChanged?: () => void
}

export default function JornadaPanel({ conta, onClose, onEditVisit, onEditDeal, onNovaVisita, onNovoNegocio, onChanged }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const { isAdmin, profile } = useAuth()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)

  const eventos = useMemo(() => eventosDaConta(conta), [conta])
  const visiveis = useMemo(() => {
    const tipos = FILTROS.find(f => f[0] === filtro)?.[2] ?? []
    return tipos.length ? eventos.filter(e => tipos.includes(e.tipo)) : eventos
  }, [eventos, filtro])
  const principal = negocioPrincipal(conta)
  const realizadas = conta.visitas.filter(v => v.status === 'Realizada').length
  const ganhos = conta.deals.filter(d => d.status === 'SUCESSO').length

  async function salvarNota() {
    if (!nota.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('crm_comite_notas').insert({
      semana_ini: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      conta: conta.chave, cliente_nome: conta.nome, client_id: conta.cliente?.id ?? null,
      deal_id: principal?.id ?? null, texto: nota.trim(), created_by_nome: profile?.nome ?? null,
    })
    setSalvando(false)
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return }
    setNota('')
    toast.success('Registro do comitê salvo')
    onChanged?.()
  }

  return (
    <div className="fixed inset-0 z-[55] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative w-full sm:max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" role="dialog" aria-label={`Jornada de ${conta.nome}`}>
        {/* Cabeçalho */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Jornada do cliente</p>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{conta.nome}</h2>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
                {conta.cliente
                  ? <span className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Building2 size={11} /> Cliente {conta.cliente.tipo ?? 'atacado'}{conta.cliente.rota ? ` · ${conta.cliente.rota}` : ''}</span>
                  : <span className="font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Prospect</span>}
                {principal && <StatusBadge status={principal.status} />}
                {responsavelDaConta(conta) && <span className="text-slate-500 inline-flex items-center gap-1"><User size={11} /> {responsavelDaConta(conta)}</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400" title="Fechar"><X size={20} /></button>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Visitas', `${realizadas}/${conta.visitas.length}`],
              ['Negócios', String(conta.deals.length)],
              ['Ganhos', String(ganhos)],
              ['Comitê', String(conta.notas.length + (conta.cliente?.comite_observacoes ? 1 : 0))],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-800 py-1.5">
                <p className="text-base font-bold text-slate-800 dark:text-slate-100 tabular-nums">{v}</p>
                <p className="text-[10px] text-slate-500">{l}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {onNovaVisita && <button onClick={() => onNovaVisita(conta.nome)} className="btn-secondary text-xs py-1.5"><Plus size={13} /> Visita</button>}
            {onNovoNegocio && <button onClick={() => onNovoNegocio(conta.nome)} className="btn-secondary text-xs py-1.5"><Plus size={13} /> Negócio</button>}
            {principal && onEditDeal && <button onClick={() => onEditDeal(principal)} className="btn-ghost text-xs py-1.5"><Pencil size={13} /> Editar negócio atual</button>}
          </div>
        </div>

        {/* Filtros */}
        <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-800 flex gap-1 overflow-x-auto">
          {FILTROS.map(([f, label]) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filtro === f ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Linha do tempo */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {visiveis.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Nada registrado aqui ainda.</p>
          ) : (
            <ol className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-3 space-y-4">
              {visiveis.map(ev => <ItemTimeline key={ev.id} ev={ev} onEditVisit={onEditVisit} onEditDeal={onEditDeal} />)}
            </ol>
          )}
        </div>

        {/* Registro do comitê */}
        {isAdmin && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 space-y-2 bg-slate-50/60 dark:bg-slate-900">
            <label className="text-[11px] font-semibold text-slate-500 inline-flex items-center gap-1"><Gavel size={12} /> Registrar no comitê</label>
            <div className="flex gap-2">
              <textarea className="input text-sm min-h-[40px] flex-1 resize-y" rows={2} value={nota} onChange={e => setNota(e.target.value)}
                placeholder="Decisão, orientação ou observação do comitê sobre este cliente..." />
              <button onClick={salvarNota} disabled={salvando || !nota.trim()} className="btn-primary text-xs self-end disabled:opacity-50">Salvar</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function ItemTimeline({ ev, onEditVisit, onEditDeal }: { ev: Evento; onEditVisit?: (v: Visit) => void; onEditDeal?: (d: Deal) => void }) {
  const est = ESTILO[ev.tipo]
  const Icon = est.icon
  const abrir = ev.visit && onEditVisit ? () => onEditVisit(ev.visit!) : ev.deal && onEditDeal ? () => onEditDeal(ev.deal!) : null
  const fotos = ev.visit?.photo_urls ?? []

  return (
    <li className="ml-5">
      <span className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white dark:ring-slate-900 ${est.cor}`}>
        <Icon size={12} />
      </span>
      <div className={`rounded-xl border border-slate-100 dark:border-slate-800 p-3 ${abrir ? 'hover:border-orange-200 dark:hover:border-orange-800/60 cursor-pointer' : ''}`}
        onClick={abrir ?? undefined}>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
          <span className={`font-bold px-1.5 py-0.5 rounded ${est.cor}`}>{est.rotulo}</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{quando(ev.data)}</span>
          {ev.por && <span className="truncate">· {ev.por}</span>}
          {ev.mov?.status_after && ev.mov.status_after !== ev.mov.status_before && <StatusBadge status={ev.mov.status_after as Deal['status']} />}
          {ev.visit?.has_amostra && <span className="inline-flex items-center gap-0.5 text-orange-600"><Gift size={11} /> Amostra</span>}
          {fotos.length > 0 && <span className="inline-flex items-center gap-0.5"><Camera size={11} /> {fotos.length}</span>}
          {ev.ocorrencia && <span className={`font-semibold ${ev.ocorrencia.status === 'resolvida' ? 'text-green-600' : 'text-red-600'}`}>{ev.ocorrencia.status}</span>}
          {ev.demanda && <span className="font-semibold">{ev.demanda.status.replace('_', ' ')}</span>}
        </div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{ev.titulo}</p>
        {ev.texto?.trim() && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap mt-0.5 line-clamp-6">{ev.texto}</p>}
        {ev.visit?.has_amostra && (ev.visit.amostra_produtos?.length ?? 0) > 0 && (
          <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Amostras:</span> {ev.visit.amostra_produtos!.join(', ')}</p>
        )}
        {fotos.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
            {fotos.slice(0, 4).map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`Foto ${i + 1}`} loading="lazy" className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
