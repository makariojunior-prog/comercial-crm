import { useState, useEffect, useCallback } from 'react'
import { Phone } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PosVendaCliente } from '../types'

export default function PosVendaWidget() {
  const [clientes, setClientes] = useState<PosVendaCliente[]>([])
  const [loading, setLoading]   = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_posvendas')
      .select('*')
      .eq('prioridade', 1)
      .order('dias_sem_contato', { ascending: false })
      .limit(50)
    setClientes((data ?? []) as PosVendaCliente[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Phone size={15} className="text-sky-500" />
          <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Pós-Venda Pendentes</h3>
        </div>
        {!loading && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            clientes.length > 0
              ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
          }`}>
            {clientes.length} pendente{clientes.length !== 1 ? 's' : ''}
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

      {!loading && clientes.length === 0 && (
        <div className="py-6 text-center text-slate-400">
          <Phone size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">Nenhum pós-venda pendente</p>
        </div>
      )}

      {!loading && clientes.length > 0 && (
        <div className="space-y-1.5">
          {clientes.slice(0, 8).map(c => (
            <a
              key={c.telefone}
              href={`https://wa.me/${c.telefone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:border-sky-200 dark:hover:border-sky-800 transition-all text-left"
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-sky-400" />
              <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1 font-medium">
                {c.nome ?? c.telefone}
              </span>
              {c.n_pedidos === 1 && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 shrink-0">
                  1º
                </span>
              )}
              <span className="text-[10px] text-slate-400 shrink-0">
                {format(parseISO(c.ult_compra), 'dd/MM')}
              </span>
              <span className={`text-[10px] font-semibold shrink-0 ${c.dias_pos_compra >= 30 ? 'text-orange-500' : 'text-slate-400'}`}>
                {c.dias_pos_compra}d
              </span>
            </a>
          ))}
          {clientes.length > 8 && (
            <p className="text-[11px] text-center text-slate-400 pt-1">
              +{clientes.length - 8} mais pendentes
            </p>
          )}
        </div>
      )}

      {clientes.length > 0 && (
        <button
          onClick={() => navigate('/varejo')}
          className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 w-full text-[11px] text-sky-500 hover:text-sky-600 text-center transition-colors"
        >
          Ver todos no Varejo → Pós-Venda
        </button>
      )}
    </div>
  )
}
