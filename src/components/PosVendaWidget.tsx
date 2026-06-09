import { useState, useEffect, useCallback } from 'react'
import { Phone, Send } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PosVendaCliente, PosVendaInteracao } from '../types'
import PosVendaInteracaoModal from './PosVendaInteracaoModal'

export default function PosVendaWidget() {
  const [clientes, setClientes] = useState<PosVendaCliente[]>([])
  const [recomprasHoje, setRecomprasHoje] = useState<PosVendaInteracao[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState<PosVendaCliente | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const todayStart = format(new Date(), 'yyyy-MM-dd')

    // Fetch pending pos-venda
    const { data: pendentes } = await supabase
      .from('crm_posvendas')
      .select('*')
      .eq('prioridade', 1)
      .order('dias_sem_contato', { ascending: false })
      .limit(50)
    setClientes((pendentes ?? []) as PosVendaCliente[])

    // Fetch today's recompra interactions (prioridade 2)
    const { data: recompras } = await supabase
      .from('crm_posvendas_interacoes')
      .select('*')
      .gte('data_interacao', todayStart)
      .lt('data_interacao', format(new Date(new Date().getTime() + 86400000), 'yyyy-MM-dd'))
      .order('created_at', { ascending: false })
      .limit(50)

    setRecomprasHoje((recompras ?? []) as PosVendaInteracao[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Painel Esquerdo: Pós-Venda Pendentes */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-sky-500" />
            <h3 className="font-bold text-slate-700 dark:text-slate-200 text-xs">Pós-Venda</h3>
            {!loading && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                clientes.length > 0
                  ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
              }`}>
                {clientes.length}
              </span>
            )}
          </div>

          {loading && (
            <div className="space-y-1">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-6 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!loading && clientes.length === 0 && (
            <div className="py-3 text-center text-slate-400">
              <p className="text-[10px]">Nenhum</p>
            </div>
          )}

          {!loading && clientes.length > 0 && (
            <div className="space-y-1">
              {clientes.slice(0, 5).map(c => (
                <button
                  key={c.telefone}
                  onClick={() => setModal(c)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 rounded bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/50 hover:bg-sky-100 dark:hover:bg-sky-900/40 active:scale-95 transition-all text-left group"
                >
                  <span className="text-sm text-slate-600 dark:text-slate-400 truncate flex-1 font-medium">
                    {c.nome ?? c.telefone}
                  </span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {c.dias_sem_contato}d
                  </span>
                </button>
              ))}
              {clientes.length > 5 && (
                <p className="text-[9px] text-center text-slate-400">+{clientes.length - 5}</p>
              )}
            </div>
          )}
        </div>

        {/* Painel Direito: Recompras do Dia */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Send size={14} className="text-red-500" />
            <h3 className="font-bold text-slate-700 dark:text-slate-200 text-xs">Recompra Hoje</h3>
            {!loading && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                recomprasHoje.length > 0
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
              }`}>
                {recomprasHoje.length}
              </span>
            )}
          </div>

          {loading && (
            <div className="space-y-1">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-6 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
              ))}
            </div>
          )}

          {!loading && recomprasHoje.length === 0 && (
            <div className="py-3 text-center text-slate-400">
              <p className="text-[10px]">Nenhuma</p>
            </div>
          )}

          {!loading && recomprasHoje.length > 0 && (
            <div className="space-y-1">
              {recomprasHoje.slice(0, 5).map(r => (
                <div
                  key={r.id}
                  className="flex flex-col gap-0.5 px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50"
                >
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">
                    {r.nome || r.telefone}
                  </p>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {format(new Date(r.created_at), 'HH:mm')}
                    </span>
                    <span className="text-xs text-slate-400 truncate flex-1 text-right">
                      {r.usuario_nome || 'atendente'}
                    </span>
                  </div>
                </div>
              ))}
              {recomprasHoje.length > 5 && (
                <p className="text-[9px] text-center text-slate-400">+{recomprasHoje.length - 5}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {clientes.length > 0 && (
        <button
          onClick={() => navigate('/varejo')}
          className="w-full text-[10px] text-sky-500 hover:text-sky-600 text-center py-2 border-t border-slate-100 dark:border-slate-700 transition-colors"
        >
          Ver todos →
        </button>
      )}

      {modal && (
        <PosVendaInteracaoModal
          cliente={modal}
          onClose={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
