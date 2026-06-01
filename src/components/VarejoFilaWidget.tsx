import { useState, useEffect, useCallback } from 'react'
import { ShoppingBag, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { VarejoPedido } from '../types'
import PedidoModal from './PedidoModal'

const ORIGEM_DOT: Record<string, string> = {
  'IFOOD':        'bg-red-400',
  '99FOOD':       'bg-yellow-400',
  'CARDAPIO WEB': 'bg-orange-400',
}

export default function VarejoFilaWidget() {
  const [items, setItems]         = useState<VarejoPedido[]>([])
  const [loading, setLoading]     = useState(true)
  const [editPedido, setEditPedido] = useState<VarejoPedido | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('varejo_pedidos')
      .select('*')
      .eq('status_icon', '⚠️')
      .is('turno', null)
      .eq('origem', 'CARDAPIO WEB')
      .neq('order_type', 'takeout')
      .order('created_at', { ascending: false })
      .limit(50)
    // Também exclui retiradas marcadas via entregador (não captadas pelo order_type)
    setItems((data ?? []).filter(p => p.entregador !== 'RETIRADA'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag size={15} className="text-orange-500" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Fila Varejo</h3>
        </div>
        {!loading && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            items.length > 0
              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
          }`}>
            {items.length} aguardando
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-6 text-center text-slate-400">
          <ShoppingBag size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">Nenhum pedido aguardando</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-1.5">
          {items.slice(0, 8).map(p => (
            <button
              key={p.num_pedido}
              onClick={() => setEditPedido(p)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:border-orange-200 dark:hover:border-orange-800 active:scale-[.99] transition-all text-left"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${ORIGEM_DOT[p.origem ?? ''] ?? 'bg-slate-300'}`} />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 w-12">#{p.num_pedido}</span>
              <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1">{p.cliente ?? '—'}</span>
              <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{p.bairro ?? ''}</span>
              <span className="text-[10px] text-orange-400 shrink-0">›</span>
            </button>
          ))}
          {items.length > 8 && (
            <p className="text-[11px] text-center text-slate-400 pt-1">
              +{items.length - 8} pedidos na fila
            </p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1 text-[11px] text-slate-400">
          <AlertTriangle size={11} className="text-orange-400" />
          Clique para definir turno e data de entrega
        </div>
      )}

      {editPedido && (
        <PedidoModal
          pedido={editPedido}
          onClose={() => setEditPedido(undefined)}
          onSaved={() => { setEditPedido(undefined); load() }}
        />
      )}
    </div>
  )
}
