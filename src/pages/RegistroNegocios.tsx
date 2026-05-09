import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Download, RefreshCw, History, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { exportDeals } from '../lib/export'
import type { Deal, DealStatus } from '../types'
import { StatusBadge, PriorityBadge, TypeBadge } from '../components/StatusBadge'
import DealModal from '../components/DealModal'
import QuickUpdateModal from '../components/QuickUpdateModal'
import DealHistoryTimeline from '../components/DealHistory'

const ALL = 'TODOS'

export default function RegistroNegocios() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('EM ANDAMENTO')
  const [filterResp, setFilterResp] = useState<string>(ALL)
  const [filterType, setFilterType] = useState<string>(ALL)
  const [editDeal, setEditDeal] = useState<Deal | null | undefined>(undefined)
  const [quickDeal, setQuickDeal] = useState<Deal | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase.from('deals').select('*').order('start_date', { ascending: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setDeals(data as Deal[] ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteDeal(id: string) {
    if (!confirm('Excluir este negócio?')) return
    await supabase.from('deals').delete().eq('id', id)
    setDeals(d => d.filter(x => x.id !== id))
  }

  const responsaveis = [ALL, ...Array.from(new Set(deals.map(d => d.responsible).filter(Boolean) as string[]))]
  const types = [ALL, ...Array.from(new Set(deals.map(d => d.deal_type).filter(Boolean) as string[]))]
  const statuses = [ALL, 'NOVO', 'EM ANDAMENTO', 'SUCESSO', 'DESISTIU', 'CANCELADO']

  const filtered = deals.filter(d => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      d.client_name.toLowerCase().includes(q) ||
      (d.contact_name ?? '').toLowerCase().includes(q) ||
      (d.follow_up ?? '').toLowerCase().includes(q) ||
      (d.interest ?? '').toLowerCase().includes(q)
    const matchStatus = filterStatus === ALL || d.status === filterStatus
    const matchResp = filterResp === ALL || d.responsible === filterResp
    const matchType = filterType === ALL || d.deal_type === filterType
    return matchSearch && matchStatus && matchResp && matchType
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">Registro de Negócios</h1>
        <div className="flex gap-2">
          <button onClick={() => { try { exportDeals(filtered) } catch { alert('Erro ao exportar Excel') } }} className="btn-secondary text-xs py-1.5" title="Exportar para Excel">
            <Download size={14} /> Excel
          </button>
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditDeal(null)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Novo</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar cliente, contato ou acompanhamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select className="input shrink-0 w-auto text-xs" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-400">{filtered.length} de {deals.length} negócios</p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> Erro ao carregar: {loadError}
          <button onClick={load} className="ml-auto text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">Nenhum negócio encontrado</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(deal => (
            <DealRow
              key={deal.id}
              deal={deal}
              onEdit={() => setEditDeal(deal)}
              onQuickUpdate={() => setQuickDeal(deal)}
              onDelete={() => deleteDeal(deal.id)}
            />
          ))}
        </div>
      )}

      {editDeal !== undefined && (
        <DealModal deal={editDeal} onClose={() => setEditDeal(undefined)} onSaved={load} />
      )}
      {quickDeal && (
        <QuickUpdateModal deal={quickDeal} onClose={() => setQuickDeal(null)} onSaved={load} />
      )}
    </div>
  )
}

function DealRow({
  deal, onEdit, onQuickUpdate, onDelete,
}: {
  deal: Deal; onEdit: () => void; onQuickUpdate: () => void; onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const startDate = deal.start_date ? format(parseISO(deal.start_date), 'dd/MM/yy', { locale: ptBR }) : '-'
  const lastContact = deal.last_contact_date ? format(parseISO(deal.last_contact_date), 'dd/MM/yy', { locale: ptBR }) : '-'
  const isActive = deal.status === 'NOVO' || deal.status === 'EM ANDAMENTO'

  return (
    <div className={`card overflow-hidden ${!isActive ? 'opacity-75' : ''}`}>
      {/* Main row */}
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50"
        onClick={() => { setExpanded(!expanded); setShowHistory(false) }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={deal.status} />
            <TypeBadge type={deal.deal_type} />
            <PriorityBadge priority={deal.priority} />
          </div>
          <p className="font-semibold text-slate-800">{deal.client_name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
            <span>{deal.responsible}</span>
            <span>Início: {startDate}</span>
            <span>Contato: {lastContact}</span>
          </div>
        </div>
        <div className="text-slate-400 text-lg select-none">{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-3">
          {deal.contact_name && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contato</p>
              {deal.contact_phone ? (
                <a href={`https://wa.me/${(d => d.startsWith('55') ? d : '55' + d)(deal.contact_phone.replace(/\D/g, ''))}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline">
                  📱 {deal.contact_name} · {deal.contact_phone}
                </a>
              ) : (
                <p className="text-sm text-slate-700">{deal.contact_name}</p>
              )}
            </div>
          )}
          {deal.interest && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Interesse</p>
              <p className="text-sm text-slate-700">{deal.interest}</p>
            </div>
          )}
          {deal.follow_up && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Acompanhamento</p>
              <p className="text-sm text-slate-700">{deal.follow_up}</p>
            </div>
          )}
          {deal.potential_notes && (
            <div>
              <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide">⚠️ Potencial não atendido</p>
              <p className="text-sm text-slate-700">{deal.potential_notes}</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap pt-1">
            {isActive && (
              <button onClick={e => { e.stopPropagation(); onQuickUpdate() }} className="btn-primary text-xs py-1.5">
                ✏️ Atualizar
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onEdit() }} className="btn-secondary text-xs py-1.5">
              <Pencil size={12} /> Editar
            </button>
            <button
              onClick={e => { e.stopPropagation(); setShowHistory(!showHistory) }}
              className="btn-ghost text-xs py-1.5"
            >
              <History size={12} /> Histórico
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }} className="btn-danger text-xs py-1.5">
              <Trash2 size={12} />
            </button>
          </div>

          {showHistory && (
            <div className="pt-2 border-t border-slate-200">
              <DealHistoryTimeline dealId={deal.id} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
