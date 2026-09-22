import { useEffect, useState, useMemo } from 'react'
import { Plus, Search, Download, RefreshCw, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { exportDeals } from '../lib/export'
import type { Deal, DealStatus } from '../types'
import DealModal from '../components/DealModal'
import DealHistoryModal from '../components/DealHistoryModal'
import KanbanBoard from '../components/KanbanBoard'
import { usePreferences } from '../contexts/PreferencesContext'

const ALL = 'TODOS'

export default function RegistroNegocios() {
  const { prefs, updateNegociosOcultarFechados } = usePreferences()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterResp, setFilterResp] = useState<string>(ALL)
  const [filterType, setFilterType] = useState<string>(ALL)
  const [sortBy, setSortBy] = useState<'date' | 'client' | 'contact' | 'priority'>('date')
  const [editDeal, setEditDeal] = useState<Deal | null | undefined>(undefined)
  const [historyDeal, setHistoryDeal] = useState<Deal | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('last_contact_date', { ascending: false, nullsFirst: false })
      .order('start_date', { ascending: false })
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

  async function moveDeal(deal: Deal, newStatus: DealStatus) {
    if (deal.status === newStatus) return
    const previous = deals
    setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
    const { error } = await supabase.from('deals').update({ status: newStatus }).eq('id', deal.id)
    if (error) {
      setDeals(previous)
      toast.error('Não foi possível mover o negócio. Tente novamente.')
      return
    }
    await supabase.from('crm_deal_history').insert({
      deal_id: deal.id,
      client_name: deal.client_name,
      status_before: deal.status,
      status_after: newStatus,
      follow_up: null,
      last_contact_date: null,
    })
  }

  const responsaveis = useMemo(() => [ALL, ...Array.from(new Set(
    deals.flatMap(d => d.responsaveis?.length ? d.responsaveis : (d.responsible ? [d.responsible] : []))
  ))], [deals])
  const types = useMemo(() => [ALL, ...Array.from(new Set(deals.map(d => d.deal_type).filter(Boolean) as string[]))], [deals])

  const PRIORITY_ORDER: Record<string, number> = { 'ALTA': 0, 'MÉDIA': 1, 'BAIXA': 2 }

  const filtered = useMemo(() => {
    const result = deals.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        d.client_name.toLowerCase().includes(q) ||
        (d.contact_name ?? '').toLowerCase().includes(q) ||
        (d.follow_up ?? '').toLowerCase().includes(q) ||
        (d.interest ?? '').toLowerCase().includes(q)
      const respArr = d.responsaveis?.length ? d.responsaveis : (d.responsible ? [d.responsible] : [])
      const matchResp = filterResp === ALL || respArr.includes(filterResp)
      const matchType = filterType === ALL || d.deal_type === filterType
      return matchSearch && matchResp && matchType
    })
    return result.sort((a, b) => {
      if (sortBy === 'client')   return a.client_name.localeCompare(b.client_name, 'pt')
      if (sortBy === 'contact')  return (a.last_contact_date ?? '').localeCompare(b.last_contact_date ?? '')
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9)
      const dateA = a.last_contact_date ?? a.start_date ?? ''
      const dateB = b.last_contact_date ?? b.start_date ?? ''
      return dateB.localeCompare(dateA)
    })
  }, [deals, search, filterResp, filterType, sortBy])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">Negócios</h1>
        <div className="flex gap-2">
          <button
            onClick={() => updateNegociosOcultarFechados(!prefs.negociosOcultarFechados)}
            className={`btn-secondary text-xs py-1.5 ${prefs.negociosOcultarFechados ? 'text-orange-600' : ''}`}
            title={prefs.negociosOcultarFechados ? 'Mostrar colunas fechadas' : 'Ocultar colunas fechadas'}
          >
            {prefs.negociosOcultarFechados ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden sm:inline">{prefs.negociosOcultarFechados ? 'Mostrar fechados' : 'Ocultar fechados'}</span>
          </button>
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
          <select className="input shrink-0 w-auto text-xs" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={filterResp} onChange={e => setFilterResp(e.target.value)}>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="input shrink-0 w-auto text-xs" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Mais recentes</option>
            <option value="contact">Último contato</option>
            <option value="client">A–Z cliente</option>
            <option value="priority">Prioridade</option>
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

      {/* Board */}
      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
      ) : (
        <KanbanBoard
          deals={filtered}
          hideClosed={prefs.negociosOcultarFechados}
          onOpenEdit={deal => setEditDeal(deal)}
          onMove={moveDeal}
          onDelete={deal => deleteDeal(deal.id)}
          onShowHistory={deal => setHistoryDeal(deal)}
        />
      )}

      {editDeal !== undefined && (
        <DealModal deal={editDeal} onClose={() => setEditDeal(undefined)} onSaved={load} />
      )}
      {historyDeal && (
        <DealHistoryModal deal={historyDeal} onClose={() => setHistoryDeal(null)} />
      )}
    </div>
  )
}
