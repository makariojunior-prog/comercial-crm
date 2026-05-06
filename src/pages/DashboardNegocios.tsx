import { useEffect, useState } from 'react'
import { Plus, AlertTriangle, Phone, RefreshCw, TrendingUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Deal, DealStatus } from '../types'
import { StatusBadge, PriorityBadge, TypeBadge, isStale, daysSince } from '../components/StatusBadge'
import QuickUpdateModal from '../components/QuickUpdateModal'
import DealModal from '../components/DealModal'

export default function DashboardNegocios() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quickDeal, setQuickDeal] = useState<Deal | null>(null)
  const [newDeal, setNewDeal] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('start_date', { ascending: false })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setDeals(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const active = deals.filter(d => d.status === 'NOVO' || d.status === 'EM ANDAMENTO')
  const stale = active.filter(d => isStale(d))
  const success = deals.filter(d => d.status === 'SUCESSO')
  const total = deals.filter(d => d.status !== null).length
  const convRate = total > 0 ? Math.round((success.length / total) * 100) : 0

  const novo = active.filter(d => d.status === 'NOVO')
  const emAndamento = active.filter(d => d.status === 'EM ANDAMENTO')

  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 capitalize">{today}</p>
          <h1 className="text-xl font-bold text-slate-800">Dashboard Negócios</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setNewDeal(true)} className="btn-primary">
            <Plus size={16} />
            <span className="hidden sm:inline">Novo</span>
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Ativos" value={active.length} color="amber" />
        <MetricCard label="Novos" value={novo.length} color="blue" />
        <MetricCard label="Sucesso" value={success.length} color="green" />
        <MetricCard label="Conversão" value={`${convRate}%`} color="purple" />
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> Erro ao carregar dados: {loadError}
          <button onClick={load} className="ml-auto text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* Alertas */}
      {stale.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-500" />
            <p className="font-semibold text-red-700 text-sm">{stale.length} negócio{stale.length > 1 ? 's' : ''} sem contato há mais de 7 dias</p>
          </div>
          <div className="space-y-2">
            {stale.map(d => (
              <AlertDealRow key={d.id} deal={d} onUpdate={() => setQuickDeal(d)} />
            ))}
          </div>
        </div>
      )}

      {/* Ativos por status */}
      {active.length === 0 && !loading && (
        <div className="card p-8 text-center text-slate-400">
          <TrendingUp size={32} className="mx-auto mb-2 opacity-40" />
          <p>Nenhum negócio ativo</p>
          <button onClick={() => setNewDeal(true)} className="btn-primary mt-3 mx-auto">
            <Plus size={16} /> Criar primeiro negócio
          </button>
        </div>
      )}

      {novo.length > 0 && (
        <Section title="🔵 Novos" count={novo.length}>
          {novo.map(d => <DealCard key={d.id} deal={d} onUpdate={() => setQuickDeal(d)} />)}
        </Section>
      )}

      {emAndamento.length > 0 && (
        <Section title="🟡 Em Andamento" count={emAndamento.length}>
          {emAndamento.map(d => <DealCard key={d.id} deal={d} onUpdate={() => setQuickDeal(d)} />)}
        </Section>
      )}

      {/* Modals */}
      {quickDeal && (
        <QuickUpdateModal deal={quickDeal} onClose={() => setQuickDeal(null)} onSaved={load} />
      )}
      {newDeal && (
        <DealModal onClose={() => setNewDeal(false)} onSaved={load} />
      )}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-75">{label}</p>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-slate-700 text-sm">{title}</h2>
        <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AlertDealRow({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const days = daysSince(deal.last_contact_date)
  return (
    <button
      onClick={onUpdate}
      className="w-full flex items-center justify-between bg-white rounded-lg px-3 py-2.5 border border-red-100 hover:bg-red-50 active:scale-[.99] transition-all text-left"
    >
      <div className="min-w-0">
        <p className="font-medium text-sm text-slate-800 truncate">{deal.client_name}</p>
        <p className="text-xs text-red-500">{days} dias sem contato · {deal.responsible}</p>
      </div>
      <span className="text-xs text-orange-500 font-semibold shrink-0 ml-3">Toque para atualizar →</span>
    </button>
  )
}

function DealCard({ deal, onUpdate }: { deal: Deal; onUpdate: () => void }) {
  const days = daysSince(deal.last_contact_date)
  const stale = isStale(deal)

  return (
    <button
      onClick={onUpdate}
      className={`card p-4 w-full text-left transition-all hover:shadow-md active:scale-[.99] ${stale ? 'border-red-200' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <TypeBadge type={deal.deal_type} />
            <PriorityBadge priority={deal.priority} />
          </div>
          <p className="font-semibold text-slate-800">{deal.client_name}</p>
          {deal.contact_name && (
            <p className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
              <Phone size={11} />
              {deal.contact_name}
              {deal.contact_phone && ` · ${deal.contact_phone}`}
            </p>
          )}
          {deal.follow_up && (
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 italic">"{deal.follow_up}"</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-400">{deal.responsible}</span>
            <span className={`text-xs font-medium ${stale ? 'text-red-500' : 'text-slate-400'}`}>
              {days === 0 ? '🟢 Hoje' : stale ? `⚠️ ${days}d sem contato` : `${days}d`}
            </span>
            {deal.last_contact_date && (
              <span className="text-xs text-slate-400">
                {format(parseISO(deal.last_contact_date), 'dd/MM', { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-orange-400 font-semibold shrink-0 mt-1">Toque →</span>
      </div>
    </button>
  )
}
