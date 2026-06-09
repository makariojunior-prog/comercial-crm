import { useState, useEffect } from 'react'
import { X, ShoppingBag, Calendar, Briefcase, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Props {
  clientId: string
  clienteName: string
  onClose: () => void
}

interface HistoryItem {
  type: 'pedido_atacado' | 'pedido_varejo' | 'visita' | 'negocio' | 'agenda'
  id: string
  date: string
  title: string
  subtitle: string
  details?: Record<string, any>
}

export default function ClientHistoryModal({ clientId, clienteName, onClose }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadHistory()
  }, [clientId])

  async function loadHistory() {
    setLoading(true)
    const allItems: HistoryItem[] = []

    try {
      // Pedidos Atacado
      const { data: atacadoPedidos } = await supabase
        .from('atacado_pedidos')
        .select('*')
        .eq('crm_client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(100)

      for (const p of atacadoPedidos ?? []) {
        allItems.push({
          type: 'pedido_atacado',
          id: `ata-${p.id}`,
          date: p.data_entrega || p.created_at,
          title: `Pedido #${p.numero_pedido || p.id_venda}`,
          subtitle: `R$ ${p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          details: p,
        })
      }

      // Pedidos Varejo
      const { data: varejoPedidos } = await supabase
        .from('varejo_pedidos')
        .select('*')
        .eq('cliente', clienteName)
        .order('created_at', { ascending: false })
        .limit(100)

      for (const p of varejoPedidos ?? []) {
        allItems.push({
          type: 'pedido_varejo',
          id: `var-${p.id}`,
          date: p.data_entrega || p.created_at,
          title: `Pedido #${p.num_pedido}`,
          subtitle: p.status || '—',
          details: p,
        })
      }

      // Visitas
      const { data: visitas } = await supabase
        .from('visits')
        .select('*')
        .eq('client_name', clienteName)
        .order('visit_date', { ascending: false })
        .limit(100)

      for (const v of visitas ?? []) {
        allItems.push({
          type: 'visita',
          id: `vis-${v.id}`,
          date: v.visit_date,
          title: `Visita: ${v.visit_type}`,
          subtitle: v.notes || '—',
          details: v,
        })
      }

      // Negócios
      const { data: negocios } = await supabase
        .from('deals')
        .select('*')
        .eq('client_name', clienteName)
        .order('created_at', { ascending: false })
        .limit(100)

      for (const n of negocios ?? []) {
        allItems.push({
          type: 'negocio',
          id: `neg-${n.id}`,
          date: n.created_at,
          title: `Negócio: ${n.deal_type}`,
          subtitle: `Status: ${n.status}`,
          details: n,
        })
      }

      // Agenda
      const { data: agenda } = await supabase
        .from('agenda_compromissos')
        .select('*')
        .eq('cliente_nome', clienteName)
        .order('data', { ascending: false })
        .limit(100)

      for (const a of agenda ?? []) {
        allItems.push({
          type: 'agenda',
          id: `age-${a.id}`,
          date: a.data,
          title: `${a.tipo}: ${a.titulo}`,
          subtitle: a.observacoes || '—',
          details: a,
        })
      }

      // Sort all by date descending
      allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setItems(allItems)
    } catch (err) {
      console.error('Error loading history:', err)
    } finally {
      setLoading(false)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'pedido_atacado':
      case 'pedido_varejo':
        return <ShoppingBag size={16} />
      case 'visita':
        return <MapPin size={16} />
      case 'negocio':
        return <Briefcase size={16} />
      case 'agenda':
        return <Calendar size={16} />
      default:
        return null
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'pedido_atacado':
        return 'Ped. Atacado'
      case 'pedido_varejo':
        return 'Ped. Varejo'
      case 'visita':
        return 'Visita'
      case 'negocio':
        return 'Negócio'
      case 'agenda':
        return 'Agenda'
      default:
        return type
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'pedido_atacado':
        return 'bg-purple-100 text-purple-700'
      case 'pedido_varejo':
        return 'bg-green-100 text-green-700'
      case 'visita':
        return 'bg-amber-100 text-amber-700'
      case 'negocio':
        return 'bg-indigo-100 text-indigo-700'
      case 'agenda':
        return 'bg-teal-100 text-teal-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">Histórico do Cliente</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{clienteName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-slate-500">Carregando histórico...</div>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">Nenhum registro encontrado para este cliente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {/* Summary */}
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <div className="text-slate-400 dark:text-slate-500 shrink-0">
                      {getIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">
                          {item.title}
                        </p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${getTypeColor(item.type)}`}>
                          {getTypeLabel(item.type)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.date)}</p>
                    </div>
                    <div className="text-slate-400 dark:text-slate-500 shrink-0">
                      {expandedId === item.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {/* Details */}
                  {expandedId === item.id && item.details && (
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-xs space-y-1">
                      {Object.entries(item.details)
                        .filter(([key]) => !['id', 'crm_client_id', 'cliente_id', 'created_at', 'updated_at'].includes(key))
                        .map(([key, value]) => {
                          const displayValue = value === null || value === undefined || value === '' ? '—' :
                            typeof value === 'object' ? JSON.stringify(value) :
                            typeof value === 'boolean' ? (value ? 'Sim' : 'Não') :
                            String(value).substring(0, 100)
                          return (
                            <div key={key} className="flex gap-2">
                              <span className="font-medium text-slate-600 dark:text-slate-400 min-w-[100px]">
                                {key.replace(/_/g, ' ')}:
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 break-words flex-1">
                                {displayValue}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total de {items.length} registr{items.length !== 1 ? 'os' : 'o'} encontrado{items.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
